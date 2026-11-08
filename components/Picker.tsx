"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Season = { number: number; episodes: number };

/**
 * Position picker. Episode-level only for now (D-017): "partway" means you are inside the episode,
 * so nothing from that episode is shown yet beyond its title.
 */
export function Picker({ slug, seasons, initial }: { slug: string; seasons: Season[]; initial: { season: number; episode: number; finished: boolean } }) {
  const router = useRouter();
  const [season, setSeason] = useState(initial.season);
  const [episode, setEpisode] = useState(initial.episode);
  const [done, setDone] = useState(initial.finished);
  const eps = seasons.find((s) => s.number === season)?.episodes ?? 1;

  function go() {
    const pos = done ? `s${season}e${episode}` : `s${season}e${episode}-0`;
    try { document.cookie = `pos_${slug}=${pos}; path=/; max-age=31536000; samesite=lax`; } catch {}
    void fetch("/api/position", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ show: slug, pos }) }).catch(() => {});
    router.push(`/s/${slug}/at/${pos}`);
  }
  function beforeSeason(n: number) {
    const prev = seasons.find((s) => s.number === n - 1);
    if (!prev) { setSeason(n); setEpisode(1); setDone(false); return; }
    setSeason(prev.number); setEpisode(prev.episodes); setDone(true);
  }
  const latest = seasons.at(-1)!.number;

  return (
    <div className="card space-y-4">
      <button type="button" className="chip" onClick={() => beforeSeason(latest)}>About to start Season {latest}</button>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Season
          <select className="mt-1 w-full rounded-lg border border-stone-300 bg-transparent p-2 dark:border-stone-700" value={season}
            onChange={(e) => { setSeason(Number(e.target.value)); setEpisode(1); }}>
            {seasons.map((s) => <option key={s.number} value={s.number}>Season {s.number}</option>)}
          </select>
        </label>
        <label className="text-sm">Episode
          <select className="mt-1 w-full rounded-lg border border-stone-300 bg-transparent p-2 dark:border-stone-700" value={episode}
            onChange={(e) => setEpisode(Number(e.target.value))}>
            {Array.from({ length: eps }, (_, i) => <option key={i} value={i + 1}>Episode {i + 1}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="flex gap-4 text-sm">
        <legend className="sr-only">Progress in this episode</legend>
        <label className="flex items-center gap-2"><input type="radio" checked={done} onChange={() => setDone(true)} /> I&apos;ve finished it</label>
        <label className="flex items-center gap-2"><input type="radio" checked={!done} onChange={() => setDone(false)} /> I&apos;m partway</label>
      </fieldset>
      <button type="button" className="btn w-full" onClick={go}>Show me what I&apos;ve seen</button>
    </div>
  );
}
