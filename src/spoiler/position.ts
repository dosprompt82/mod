import type { Episode, Position, Show } from "./types";

/** Ordinal multiplier: ord = episodeIndex * 100000 + second (spec, "Position"). */
export const ORD_STRIDE = 100_000;

export class PositionError extends Error {
  constructor(msg: string) { super(msg); this.name = "PositionError"; }
}

/** All episodes in release order; S1E1 has index 0. */
export function episodesInOrder(show: Show): Episode[] {
  return [...show.seasons].sort((a, b) => a.number - b.number)
    .flatMap((s) => [...s.episodes].sort((a, b) => a.number - b.number));
}

export function findEpisode(show: Show, season: number, episode: number): { ep: Episode; index: number } {
  const eps = episodesInOrder(show);
  const index = eps.findIndex((e) => e.season === season && e.number === episode);
  if (index < 0) throw new PositionError(`S${season}E${episode} is not an episode of ${show.slug}`);
  return { ep: eps[index]!, index };
}

/** Single comparable ordinal for a position. Throws if the position is outside the show. */
export function ord(show: Show, p: Position): number {
  const { ep, index } = findEpisode(show, p.season, p.episode);
  if (!Number.isInteger(p.second) || p.second < 0 || p.second > ep.runtimeSec) {
    throw new PositionError(`Second ${p.second} is outside S${p.season}E${p.episode} (runtime ${ep.runtimeSec}s)`);
  }
  return index * ORD_STRIDE + p.second;
}

/** "Finished episode" = second equals runtime. */
export function finished(show: Show, season: number, episode: number): Position {
  return { season, episode, second: findEpisode(show, season, episode).ep.runtimeSec };
}

/** Start of an episode (second 0). */
export function startOf(season: number, episode: number): Position {
  return { season, episode, second: 0 };
}

/**
 * "Before the season" = the previous season's last episode, finished.
 * Before Season 1 there is no prior content: returns null (nothing is revealed).
 */
export function beforeSeason(show: Show, season: number): Position | null {
  const eps = episodesInOrder(show);
  const first = eps.findIndex((e) => e.season === season);
  if (first < 0) throw new PositionError(`Season ${season} is not in ${show.slug}`);
  if (first === 0) return null;
  const prev = eps[first - 1]!;
  return { season: prev.season, episode: prev.number, second: prev.runtimeSec };
}

/** URL form: "s4e2-1860"; "s4e2" means finished. */
export function parsePos(show: Show, s: string): Position {
  const m = /^s(\d+)e(\d+)(?:-(\d+))?$/.exec(s);
  if (!m) throw new PositionError(`Bad position "${s}"`);
  const season = Number(m[1]), episode = Number(m[2]);
  const p = m[3] === undefined ? finished(show, season, episode) : { season, episode, second: Number(m[3]) };
  ord(show, p); // validates
  return p;
}

export function formatPos(p: Position): string {
  return `s${p.season}e${p.episode}-${p.second}`;
}
