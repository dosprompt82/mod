import { notFound } from "next/navigation";
import { Report } from "../../../../../../components/Report";
import { byKind, context } from "../../../../../../lib/data";

export default async function CatchUp({ params }: { params: Promise<{ show: string; pos: string }> }) {
  const { show, pos } = await params;
  const c = context(show, pos);
  if (!c) notFound();
  const seasons = byKind(c, "seasonRecap");
  const recaps = byKind(c, "episodeRecap").filter((r) => !seasons.some((s) => s.body.season === r.body.season));
  if (!seasons.length && !recaps.length) return <p className="muted">Finish an episode and its recap will appear here.</p>;
  return (
    <div className="space-y-4">
      {seasons.length > 0 && (
        <section className="card">
          <h2 className="font-medium">The 60-second version</h2>
          <div className="mt-2 space-y-3 text-sm leading-6">
            {seasons.map((s) => <p key={s.id}><strong>Season {s.body.season as number}.</strong> {s.body.sixtySeconds as string}</p>)}
          </div>
        </section>
      )}
      {seasons.map((s) => (
        <details key={s.id} className="card">
          <summary className="cursor-pointer font-medium">Season {s.body.season as number}, episode by episode</summary>
          <ol className="mt-3 space-y-3 text-sm leading-6">
            {byKind(c, "episodeRecap").filter((r) => r.body.season === s.body.season).map((r) => (
              <li key={r.id}><strong>E{r.body.episode as number}.</strong> {r.body.short as string} <Report show={show} contentId={r.id} pos={pos} /></li>
            ))}
          </ol>
        </details>
      ))}
      {recaps.length > 0 && (
        <section className="card">
          <h2 className="font-medium">This season so far</h2>
          <ol className="mt-3 space-y-3 text-sm leading-6">
            {recaps.map((r) => <li key={r.id}><strong>S{r.body.season as number}E{r.body.episode as number}.</strong> {r.body.short as string} <Report show={show} contentId={r.id} pos={pos} /></li>)}
          </ol>
        </section>
      )}
    </div>
  );
}
