import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { context } from "../../../lib/data";
import { append } from "../../../lib/store";

export async function PUT(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { show?: string; pos?: string };
  const c = b.show && b.pos ? context(b.show, b.pos) : null;
  if (!c) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const jar = await cookies();
  let vid = jar.get("vid")?.value;
  if (!vid) { vid = crypto.randomUUID(); jar.set("vid", vid, { httpOnly: true, sameSite: "lax", maxAge: 31536000, path: "/" }); }
  jar.set(`pos_${c.slug}`, b.pos!, { sameSite: "lax", maxAge: 31536000, path: "/" });
  append("positions", { user: vid, show: c.slug, ord: c.ord, updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
