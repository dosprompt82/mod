# Caught Up

A spoiler-free companion for TV series. The pilot show is *The Diplomat* (all four seasons). Spec: [docs/SPEC.txt](docs/SPEC.txt). Decisions: [DECISIONS.md](DECISIONS.md).

## Run
```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY for the Ask assistant
npm run build                # runs content:build (validation + spoiler audit) then next build
npm start
```
Deploy: any Node host or Vercel (`npm run build` is the build command; set `ANTHROPIC_API_KEY`).

## Checks
- `npm test`: gating property tests, search parity, versioned roles/relationships, the audit, assistant grounding.
- `npm run content:build`: a failed spoiler audit fails the build. There is no override.
- `BASE=http://localhost:3000 npx tsx scripts/e2e-leak-scan.ts`: fetches every screen at every episode boundary and scans the HTML with the spoiler rules.
- `npx tsx scripts/cross-check.ts <dir>`: regenerates second-source corroboration from saved Tudum article text.

## Layout
- `src/spoiler/`: positions, compile, gating, search, the audit.
- `content/the-diplomat/`: `base.ts` (authored content) plus `corroboration.ts` (generated).
- `app/`: Next.js routes. Pages are under `/s/[show]/at/[pos]/…`; the APIs are `/api/ask`, `/api/report` and `/api/position`.
- `lib/`: server-only data access, the JSONL store, and the gated assistant.
