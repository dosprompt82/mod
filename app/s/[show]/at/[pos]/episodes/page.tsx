import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { byKind, context, isFinished } from "../../../../../../lib/data";
import { episodesInOrder } from "../../../../../../src/spoiler";

export default async function Episodes({ params, searchParams }: { params: Promise<{ show: string; pos: string }>; searchParams: Promise<{ titles?: string }> }) {
  const { show, pos } = await params;
  const c = context(show, pos);
  if (!c) notFound();
  // Unwatched titles are hidden by default because titles can spoil (setting: ?titles=1).
  const reveal = (await searchParams).titles === "1" || (await cookies()).get("showTitles")?.value === "1";
  const titles = new Map(byKind(c, "episodeTitle").map((t) => [`${t.body.season}-${t.body.episode}`, t.body.title as string]));
  const recaps = new Map(byKind(c, "episodeRecap").map((r) => [`${r.body.season}-${r.body.episode}`, r.body.short as string]));
  const eps = episodesInOrder(c.content.show);
  return (
    <div className="space-y-3">
      <p className="muted text-xs">{reveal ? <a href="?">Hide unwatched titles</a> : <a href="?titles=1">Show unwatched titles (they can spoil)</a>}</p>
      {c.content.show.seasons.map((s) => (
        <section key={s.number} className="card">
          <h2 className="font-medium">Season {s.number}</h2>
          <ol className="mt-2 space-y-2 text-sm">
            {eps.filter((e) => e.season === s.number).map((e) => {
              const k = `${e.season}-${e.number}`;
              const title = titles.get(k) ?? (reveal ? e.title : null);
              return (
                <li key={k}>
                  {isFinished(c, e.season, e.number) && recaps.has(k) ? (
                    <details><summary className="cursor-pointer">E{e.number}. {title}</summary><p className="mt-1 leading-6">{recaps.get(k)}</p></details>
                  ) : <span className="muted">E{e.number}{title ? `. ${title}` : ""}</span>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
