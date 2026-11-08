import { compile, type ContentItem } from "./compile";
import { episodesInOrder, ord } from "./position";
import type { ShowContent, SpoilerRule } from "./types";

export interface Finding { check: "structure" | "reference" | "rule" | "always-visible"; itemId: string; message: string }

/** Every text visible at or after `itemOrd` is scanned: a match before the rule's revealAt is a leak. */
export function ruleLeaks(text: string, textOrd: number, rules: readonly { rule: SpoilerRule; revealOrd: number }[]): string[] {
  return rules.filter((r) => textOrd < r.revealOrd && new RegExp(r.rule.pattern.source, r.rule.pattern.flags.replace("g", "")).test(text)).map((r) => r.rule.name);
}

/**
 * The spoiler audit (runs in CI and before every publish). A failed audit blocks publishing;
 * there is no override flag. Checks: structure, reference, rule, always-visible.
 */
export function audit(c: ShowContent): Finding[] {
  const f: Finding[] = [];
  const { show } = c;
  const safeOrd = (p: Parameters<typeof ord>[1], id: string): number | null => {
    try { return ord(show, p); } catch (e) { f.push({ check: "structure", itemId: id, message: (e as Error).message }); return null; }
  };

  // Structure: reveal points inside the episode range; every fact has a source.
  const eps = episodesInOrder(show);
  if (eps.length === 0) f.push({ check: "structure", itemId: show.slug, message: "Show has no episodes" });
  const ids = new Set<string>();
  const intro = new Map<string, number>();
  for (const ch of c.characters) {
    if (ids.has(ch.id)) f.push({ check: "structure", itemId: ch.id, message: "Duplicate character id" });
    ids.add(ch.id);
    const o = safeOrd(ch.introducedAt, ch.id);
    if (o !== null) intro.set(ch.id, o);
  }
  for (const ch of c.characters) {
    const io = intro.get(ch.id);
    ch.roles.forEach((r, i) => {
      const o = safeOrd(r.revealAt, `role:${ch.id}:${i}`);
      if (o !== null && io !== undefined && o < io) f.push({ check: "reference", itemId: `role:${ch.id}:${i}`, message: "Role revealed before the character is introduced" });
    });
    for (const fact of ch.facts) {
      if (fact.source.length === 0) f.push({ check: "structure", itemId: fact.id, message: "Fact has no source" });
      const o = safeOrd(fact.revealAt, fact.id);
      if (o === null) continue;
      // Reference check: every mentioned character (and the owner) must be introduced by revealAt.
      for (const m of new Set([ch.id, ...fact.mentions])) {
        const mo = intro.get(m);
        if (mo === undefined) f.push({ check: "reference", itemId: fact.id, message: `Mentions unknown character "${m}"` });
        else if (o < mo) f.push({ check: "reference", itemId: fact.id, message: `Mentions "${m}" before their introduction` });
      }
    }
  }
  for (const rel of c.relationships) {
    rel.versions.forEach((v, i) => {
      const id = `relationship:${rel.a}:${rel.b}:${i}`;
      const o = safeOrd(v.revealAt, id);
      for (const m of [rel.a, rel.b]) {
        const mo = intro.get(m);
        if (mo === undefined) f.push({ check: "reference", itemId: id, message: `Unknown character "${m}"` });
        else if (o !== null && o < mo) f.push({ check: "reference", itemId: id, message: `"${m}" not yet introduced` });
      }
    });
  }
  const rules = c.spoilerRules.flatMap((rule) => {
    const o = safeOrd(rule.revealAt, `rule:${rule.name}`);
    return o === null ? [] : [{ rule, revealOrd: o }];
  });
  if (f.some((x) => x.check === "structure")) return f; // cannot compile reliably

  // Rule check: every compiled text, at the position it first becomes visible.
  const items: ContentItem[] = compile(c);
  for (const it of items) {
    for (const t of it.text) for (const name of ruleLeaks(t, it.revealOrd, rules)) {
      f.push({ check: "rule", itemId: it.id, message: `Matches spoiler rule "${name}" before it is revealed` });
    }
  }
  // Always-visible check: description, titles (shown by setting), names, role lines at position zero.
  const always: [string, string][] = [
    ["show:description", show.description], ["show:title", show.title],
    ...eps.map((e) => [`title:s${e.season}e${e.number}`, e.title] as [string, string]),
    ...c.characters.flatMap((ch) => [[`character:${ch.id}`, ch.name] as [string, string], ...ch.roles.map((r, i) => [`role:${ch.id}:${i}`, r.text] as [string, string])]),
  ];
  for (const [id, t] of always) for (const name of ruleLeaks(t, -1, rules)) {
    f.push({ check: "always-visible", itemId: id, message: `Always-visible text matches spoiler rule "${name}"` });
  }
  return f;
}

/** AI output check: scan a generated answer against the rules at the viewer's position. */
export function scanAnswer(c: ShowContent, answer: string, positionOrd: number): string[] {
  const rules = c.spoilerRules.map((rule) => ({ rule, revealOrd: ord(c.show, rule.revealAt) }));
  return ruleLeaks(answer, positionOrd, rules);
}
