import Link from "next/link";
import { notFound } from "next/navigation";
import { cards, context } from "../../../../../../lib/data";
import { searchCharacters } from "../../../../../../src/spoiler";

export default async function People({ params, searchParams }: { params: Promise<{ show: string; pos: string }>; searchParams: Promise<{ q?: string; group?: string }> }) {
  const { show, pos } = await params;
  const { q = "", group = "" } = await searchParams;
  const c = context(show, pos);
  if (!c) notFound();
  const all = cards(c);
  const groups = [...new Set(all.map((x) => x.group).filter(Boolean))] as string[];
  const search = q ? searchCharacters(c.items, q) : null;
  const shown = all.filter((x) => (!search || search.matches.some((m) => m.id === x.id)) && (!group || x.group === group));
  return (
    <div className="space-y-4">
      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Search characters" aria-label="Search characters" className="flex-1 rounded-lg border border-stone-300 bg-transparent px-3 py-2 text-sm dark:border-stone-700" />
        <button className="btn">Search</button>
      </form>
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="?" className="chip no-underline">All</Link>
        {groups.map((g) => <Link key={g} href={`?group=${encodeURIComponent(g)}`} className="chip no-underline">{g}</Link>)}
      </div>
      {search?.message ? <p className="muted">{search.message}</p> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((p) => (
            <li key={p.id}>
              <Link href={`/s/${show}/at/${pos}/people/${p.id}`} className="card block no-underline hover:border-stone-400">
                <span className="font-medium">{p.name}</span>
                <span className="muted block text-sm">{p.role ?? ""}</span>
                <span className="muted block text-xs">{p.actor}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
