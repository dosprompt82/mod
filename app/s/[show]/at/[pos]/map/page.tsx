import { notFound } from "next/navigation";
import { cards, context } from "../../../../../../lib/data";

const COLORS: Record<string, string> = { family: "#0f766e", romance: "#be123c", work: "#57534e", alliance: "#1d4ed8", conflict: "#b45309" };

export default async function MapPage({ params }: { params: Promise<{ show: string; pos: string }> }) {
  const { show, pos } = await params;
  const c = context(show, pos);
  if (!c) notFound();
  const people = cards(c);
  const n = people.length, R = 150, cx = 200, cy = 200;
  const at = new Map(people.map((p, i) => [p.id, { x: cx + R * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), y: cy + R * Math.sin((2 * Math.PI * i) / n - Math.PI / 2) }]));
  const edges = people.flatMap((p) => p.relationships.filter((r) => p.id < r.other).map((r) => ({ a: p.id, b: r.other, ...r })));
  if (!n) return <p className="muted">No characters yet.</p>;
  return (
    <div className="space-y-4">
      <svg viewBox="0 0 400 400" className="card w-full" role="img" aria-label="Relationship map">
        {edges.map((e) => { const a = at.get(e.a)!, b = at.get(e.b)!; return <line key={e.a + e.b} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COLORS[e.kind]} strokeWidth={1.5} />; })}
        {people.map((p) => { const q = at.get(p.id)!; return (
          <g key={p.id}><circle cx={q.x} cy={q.y} r={5} className="fill-stone-900 dark:fill-stone-100" />
            <text x={q.x} y={q.y - 9} textAnchor="middle" fontSize={9} className="fill-stone-700 dark:fill-stone-300">{p.name.split(" ").at(-1)}</text></g>); })}
      </svg>
      <ul className="space-y-1 text-sm">
        {edges.map((e) => <li key={e.a + e.b}><span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS[e.kind] }} /> {people.find((p) => p.id === e.a)!.name} – {people.find((p) => p.id === e.b)!.name}: {e.label}</li>)}
      </ul>
    </div>
  );
}
