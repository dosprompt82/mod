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
