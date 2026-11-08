import "server-only";
import diplomat from "../content/the-diplomat";
import {
  characterCards, compile, episodesInOrder, finished, ord, parsePos, PositionError, visibleItems,
  type ContentItem, type Position, type ShowContent,
} from "../src/spoiler";
import { all } from "./store";

export const SHOWS: Record<string, ShowContent> = { "the-diplomat": diplomat };
const COMPILED: Record<string, ContentItem[]> = Object.fromEntries(Object.entries(SHOWS).map(([k, v]) => [k, compile(v)]));

export type Report = { id: string; contentId: string; show: string; positionOrd: number; note: string; createdAt: string; status: "open" | "reviewed" };

/** Items under an open spoiler report are hidden at once until reviewed. */
export function hiddenIds(show: string): Set<string> {
  return new Set(all<Report>("spoiler_reports").filter((r) => r.show === show && r.status === "open").map((r) => r.contentId));
}

export interface Ctx { content: ShowContent; slug: string; pos: Position; ord: number; items: ContentItem[] }

/** Resolve a show and URL position, returning only gated items. Returns null for bad input. */
export function context(slug: string, rawPos: string): Ctx | null {
  const content = SHOWS[slug];
  if (!content) return null;
  try {
    const pos = parsePos(content.show, rawPos);
    const o = ord(content.show, pos);
    return { content, slug, pos, ord: o, items: visibleItems(COMPILED[slug]!, slug, o, hiddenIds(slug)) };
  } catch (e) {
    if (e instanceof PositionError) return null;
    throw e;
  }
}

export const cards = (c: Ctx) => characterCards(c.items);
export const byKind = (c: Ctx, kind: ContentItem["kind"]) => c.items.filter((i) => i.kind === kind);

export function episodeLabel(c: Ctx, revealOrd: number): string {
  const eps = episodesInOrder(c.content.show);
  const ep = eps[Math.floor(revealOrd / 100000)];
  return ep ? `S${ep.season}E${ep.number}` : "";
}

export function isFinished(c: Ctx, season: number, episode: number): boolean {
  return ord(c.content.show, finished(c.content.show, season, episode)) <= c.ord;
}

export function posLabel(c: Ctx): string {
  const { pos } = c;
  const done = isFinished(c, pos.season, pos.episode);
  return `S${pos.season} · E${pos.episode} · ${done ? "finished" : pos.second === 0 ? "just starting" : `${Math.round(pos.second / 60)} min`}`;
}
