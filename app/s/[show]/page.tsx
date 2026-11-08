import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Picker } from "../../../components/Picker";
import { SHOWS } from "../../../lib/data";
import { beforeSeason, finished, parsePos } from "../../../src/spoiler";

export default async function ShowLanding({ params, searchParams }: { params: Promise<{ show: string }>; searchParams: Promise<{ pos?: string }> }) {
  const { show: slug } = await params;
  const content = SHOWS[slug];
  if (!content) notFound();
  const { show } = content;
  const seasons = show.seasons.map((s) => ({ number: s.number, episodes: s.episodes.length }));
  const latest = seasons.at(-1)!.number;
  // A shared link or a saved position pre-fills the picker; the viewer always confirms first.
  const raw = (await searchParams).pos ?? (await cookies()).get(`pos_${slug}`)?.value;
  let p = beforeSeason(show, latest) ?? { season: 1, episode: 1, second: 0 };
  if (raw) { try { p = parsePos(show, raw); } catch {} }
  const initial = { season: p.season, episode: p.episode, finished: p.second === finished(show, p.season, p.episode).second };
  return (
    <div className="space-y-6 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Catch up on {show.title} without spoilers</h1>
      <p className="muted text-sm">Pick the last episode you watched. Nothing from later episodes is ever sent to your device.</p>
      <Picker slug={slug} seasons={seasons} initial={initial} />
    </div>
  );
}
