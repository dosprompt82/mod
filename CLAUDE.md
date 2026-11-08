**Master Build Instructions: Debt Modification Calculator (ASC 470-50)**

Paste this whole file into Claude Code as the opening prompt, or save it
as CLAUDE.md in the repo root. It's the product spec, accounting rules,
architecture and build plan in one place.

**0. How to work (read first)**

- You are building a commercial web app for technical accountants. **The
  accounting has to be right.** A correct calculation engine matters
  more than the UI.

- Build in the phases in Section 9. Don't start a phase until the
  previous phase's tests pass.

- **Ask before guessing on any accounting rule.** If Section 4 doesn't
  answer a question, stop and ask me (Josh, the product owner and
  accounting SME). Don't invent accounting logic.

- Every accounting rule in the code needs a comment with its ASC
  paragraph reference (e.g., // ASC 470-50-40-12).

- Keep a running DECISIONS.md that logs every judgment call and open
  question.

- Commit after each working step with a clear message.

**1. Product summary**

**What it does.** A borrower modifies or exchanges a term loan, note or
revolver with the same lender. The app works out whether that's a
**modification** or an **extinguishment** under ASC 470-50 and produces:

1.  The conclusion, with the 10% cash flow test, the conversion option
    tests and the TDR screen shown step by step.

2.  The journal entries at the modification date.

3.  A new effective interest rate and amortization schedule.

4.  An audit-ready Excel workpaper with live formulas, and a PDF/Word
    memo summary with codification citations.

**Who it's for.** Controllers, technical accounting teams, audit seniors
and managers, and advisory firms.

**How it makes money.** Per-transaction credits (e.g., \$X per analysis)
or a monthly subscription, through Stripe. The free tier runs the test,
but exports are watermarked.

**Positioning.** It's fast, it's transparent (every number traces to an
input and a formula), and it's built on national-office-level logic. The
output is a preliminary analysis, not an audit opinion.

**2. Tech stack**

- **Monorepo:** pnpm workspaces + TypeScript (strict mode).

  - packages/engine: the pure calculation library. No UI, no I/O, fully
    unit-tested. **This is the product.**

  - apps/web: Next.js (App Router) + React + Tailwind + shadcn/ui.

  - packages/export: Excel (ExcelJS, writing real formulas) and PDF/DOCX
    memo generation.

- **Numbers:** use decimal.js for **all** monetary and rate math. Never
  use JS floating point for money. Round only for display, and only at
  the end.

- **Dates:** date-fns. All cash flows carry actual dates.

- **Validation:** zod schemas shared by the engine and the UI.

- **Tests:** Vitest. Coverage on packages/engine ≥ 95%.

- **Later phases:** Auth (Clerk or Auth.js), Postgres (Prisma) for saved
  analyses, Stripe for billing.

**3. Core data model (zod schemas in packages/engine/src/schemas)**

**3.1 DebtInstrument (used for both the original and the new terms)**

- principalOutstanding

- currency

- rateType: fixed \| floating

- fixedRate, **or** index + spread + indexRateAtModificationDate +
  optional floor / cap

- paymentFrequency: monthly \| quarterly \| semiannual \| annual \| at
  maturity

- dayCount: 30/360 \| ACT/360 \| ACT/365

- amortization: bullet \| level payment \| custom schedule (array of
  {date, principal})

- pikComponent (optional): PIK rate and whether it capitalizes

- maturityDate

- callOptions\[\] and putOptions\[\]: {exerciseDate or window, price as
  % of par, holder: issuer\|lender}

- conversionOption (optional): {substantive: boolean, fairValue?:
  Decimal}

- exitFee or other end-of-term fees

**3.2 CarryingAmount (original debt, immediately before the
modification)**

- Principal

- Unamortized discount (+) or premium (–)

- Unamortized debt issuance costs

- Accrued interest (tracked separately, not part of carrying amount)

- **Net carrying amount**, calculated, not entered

**3.3 ModificationEvent**

- modificationDate

- feesPaidToLender\[\]: amount, description (consent fee, amendment fee,
  OID, etc.)

- feesReceivedFromLender\[\]

- thirdPartyCosts\[\]: legal, arranger acting as agent, etc.

- newDebtFairValue: needed if the result is extinguishment. Either a
  user input, or calculated by DCF at a user-entered market rate.

- priorModificationsWithin1Year\[\]: original terms as they stood one
  year ago, if any modifications in the last 12 months weren't
  extinguishments

- lenders\[\]: for syndicated debt, each lender's share of the old and
  new debt (Section 4.7)

- tdrScreen: answers to the TDR questions (Section 4.1)

- originalEffectiveRate: user input, **or** calculated from the original
  issuance cash flows and net proceeds (Section 4.3)

**3.4 AnalysisResult**

- tdrConclusion

- cashFlowTest: all scenarios, PVs, % change, which scenario controls

- conversionTests

- conclusion: modification \| extinguishment \| TDR – out of scope \|
  mixed (lender-by-lender)

- journalEntries\[\]

- newEffectiveRate

- amortizationSchedule\[\]

- citations\[\]

- warnings\[\]: judgment areas flagged for the user

**4. Accounting rules (implement exactly; cite in code)**

**4.1 Step 0: TDR screen (ASC 470-60). Run this first.**

- Ask: (a) Is the borrower experiencing financial difficulty? (ASC
  470-60-55-8 indicators: default, bankruptcy, going-concern doubt,
  delisting, can't get financing elsewhere, projected cash flows
  insufficient.) (b) Did the lender grant a concession? (The effective
  borrowing rate on the restructured debt is lower than on the original
  debt, per 470-60-55-10.)

- **If both are yes, it's a TDR. Stop:** show "Troubled debt
  restructuring: ASC 470-60 applies; outside this calculator's scope."
  Also show the concession calculation, comparing the new effective
  borrowing rate (including fees) with the original effective rate.

- Note in the UI that ASU 2022-02 eliminated TDR accounting for
  **creditors** only. **Debtors** still apply ASC 470-60.

**4.2 Step 1: Is it the same creditor? (ASC 470-50-40-6 and related
guidance)**

- The test applies only to an exchange or modification between the
  **same debtor and creditor**.

- Ask whether a third-party intermediary is involved and whether it's
  acting as **principal** or as **agent** for the borrower (470-50-55-6
  and 55-7 indicators). If it's acting as principal, treat the
  intermediary as the creditor. Show this as a judgment flag.

- A new lender replacing an exiting lender means extinguishment of the
  exiting lender's share and new debt from the new lender. This isn't a
  modification test.

**4.3 The discount rate: the original effective interest rate (ASC
470-50-40-12(a))**

- Discount **both** sets of cash flows at the **effective interest rate
  of the original debt**.

- Use the effective rate as currently being amortized, i.e., as adjusted
  for any previous modification accounted for as a modification.

- Provide a helper that solves for the effective rate from the original
  issuance cash flows and net proceeds (an IRR on dated flows). Let the
  user override it.

**4.4 Step 2: The 10% cash flow test (ASC 470-50-40-10 and 40-12)**

Debt is **substantially different** if the PV of the cash flows under
the new terms differs from the PV of the remaining cash flows under the
original terms by **at least 10%**.

- **% change = \|PV_new − PV_old\| ÷ PV_old.** If the result is ≥
  10.00%, it's an extinguishment. Show it to 2 decimals. Flag any result
  between 9.0% and 11.0% as "close to threshold."

- **PV_old:** the remaining contractual cash flows of the original debt
  from the modification date, discounted at the original effective rate.

- **PV_new** includes:

  - all principal and interest under the new terms

  - **plus** amounts paid by the debtor **to the creditor** at the
    modification date (fees, OID), as a t=0 cash flow, not discounted

  - **minus** amounts received from the creditor at the modification
    date

  - **not** third-party costs

- **Floating rates (470-50-40-12(b)):** project floating-rate cash flows
  using the index rate **in effect on the modification date**, held
  flat. Apply floors and caps to that rate.

- **Calls and puts (470-50-40-12(c)):** if the original or new debt has
  a call or put, run separate analyses assuming **exercise and
  non-exercise**.

  - Do this for each exercise date where there are several. Build the
    cartesian set of scenarios, but cap it and warn if there are too
    many.

  - **Use the scenario that produces the smaller change** for the
    conclusion.

  - Show every scenario in the workpaper.

- **Contingent payments and unusual terms (470-50-40-12(d)):** don't
  model them automatically. Show a warning that judgment is needed and
  let the user enter the expected cash flows manually.

- **One-year lookback (470-50-40-12(f)):** if the debt was modified or
  exchanged within the past year and that change *wasn't* an
  extinguishment, run the test against the **terms as they existed one
  year ago**, not the current terms.

- **PIK:** treat capitalized PIK interest as part of the principal cash
  flows paid at the later dates.

- **Conversion option value is excluded** from the cash flow test
  (470-50-40-12(e)). Changes in the conversion option are tested
  separately in 4.5.

**4.5 Step 3: Conversion option tests (ASC 470-50-40-10(a) and (b))**

These apply only if the original or new debt is convertible and the
conversion option is **not** bifurcated. The modification is also an
extinguishment if either of these is true:

- \(a\) The change in the **fair value of the embedded conversion
  option** (FV immediately after minus FV immediately before) is **at
  least 10% of the carrying amount of the original debt** immediately
  before the modification.

- \(b\) The modification **adds or eliminates a substantive conversion
  option**. The user answers whether the option is substantive
  (470-20-40-5 through 40-10). Provide help text, and treat this as a
  judgment flag.

The **overall conclusion is extinguishment if ANY test fails** (the cash
flow test, 4.5(a) or 4.5(b)).

**4.6 Step 4: Accounting outcomes**

**A. Modification (ASC 470-50-40-14 and 40-17(b)):**

- No gain or loss.

- **Fees paid to the creditor** are added to the unamortized discount
  (or reduce the premium) and are amortized as an interest adjustment
  over the remaining term.

- **Third-party costs are expensed** as incurred.

- **New effective rate:** solve for the rate that equates the adjusted
  net carrying amount (old net carrying amount − fees paid to the
  lender) with the PV of the new contractual cash flows.

- **Convertible debt (470-50-40-15):** an **increase** in the conversion
  option's fair value reduces the carrying amount (an extra discount),
  with the offset to APIC. A **decrease** is **not** recognized.

- Journal entries (illustrative):

  - Dr Debt discount / Cr Cash for fees paid to the lender

  - Dr Expense / Cr Cash for third-party costs

**B. Extinguishment (ASC 470-50-40-2, 40-3, 40-17(a); ASC 405-20):**

- Derecognize the old debt at its net carrying amount.

- Recognize the new debt at **fair value**.

- **Gain/loss** = reacquisition price − net carrying amount of the old
  debt, where reacquisition price = FV of the new debt + fees paid to
  the lender + other consideration paid to the lender.

- **Fees paid to the creditor are included in the gain or loss.**

- **Third-party costs** are capitalized as debt issuance costs of the
  new debt and amortized.

- New debt discount/premium = principal − fair value. New effective rate
  is solved from FV − third-party costs against the new cash flows.

- Journal entries (illustrative):

  - Dr Old debt (principal), Cr Old discount/DIC (unamortized amounts)

  - Cr New debt (principal), Dr/Cr New discount/premium

  - Cr Cash (fees)

  - Dr/Cr Loss/Gain on extinguishment

  - Dr DIC (new) / Cr Cash for third-party costs

- **Presentation note:** gain/loss on extinguishment is not presented as
  extraordinary. If the lender is a related party, show a warning that
  the gain or loss may be a capital transaction (470-50-40-2).

**4.7 Syndicated loans and lender-by-lender analysis (ASC 470-50-40-6;
55-6 to 55-9)**

- For syndicated debt, run the cash flow test **separately for each
  lender**, using that lender's share of the old and new cash flows and
  fees.

- Classify each lender as:

  - continuing, then run the test

  - exiting (fully repaid): extinguishment of that share

  - new: new debt; its costs go to DIC

  - increasing commitment: test the existing share, with the new money
    as new debt

- The result can be **mixed**. Produce journal entries by lender and in
  total.

- **Loan participations:** participants aren't creditors of the
  borrower. The test is done against the lead lender only. Ask the user
  which structure applies.

**4.8 Revolvers and lines of credit (ASC 470-50-40-21 to 40-23)**

This is a separate module. Don't run the 10% test here.

- **Borrowing capacity** = commitment amount × remaining term (in
  years).

- **If new capacity ≥ old capacity:** keep amortizing the unamortized
  old costs over the **new** term. New fees paid to the lender and
  third-party costs are deferred and amortized over the new term.

- **If new capacity \< old capacity:** new fees and third-party costs
  are deferred over the new term. Write off the unamortized old costs
  **in proportion to the decrease in borrowing capacity**, and amortize
  the remainder over the new term.

- **Revolver ↔ term loan conversions (470-50-40-22, 40-23):** don't
  build these in the MVP. Show an "outside scope, consult" message and
  log it in DECISIONS.md as a later feature.

**4.9 Out of scope (detect and warn; don't calculate)**

- Induced conversions (470-20-40-13)

- Debt with bifurcated derivatives (warn: the derivative is accounted
  for separately, so the user needs to confirm the host-only cash flows)

- Debt measured under the fair value option (ASC 825-10)

- Non-same-currency exchanges

- Share-settled exchanges

- Modifications made in connection with a business combination

- Creditor-side accounting

**5. Calculation engine requirements**

- buildCashFlows(instrument, fromDate) → DatedCashFlow\[\]:
  deterministic; handles stub periods, the business-day convention (none
  in the MVP; document it), amortization, PIK and fees.

- presentValue(flows, annualRate, asOfDate, convention). The default
  convention is an annual effective rate with time measured as days/365:
  DF = (1 + r)^(-(days/365)). Make it configurable, and use the same
  convention to solve the effective rate and to discount.

- solveEffectiveRate(flows, pv): Newton-Raphson with a bisection
  fallback, tolerance 1e-12, max 200 iterations; throws a typed error if
  it doesn't converge.

- runCashFlowTest(input) → CashFlowTestResult with all scenarios.

- runConversionTests(input), runTdrScreen(input),
  runRevolverTest(input).

- buildJournalEntries(result), buildAmortizationSchedule(...).

- analyze(input) → AnalysisResult: the single entry point.

- Every function is **pure** and documented with JSDoc that includes the
  ASC citation.

**6. Test suite (build it before the UI)**

Create packages/engine/test/fixtures/ with **at least 12 hand-verified
scenarios**. For each one, also build a companion Excel file in
/fixtures/excel/ using plain Excel formulas, so the expected values are
independently checkable:

1.  Fixed-rate bullet loan, rate cut 50 bps, small fee → modification

2.  Same loan, rate cut plus a large consent fee → crosses 10% →
    extinguishment

3.  Maturity extended 3 years, same rate → test the result

4.  Floating-rate loan, spread change, floor added → index held flat

5.  New debt is callable: exercise vs non-exercise, where the
    smaller-change scenario controls

6.  Two modifications within 12 months: one-year lookback changes the
    answer

7.  Fees paid to third parties only → no effect on the test; expensed
    under modification

8.  Convertible note: conversion option fair value rises by more than
    10% of carrying amount → extinguishment despite passing the cash
    flow test

9.  Convertible note: conversion option eliminated (substantive) →
    extinguishment

10. Syndicated loan: 3 lenders (one continues, one exits, one new) →
    mixed result

11. Revolver with reduced capacity → proportional write-off

12. TDR screen: financial difficulty plus concession → stops with the
    TDR message

Other test requirements:

- Edge cases: exactly 10.00%; negative PV change; zero-coupon; PIK; leap
  years; ACT/360 vs 30/360.

- Property-based tests (fast-check): when the new terms equal the old
  terms with no fees, the change is 0% and there are no journal entries.

- **I'll provide guide PDFs** (Big 4 debt guides) with worked examples.
  Add those as fixtures when I upload them, and match their results to
  the cent or explain the difference in DECISIONS.md.

**7. UI / UX (Phase 2)**

- **Wizard flow:**

  1.  Transaction type (term loan / revolver / syndicated)

  2.  TDR screen

  3.  Original debt

  4.  Carrying amount

  5.  New terms

  6.  Fees (each fee classified as paid to lender / received from lender
      / third party, with tooltips explaining why it matters)

  7.  Embedded features

  8.  Review

- **Results page:**

  - Large conclusion banner

  - Test breakdown table

  - Scenario table (for call/put options)

  - Journal entries

  - New effective rate

  - Amortization schedule

  - Warnings panel

- Every number on the results page shows its formula and inputs on hover
  ("trace mode").

- Side-by-side cash flow table: old vs new, by date.

- **Professional, quiet design:** navy/gray palette, accounting number
  formatting (parentheses for negatives), no emojis.

- Save and duplicate an analysis ("what-if" scenarios). A sensitivity
  slider shows the fee or rate at which the result flips to
  extinguishment (a breakeven solver). This is a key differentiator.

- Mobile-responsive, but desktop-first.

**8. Exports (Phase 3)**

- **Excel workpaper (ExcelJS):**

  - Tabs: Inputs, Old CF, New CF (one per scenario), 10% Test,
    Conversion Tests, JEs, Amortization, Citations.

  - **Use real Excel formulas** (=XNPV-style or explicit discount
    factors) that reference the Inputs tab, so a reviewer can audit and
    change inputs.

  - Blue font for inputs, black for formulas.

- **Memo (DOCX + PDF):**

  - Sections: Background, Issue, Guidance, Analysis (TDR, same creditor,
    10% test, conversion tests), Conclusion, Journal Entries.

  - Cite ASC paragraphs.

  - Use editable placeholders for facts the tool can't know.

- Footer disclaimer on all exports: "Preliminary analysis prepared using
  \[App Name\]. Not a substitute for professional judgment or an audit
  opinion. Verify all inputs and conclusions."

**9. Build phases**

1.  **Phase 1, engine:** schemas, cash flow builder, PV/effective-rate
    solver, TDR screen, 10% test (all of 4.4), conversion tests,
    outcomes, JEs, amortization; all fixtures passing. *Show me the
    fixture results before moving on.*

2.  **Phase 2, web UI:** wizard, results page, trace mode, breakeven
    solver. No auth; local state only.

3.  **Phase 3, exports:** Excel workpaper and memo.

4.  **Phase 4, syndication and revolver modules** (4.7, 4.8).

5.  **Phase 5, commercial:**

    - Auth, saved analyses (Postgres), Stripe billing (per-analysis
      credits + subscription), watermarking on the free tier

    - Terms of use and disclaimer acceptance

    - Basic analytics

6.  **Phase 6, polish:**

    - Onboarding sample analysis

    - Landing page

    - SEO page explaining the 10% test

    - Accessibility (WCAG AA)

    - Error monitoring (Sentry)

**10. Quality bar and guardrails**

- No accounting conclusion without the supporting numbers on screen.

- Every judgment input (financial difficulty, substantive conversion
  option, agent vs principal, contingent cash flows) is shown in the
  output as a **user-asserted judgment**, not a tool conclusion.

- The engine has no network calls. Client data never leaves the app
  except to save to the user's own account.

- Don't store uploaded documents in the MVP. Users enter terms manually.

- Keep README.md current with setup, architecture and the
  accounting-rule map (rule → file → test).

**11. First task**

Set up the monorepo. Then implement packages/engine schemas,
buildCashFlows, presentValue and solveEffectiveRate, with tests. Then
implement the 10% test with fixtures 1–7. Stop and show me the results
table for fixtures 1–7 before continuing.
