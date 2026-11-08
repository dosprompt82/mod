import { episodesInOrder, finished, ord, startOf } from "./position";
import type { ShowContent, Status } from "./types";

export type ItemKind =
  | "character" | "role" | "fact" | "relationship"
  | "episodeTitle" | "episodeRecap" | "previously" | "seasonRecap";

/** One gated row; mirrors the content_items table. */
export interface ContentItem {
  id: string;
  show: string;
  kind: ItemKind;
  /** Every user-visible string in the item, scanned by the audit. */
  text: string[];
  body: Record<string, unknown>;
  revealOrd: number;
  status: Status;
}

/**
 * Compile typed show content into gated items. Reveal points:
 * - character card: introducedAt; roles, facts, relationship versions: their own revealAt
 * - episode title: start of that episode (D-002); episode recap: end of the episode
 * - "previously" threads for episode N: start of episode N
 * - season recap: end of the season's last episode
 */
export function compile(c: ShowContent): ContentItem[] {
  const { show } = c;
  const slug = show.slug;
  const items: ContentItem[] = [];
  const add = (i: Omit<ContentItem, "show">) => items.push({ ...i, show: slug });

  for (const ep of episodesInOrder(show)) {
    add({
      id: `title:s${ep.season}e${ep.number}`, kind: "episodeTitle", text: [ep.title],
      body: { season: ep.season, episode: ep.number, title: ep.title },
      revealOrd: ord(show, startOf(ep.season, ep.number)), status: ep.confirmed ? "published" : "draft",
    });
  }
  for (const ch of c.characters) {
    add({
      id: `character:${ch.id}`, kind: "character", text: [ch.name, ...(ch.group ? [ch.group] : [])],
      body: { characterId: ch.id, name: ch.name, actor: ch.actor, group: ch.group ?? null, imageId: ch.imageId ?? null, introducedAt: ch.introducedAt },
      revealOrd: ord(show, ch.introducedAt), status: ch.status,
    });
    ch.roles.forEach((r, i) => add({
      id: `role:${ch.id}:${i}`, kind: "role", text: [r.text],
      body: { characterId: ch.id, text: r.text, revealAt: r.revealAt },
      revealOrd: ord(show, r.revealAt), status: ch.status,
    }));
    for (const f of ch.facts) {
      add({
        id: `fact:${f.id}`, kind: "fact", text: [f.text],
        body: { characterId: ch.id, text: f.text, revealAt: f.revealAt, mentions: f.mentions },
        revealOrd: ord(show, f.revealAt), status: f.status,
      });
    }
  }
  for (const rel of c.relationships) {
    rel.versions.forEach((v, i) => add({
      id: `relationship:${rel.a}:${rel.b}:${i}`, kind: "relationship", text: [v.label],
      body: { a: rel.a, b: rel.b, label: v.label, kind: v.kind, revealAt: v.revealAt },
      revealOrd: ord(show, v.revealAt), status: "published",
    }));
  }
  for (const r of c.episodeRecaps) {
    const end = ord(show, finished(show, r.season, r.episode));
    add({
      id: `recap:s${r.season}e${r.episode}`, kind: "episodeRecap", text: [r.short, r.long],
      body: { season: r.season, episode: r.episode, short: r.short, long: r.long }, revealOrd: end, status: r.status,
    });
    if (r.previously.length) add({
      id: `previously:s${r.season}e${r.episode}`, kind: "previously", text: r.previously,
      body: { season: r.season, episode: r.episode, threads: r.previously },
      revealOrd: ord(show, startOf(r.season, r.episode)), status: r.status,
    });
  }
  for (const s of c.seasonRecaps) {
    const last = episodesInOrder(show).filter((e) => e.season === s.season).at(-1);
    if (!last) throw new Error(`Season recap for unknown season ${s.season}`);
    add({
      id: `seasonRecap:${s.season}`, kind: "seasonRecap", text: [s.sixtySeconds, ...s.full],
      body: { season: s.season, sixtySeconds: s.sixtySeconds, full: s.full },
      revealOrd: ord(show, finished(show, s.season, last.number)), status: s.status,
    });
  }
  return items;
}
