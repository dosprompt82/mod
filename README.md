# Caught Up

A spoiler-free companion for TV series. The pilot show is *The Diplomat*. Spec: [docs/SPEC.txt](docs/SPEC.txt). Decisions: [DECISIONS.md](DECISIONS.md).

```bash
npm install
npm test               # gating, search, cache and audit tests
npm run content:build  # validate and audit every show, then write .content-build/<slug>.json
```

## Layout
- `src/spoiler/`: position ordinals (`position.ts`), compiling content into gated items (`compile.ts`), server-side gating, character cards and search (`gate.ts`), and the spoiler audit (`audit.ts`).
- `content/the-diplomat/`: typed show content. S1–S3 are filled in; S4 has structure only.
- Not built yet: the Next.js app, Postgres, and the AI assistant.
