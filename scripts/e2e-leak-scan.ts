/**
 * End-to-end leak scan: fetches every screen at every episode boundary from a running server
 * and scans the full HTML response with the show's spoiler rules for that position.
 * Usage: BASE=http://localhost:3000 tsx scripts/e2e-leak-scan.ts
 */
import show from "../content/the-diplomat";
import { compile, episodesInOrder, finished, formatPos, ord, scanAnswer, startOf } from "../src/spoiler";

const BASE = process.env.BASE ?? "http://localhost:3000";
const S = show.show;
const ids = [...new Set(compile(show).filter((i) => i.kind === "character").map((i) => i.body.characterId as string))];
let pages = 0, leaks = 0;
for (const e of episodesInOrder(S)) {
  for (const p of [startOf(e.season, e.number), finished(S, e.season, e.number)]) {
    const pos = p.second === 0 ? formatPos(p) : `s${p.season}e${p.episode}`;
    const o = ord(S, p);
    const paths = ["", "/catch-up", "/people", "/map", "/episodes", ...ids.map((i) => `/people/${i}`)];
    for (const path of paths) {
      const res = await fetch(`${BASE}/s/${S.slug}/at/${pos}${path}`);
      if (res.status === 404) continue;
      pages++;
      const html = (await res.text()).replace(/\\"/g, "\"").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");
      const hits = scanAnswer(show, html, o);
      if (hits.length) { leaks++; console.error(`LEAK ${pos}${path}: ${hits.join(", ")}`); }
    }
  }
}
console.log(`scanned ${pages} pages, ${leaks} leaks`);
process.exit(leaks ? 1 : 0);
