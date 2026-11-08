import { describe, it, expect } from "vitest";
import fc from "fast-check";
import show from "../content/the-diplomat";
import {
  audit, beforeSeason, cacheKey, characterCards, compile, episodesInOrder, finished, formatPos, ord, parsePos,
  PositionError, scanAnswer, searchCharacters, startOf, visibleItems, type ShowContent,
} from "../src/spoiler";

const S = show.show;
const items = compile(show);
const at = (p: string) => visibleItems(items, S.slug, ord(S, parsePos(S, p)));
const clone = (): ShowContent => ({ ...show, characters: structuredClone(show.characters.map((c) => ({ ...c }))) as ShowContent["characters"] });

describe("positions", () => {
  it("orders by episodeIndex * 100000 + second", () => {
    expect(ord(S, { season: 1, episode: 1, second: 0 })).toBe(0);
    expect(ord(S, { season: 2, episode: 1, second: 5 })).toBe(8 * 100000 + 5);
    expect(episodesInOrder(S)).toHaveLength(30);
  });
  it("parses and formats URL positions", () => {
    expect(parsePos(S, "s4e2-1860")).toEqual({ season: 4, episode: 2, second: 1860 });
    expect(parsePos(S, "s1e1")).toEqual(finished(S, 1, 1));
    expect(formatPos({ season: 4, episode: 2, second: 1860 })).toBe("s4e2-1860");
    for (const bad of ["s9e1", "s1e1-99999", "x", "s1e9"]) expect(() => parsePos(S, bad)).toThrow(PositionError);
  });
  it("'before the season' is the previous season's finale, finished", () => {
    expect(beforeSeason(S, 4)).toEqual(finished(S, 3, 8));
    expect(beforeSeason(S, 1)).toBeNull();
    expect(() => beforeSeason(S, 9)).toThrow(PositionError);
  });
});

describe("gating", () => {
  it("property: nothing above the position is ever returned", () => {
    const max = ord(S, finished(S, 4, 8));
    fc.assert(fc.property(fc.integer({ min: -1, max }), (o) => visibleItems(items, S.slug, o).every((i) => i.revealOrd <= o && i.status === "published")));
  });
  it("at every episode boundary, the visible set grows monotonically", () => {
    let prev = -1;
    for (const e of episodesInOrder(S)) for (const p of [startOf(e.season, e.number), finished(S, e.season, e.number)]) {
      const n = visibleItems(items, S.slug, ord(S, p)).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
  it("nothing renders before a position: S1E1 at 0s shows only the first title", () => {
    expect(at("s1e1-0").map((i) => i.id)).toEqual(["title:s1e1"]);
  });
  it("characters do not exist before their introduction; moving back hides them", () => {
    const names = (p: string) => characterCards(at(p)).map((c) => c.id);
    expect(names("s1e1")).toContain("kate-wyler");
    expect(names("s1e1")).not.toContain("margaret-roylin");
    expect(names("s1e6")).toContain("margaret-roylin");
    expect(names("s1e5")).not.toContain("margaret-roylin");
    expect(names("s3e8")).toContain("callum-ellis");
  });
  it("roles and relationships are versioned", () => {
    const card = (p: string, id: string) => characterCards(at(p)).find((c) => c.id === id)!;
    expect(card("s2e5", "grace-penn").role).toBe("Vice President of the United States");
    expect(card("s2e6", "grace-penn").role).toBe("President of the United States");
    const kh = (p: string) => card(p, "kate-wyler").relationships.find((r) => r.other === "hal-wyler")!.label;
    expect(kh("s1e1")).toBe("Married, planning to divorce");
    expect(kh("s3e3")).toBe("Separated in private");
    expect(kh("s3e8")).toBe("Back together");
  });
  it("unwatched episode titles and recaps are withheld", () => {
    const ids = at("s1e3").map((i) => i.id);
    expect(ids).toContain("recap:s1e3");
    expect(ids).toContain("previously:s1e3");
    expect(ids).not.toContain("title:s1e4");
    expect(ids).not.toContain("previously:s1e4");
  });
  it("reported items are hidden at once", () => {
    const o = ord(S, finished(S, 1, 1));
    expect(visibleItems(items, S.slug, o, new Set(["recap:s1e1"])).some((i) => i.id === "recap:s1e1")).toBe(false);
  });
  it("other shows' items never leak", () => {
    expect(visibleItems(items, "other-show", 10 ** 9)).toEqual([]);
  });
});

describe("search", () => {
  it("a not-yet-introduced character looks exactly like a nonsense name", () => {
    const v = at("s1e1");
    expect(searchCharacters(v, "Roylin")).toEqual(searchCharacters(v, "Zzqxv"));
    expect(searchCharacters(v, "Roylin").message).toBe("No match yet");
    expect(searchCharacters(at("s1e6"), "roylin").matches).toEqual([{ id: "margaret-roylin", name: "Margaret Roylin" }]);
    expect(searchCharacters(v, "  ").matches).toEqual([]);
  });
});

describe("cache keys", () => {
  it("always include the position ordinal", () => {
    expect(cacheKey(S.slug, 1, "people")).not.toBe(cacheKey(S.slug, 2, "people"));
  });
});

describe("spoiler audit", () => {
  it("the shipped show content is clean", () => {
    expect(audit(show)).toEqual([]);
  });
  it("catches a fact that leaks a later event", () => {
    const c = clone();
    c.characters[0]!.facts.push({ id: "leak", text: "Rayburn died during Hal's call.", revealAt: finished(S, 1, 1), mentions: [], source: [{ kind: "wiki", ref: "x", checkedBy: "t", checkedOn: "t" }], status: "published" });
    expect(audit(c).map((f) => f.check)).toContain("rule");
  });
  it("catches references to characters before their introduction, and unknown ids", () => {
    const c = clone();
    c.characters[0]!.facts.push({ id: "r1", text: "x", revealAt: finished(S, 1, 1), mentions: ["callum-ellis", "nobody"], source: [{ kind: "wiki", ref: "x", checkedBy: "t", checkedOn: "t" }], status: "published" });
    c.characters[0]!.roles.push({ text: "x", revealAt: { season: 1, episode: 1, second: 0 } });
    const msgs = audit(c).map((f) => f.message).join("\n");
    expect(msgs).toMatch(/callum-ellis/);
    expect(msgs).toMatch(/unknown character "nobody"/);
    expect(msgs).toMatch(/Role revealed before/);
  });
  it("catches structure problems: no source, out-of-range reveal, duplicate id", () => {
    const c = clone();
    c.characters[0]!.facts.push({ id: "s1", text: "x", revealAt: { season: 9, episode: 1, second: 0 }, mentions: [], source: [], status: "published" });
    c.characters.push({ ...c.characters[0]!, facts: [] });
    const msgs = audit(c).filter((f) => f.check === "structure").map((f) => f.message).join("\n");
    expect(msgs).toMatch(/no source/);
    expect(msgs).toMatch(/not an episode/);
    expect(msgs).toMatch(/Duplicate/);
  });
  it("always-visible text is checked at position zero", () => {
    const c = clone();
    c.characters[0]!.roles.push({ text: "Wife of Vice President Wyler", revealAt: finished(S, 3, 4) });
    expect(audit(c).some((f) => f.check === "always-visible")).toBe(true);
  });
  it("relationship references are checked", () => {
    const c = { ...clone(), relationships: [{ a: "kate-wyler", b: "callum-ellis", versions: [{ label: "x", kind: "work" as const, revealAt: finished(S, 1, 1) }] }, { a: "kate-wyler", b: "ghost", versions: [{ label: "x", kind: "work" as const, revealAt: finished(S, 1, 1) }] }] };
    const msgs = audit(c).map((f) => f.message).join("\n");
    expect(msgs).toMatch(/not yet introduced/);
    expect(msgs).toMatch(/Unknown character "ghost"/);
  });
  it("AI answers are scanned against the viewer's position", () => {
    expect(scanAnswer(show, "Penn is sworn in at the embassy (S3E1).", ord(S, finished(S, 1, 3)))).not.toEqual([]);
    expect(scanAnswer(show, "Penn is sworn in at the embassy (S3E1).", ord(S, finished(S, 3, 1)))).toEqual([]);
  });
});
