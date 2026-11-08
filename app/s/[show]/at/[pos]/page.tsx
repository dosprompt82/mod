import Link from "next/link";
import { notFound } from "next/navigation";
import { byKind, cards, context } from "../../../../../lib/data";

export default async function AtHome({ params }: { params: Promise<{ show: string; pos: string }> }) {
  const { show, pos } = await params;
  const c = context(show, pos);
  if (!c) notFound();
  const base = `/s/${show}/at/${pos}`;
  const prev = byKind(c, "previously").at(-1);
  const tiles = [
    ["Catch me up", "Season and episode recaps up to where you are.", "/catch-up"],
    ["Who's who", `${cards(c).length} characters you've met so far.`, "/people"],
    ["Ask", "\"What just happened?\" Answers use only what you've seen.", "/ask"],
  ] as const;
  return (
    <div className="space-y-4">
      {prev && (
        <section className="card">
          <h2 className="font-medium">Previously</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{(prev.body.threads as string[]).map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map(([t, d, href]) => (
          <Link key={t} href={base + href} className="card block no-underline hover:border-stone-400">
            <span className="font-medium">{t}</span>
            <span className="muted mt-1 block text-sm">{d}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
