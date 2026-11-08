import { NextResponse } from "next/server";
import { context } from "../../../lib/data";
import { append } from "../../../lib/store";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { show?: string; contentId?: string; pos?: string; note?: string };
  const c = b.show && b.pos ? context(b.show, b.pos) : null;
  if (!c || !b.contentId || !c.items.some((i) => i.id === b.contentId)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  append("spoiler_reports", { id: crypto.randomUUID(), contentId: b.contentId, show: c.slug, positionOrd: c.ord, note: (b.note ?? "").slice(0, 1000), createdAt: new Date().toISOString(), status: "open" });
  return NextResponse.json({ ok: true });
}
