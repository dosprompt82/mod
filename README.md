# Debt Modification Calculator (ASC 470-50)

Product spec: [CLAUDE.md](CLAUDE.md). Judgment log: [DECISIONS.md](DECISIONS.md).

## Setup
```bash
pnpm install
pnpm test                                  # all packages
cd packages/engine && pnpm coverage        # engine coverage (threshold 95%)
python3 fixtures/reference.py              # regenerate fixture expectations + Excel companions
```

## Architecture
- `packages/engine`: the pure calculation library (decimal.js, date-fns, zod). No I/O.
- `apps/web`: Next.js UI (Phase 2, not started).
- `packages/export`: Excel and memo exports (Phase 3, not started).
- `fixtures/reference.py`: an independent float implementation. It writes the expected values into `packages/engine/test/fixtures/*.json` and a formula-driven workbook into `fixtures/excel/`.

## Accounting-rule map
| Rule | File | Test |
|------|------|------|
| 10% test, threshold (470-50-40-10) | `src/cashFlowTest.ts` | fixtures 01–07, `engine.test.ts` edge cases |
| Discount at original EIR (40-12(a)) | `src/cashFlowTest.ts`, `src/pv.ts` | all fixtures |
| Fees to/from lender at t=0; third-party costs excluded | `src/cashFlowTest.ts` | fixtures 01, 02, 07 |
| Floating rate held flat, floors/caps (40-12(b)) | `src/cashflows.ts#couponRate` | fixture 04 |
| Call/put scenarios, smaller change controls (40-12(c)) | `src/cashFlowTest.ts` | fixture 05 |
| Contingent flows, manual entry with a warning (40-12(d)) | `src/cashflows.ts`, `src/cashFlowTest.ts` | edge-case test |
| One-year lookback (40-12(f)) | `src/cashFlowTest.ts` | fixture 06 |
| PIK as principal | `src/cashflows.ts` | PIK tests |
| Effective-rate solver | `src/pv.ts#solveEffectiveRate` | solver tests |
| TDR, conversion tests, outcomes, JEs, amortization | not yet built | not yet built |
