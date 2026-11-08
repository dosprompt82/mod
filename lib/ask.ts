import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { scanAnswer } from "../src/spoiler";
import { cards, episodeLabel, type Ctx, byKind } from "./data";
import { append } from "./store";

export const NEUTRAL = "I can only talk about what you've already watched. Ask me about anything up to your current episode.";
const MODEL = process.env.ASK_MODEL ?? "claude-opus-5-5";

/** Questions about the future get a fixed, neutral reply with no change in tone. */
const FUTURE = /\b(will|gonna|going to|eventually|later|next season|future|end up|ever (find|get|become)|does .{1,40} (die|survive|find out|win|lose|come back|return)|is .{1,40} (dead|alive|going)|what happens (next|to|after|in the end)|how does (it|the show|season \d) end|spoil|season [5-9])\b/i;
export const isFutureQuestion = (q: string) => FUTURE.test(q);

/** Grounding notes built only from gated items (reveal_ord <= position). */
export function notes(c: Ctx): string {
  const lines: string[] = [];
  for (const s of byKind(c, "seasonRecap")) lines.push(`[Season ${s.body.season} summary] ${s.body.sixtySeconds}`);
  for (const r of byKind(c, "episodeRecap")) lines.push(`[S${r.body.season}E${r.body.episode}] ${r.body.short}`);
  for (const p of cards(c)) {
    lines.push(`[Character] ${p.name} (${p.actor})${p.role ? `: ${p.role}` : ""}`);
    for (const f of p.facts) lines.push(`  - ${f.text} (${episodeLabel(c, f.revealOrd)})`);
    for (const r of p.relationships) lines.push(`  - Relationship with ${cards(c).find((x) => x.id === r.other)?.name}: ${r.label}`);
  }
  return lines.join("\n");
}

function system(c: Ctx): string {
  const where = `Season ${c.pos.season}, Episode ${c.pos.episode}`;
  return `You are a spoiler-free companion for the TV show ${c.content.show.title}. The viewer is at ${where}.
Answer only from the NOTES below. If the notes don't answer the question, say you don't know yet and suggest a related question the notes do answer.
Never use your own knowledge of the show, its actors' later work, interviews or future seasons, even if you are certain.
Never speculate about what happens next, never hint (no "keep watching", "you'll see"), and never confirm or deny guesses about the future.
Cite the episode for each claim, like (S2E3). Keep answers under 120 words, in plain prose.

NOTES:
${notes(c)}`;
}

const visits = new Map<string, number[]>();
let monthKey = "", monthCount = 0;
export function rateLimited(visitor: string): boolean {
  const now = Date.now();
  const recent = (visits.get(visitor) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= Number(process.env.ASK_HOURLY_LIMIT ?? 30)) return true;
  const mk = new Date().toISOString().slice(0, 7);
  if (mk !== monthKey) { monthKey = mk; monthCount = 0; }
  if (monthCount >= Number(process.env.ASK_MONTHLY_LIMIT ?? 20000)) return true;
  recent.push(now); visits.set(visitor, recent); monthCount++;
  return false;
}

/** Generate, scan with the show's spoiler rules, and only then return. */
export async function answer(c: Ctx, question: string): Promise<{ text: string; flagged: boolean }> {
  if (isFutureQuestion(question)) return log(c, question, NEUTRAL, false);
  if (!process.env.ANTHROPIC_API_KEY) return log(c, question, "The assistant isn't configured yet (missing ANTHROPIC_API_KEY).", false);
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [{ type: "text", text: system(c), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: question }],
  } as Parameters<typeof client.beta.messages.stream>[0]);
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") return log(c, question, NEUTRAL, true);
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  const leaks = scanAnswer(c.content, text, c.ord);
  return leaks.length ? log(c, question, NEUTRAL, true, text) : log(c, question, text, false);
}

function log(c: Ctx, question: string, text: string, flagged: boolean, raw?: string) {
  append("ai_logs", { show: c.slug, positionOrd: c.ord, question, answer: raw ?? text, flagged, createdAt: new Date().toISOString() });
  return { text, flagged };
}
