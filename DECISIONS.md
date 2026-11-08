# DECISIONS

| ID | Status | Decision |
|----|--------|----------|
| D-001 | DECIDED | Build order follows the spec: gating, content compile and the spoiler audit come before any screens. |
| D-002 | DECIDED | An episode title reveals at the **start** of that episode. Number and runtime are always visible. A recap reveals at the end of its episode. The "previously" threads for episode N reveal at the start of N. A season recap reveals at the end of the season's finale. |
| D-003 | DECIDED | Added `status` to `Character` (not in the spec type) so an unverified introduction can be withheld. |
| D-004 | DECIDED | The audit's rule check scans each item from the first position it becomes visible. A match where `textOrd < rule.revealOrd` is a leak. There is no override flag. |
| D-005 | DECIDED | Relationships are shown on a card only once both characters are introduced. |
| D-016 | DECIDED (Josh, 2026-11-08) | **No human reviewer.** Facts come from public wiki and recap sources, episode by episode. The primary source is the per-episode summaries in Wikipedia's episode table. Each summary covers exactly one episode, so a fact reveals at the end of its episode. Whole-show pages (cast bios, plot overviews) describe later events and are used only for actor names. All text is paraphrased in our own words. |
| D-017 | OPEN | Runtimes aren't in the sources yet, so all are a 3600s placeholder. Gating is **episode-level only** until real runtimes are sourced, and the minutes slider is not enabled. |
| D-018 | OPEN | Fandom's Diplomat wiki has only 4 pages, so it's no use for cross-checking. A second independent per-episode source (Netflix Tudum, TVLine recaps) is still to be added. Until then, each fact has one source. |
| D-019 | DECIDED | Season 4 is structure only (titles and dates). Season 4 content will be added episode by episode, as the spec orders. |
| D-020 | DECIDED | `long` episode recaps and the `full` season recaps are empty for now. Short recaps, "previously" threads, facts, roles and relationships are filled in for S1–S3. |
| D-018 | UPDATED | Second source: Netflix Tudum season articles (S1 recap; S2–S4 "ending explained"). `scripts/cross-check.ts` marks a fact corroborated when every mentioned character's surname and at least 60% of its distinctive words appear in that season's article. **47 of 94 facts** have two sources. Tudum covers finales most heavily, so mid-season facts are less often corroborated. Source text is not committed. |
| D-019 | UPDATED | Season 4 content added from the per-episode summaries: 8 recaps, 3 new characters, 9 spoiler rules. |
| D-021 | DECIDED | Launch v1 has no Postgres. Content is compiled into the app at build time. Reports, positions and AI logs go to an append-only JSONL store (`lib/store.ts`), which falls back to memory on read-only hosts. On Vercel that means reports last only for the life of an instance, so Postgres/Supabase is the next step before heavy traffic. |
| D-022 | DECIDED | Ask uses `claude-opus-5-5` (overridable with `ASK_MODEL`) at low effort, with server-side refusal fallbacks. Future-tense questions get a fixed neutral reply. Every answer is fully generated, scanned with the spoiler rules, and only then sent (a match is replaced with the neutral reply and logged). There are per-visitor hourly limits and a monthly cap. |
| D-023 | DECIDED | The position picker is episode-level. "Partway" maps to second 0 of the episode, so only its title shows (D-017). |
| D-024 | OPEN | Takedown address on the About page is a placeholder (`takedown@caughtup.example`). Needs a real one before launch. A media lawyer's opinion is still recommended by the spec. |
