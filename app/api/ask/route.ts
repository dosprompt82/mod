import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { context } from "../../../lib/data";
import { answer, rateLimited } from "../../../lib/ask";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { show?: string; pos?: string; question?: string };
  const q = (body.question ?? "").trim().slice(0, 500);
  const c = body.show && body.pos ? context(body.show, body.pos) : null;
  if (!c || !q) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const visitor = (await cookies()).get("vid")?.value ?? req.headers.get("x-forwarded-for") ?? "anon";
  if (rateLimited(visitor)) return NextResponse.json({ error: "You've asked a lot. Try again in a bit." }, { status: 429 });
  try {
    const { text } = await answer(c, q);
    // Streamed to the client only after the full answer has passed the spoiler scan.
    return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "The assistant is unavailable right now." }, { status: 502 });
  }
}
