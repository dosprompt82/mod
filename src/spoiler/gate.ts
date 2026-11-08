import type { ContentItem } from "./compile";

/**
 * The only way content leaves the server. Equivalent to
 * WHERE show = ? AND reveal_ord <= ? AND status = 'published'.
 * Items under an open spoiler report are hidden at once.
 */
export function visibleItems(items: readonly ContentItem[], show: string, positionOrd: number, hidden: ReadonlySet<string> = new Set()): ContentItem[] {
  return items.filter((i) => i.show === show && i.revealOrd <= positionOrd && i.status === "published" && !hidden.has(i.id));
}

/** Cache keys always include the position ordinal; never key a page by show alone. */
export function cacheKey(show: string, positionOrd: number, page: string): string {
  return `${show}:${positionOrd}:${page}`;
}

export interface CharacterCard {
  id: string; name: string; actor: string; group: string | null; imageId: string | null;
  role: string | null;
  facts: { id: string; text: string; revealOrd: number }[];
  relationships: { other: string; label: string; kind: string }[];
}

const latest = (xs: ContentItem[]) => [...xs].sort((a, b) => a.revealOrd - b.revealOrd).at(-1);

/** Who's who. Takes only gated items, so later characters cannot appear. */
export function characterCards(visible: readonly ContentItem[]): CharacterCard[] {
  const known = new Set(visible.filter((i) => i.kind === "character").map((i) => i.body.characterId as string));
  return visible.filter((i) => i.kind === "character").map((c) => {
    const id = c.body.characterId as string;
    const mine = (k: string) => visible.filter((i) => i.kind === k && i.body.characterId === id);
    const role = latest(mine("role"));
    const rels = new Map<string, ContentItem[]>();
    for (const r of visible.filter((i) => i.kind === "relationship" && (i.body.a === id || i.body.b === id))) {
      const other = (r.body.a === id ? r.body.b : r.body.a) as string;
      if (!known.has(other)) continue; // never reveal a name before its introduction
      rels.set(other, [...(rels.get(other) ?? []), r]);
    }
    return {
      id, name: c.body.name as string, actor: c.body.actor as string,
      group: c.body.group as string | null, imageId: c.body.imageId as string | null,
      role: role ? (role.body.text as string) : null,
      facts: mine("fact").sort((a, b) => a.revealOrd - b.revealOrd).map((f) => ({ id: f.id, text: f.body.text as string, revealOrd: f.revealOrd })),
      relationships: [...rels].map(([other, vs]) => { const v = latest(vs)!; return { other, label: v.body.label as string, kind: v.body.kind as string }; }),
    };
  });
}

export type SearchResult = { matches: { id: string; name: string }[]; message: string | null };

/**
 * Search over revealed names only. A not-yet-introduced character returns exactly the same
 * response as a name that does not exist.
 */
export function searchCharacters(visible: readonly ContentItem[], query: string): SearchResult {
  const q = query.trim().toLowerCase();
  const matches = q === "" ? [] : visible
    .filter((i) => i.kind === "character" && (i.body.name as string).toLowerCase().includes(q))
    .map((i) => ({ id: i.body.characterId as string, name: i.body.name as string }));
  return { matches, message: matches.length ? null : "No match yet" };
}
