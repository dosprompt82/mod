import Link from "next/link";
import { notFound } from "next/navigation";
import { Report } from "../../../../../../../components/Report";
import { cards, context, episodeLabel } from "../../../../../../../lib/data";

export default async function Person({ params }: { params: Promise<{ show: string; pos: string; id: string }> }) {
  const { show, pos, id } = await params;
  const c = context(show, pos);
  if (!c) notFound();
  const all = cards(c);
  const p = all.find((x) => x.id === id);
  if (!p) notFound(); // a character not yet introduced does not exist
  const name = (oid: string) => all.find((x) => x.id === oid)?.name ?? oid;
  const intro = c.items.find((i) => i.id === `character:${id}`)!;
  return (
    <article className="space-y-4">
      <header className="card">
        <h1 className="text-xl font-semibold">{p.name}</h1>
        <p className="text-sm">{p.role}</p>
        <p className="muted text-xs">Played by {p.actor} · first seen {episodeLabel(c, intro.revealOrd)}</p>
      </header>
      {p.facts.length > 0 && (
        <section className="card">
          <h2 className="font-medium">What you know</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {p.facts.map((f) => <li key={f.id}>{f.text} <span className="chip">{episodeLabel(c, f.revealOrd)}</span> <Report show={show} contentId={f.id} pos={pos} /></li>)}
          </ul>
        </section>
      )}
      {p.relationships.length > 0 && (
        <section className="card">
          <h2 className="font-medium">Relationships</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {p.relationships.map((r) => <li key={r.other}><Link href={`/s/${show}/at/${pos}/people/${r.other}`}>{name(r.other)}</Link>: {r.label}</li>)}
          </ul>
        </section>
      )}
    </article>
  );
}
