# DECISIONS.md: Judgment calls and open questions

Status key: **OPEN** = needs Josh's confirmation; **DECIDED** = implemented, can be revisited.

| ID | Status | Topic | Decision / question |
|----|--------|-------|---------------------|
| D-001 | DECIDED | Discount convention | Annual effective rate, DF = (1+r)^(−days/365), per spec §5. The same convention is used to solve and to discount. `annualEffective360` is available. |
| D-002 | DECIDED | Day count 30/360 | US 30/360 (bond basis). European 30E/360 is not implemented yet. |
| D-003 | OPEN | Flows on the modification date | Contractual flows dated **on** the modification date are treated as settled and are excluded from PV_old and PV_new. Only fees at t=0 are included in PV_new. Confirm. |
| D-004 | OPEN | Coupon of the period containing the modification date | By default the **full** contractual coupon for that period is included under each set of terms, even though part of it is accrued interest. Accrued interest is tracked separately in CarryingAmount. Set `interestAccrualStartDate` on the new terms to accrue the new rate only from the modification date. Should the default instead split the period (old rate before the mod date, new rate after)? |
| D-005 | DECIDED | Business-day convention | None in the MVP. Payment dates are unadjusted and rolled back from maturity, so month-end dates don't drift. |
| D-006 | DECIDED | Level payment | Payment = P·i/(1−(1+i)^−n) with i = nominal rate ÷ frequency. Principal = payment − i·balance. Interest is still accrued by day count, so the total cash payment can vary slightly when ACT conventions are used. |
| D-007 | OPEN | Floors and caps | Spec §4.4 says to "apply floors and caps to that rate." Default: they apply to the **index** (the usual SOFR-floor drafting). An `allIn` option exists. Confirm the default. |
| D-008 | DECIDED | Threshold comparison | % change is compared unrounded against 10%. A 1e-12 tolerance absorbs only decimal arithmetic noise, so exactly 10.00% counts as an extinguishment. Display is rounded to 2 decimals. Close-to-threshold band is 9%–11% inclusive. |
| D-009 | OPEN | Lookback discount rate | When the one-year lookback applies (40-12(f)), the engine discounts at the user-entered `originalEffectiveRate`. Should that be the effective rate of the debt as it stood one year ago, rather than the rate currently being amortized? |
| D-010 | OPEN | Lookback fees | Fees paid to the lender in the prior modification(s) within the year are **not** yet included in the lookback test. Many firm guides include them. Confirm, and say how they should be timed (t=0 at the current mod date, or discounted from the prior date). |
| D-011 | DECIDED | Call/put scenarios | Each instrument is either not exercised or exercised on one of its listed dates (calls and puts combined). Old × new choices form a cartesian product, capped at 256 by default with a warning. Windows must be entered as specific dates to test. |
| D-012 | OPEN | Exercise mechanics | On exercise: accrued coupon to the exercise date plus price × outstanding principal (including capitalized PIK). Non-capitalizing accrued PIK is also paid at price. Exit fees are **not** paid on early exercise. Confirm the exit-fee treatment. |
| D-013 | DECIDED | Non-capitalizing PIK | Accrues simple interest on the outstanding balance and is paid at maturity. |
| D-014 | DECIDED | Fixture 3 (maturity extension) | The coupon equals the EIR (6%), so the change is about 0.01% (a leap-day effect of ACT/365 discounting against 30/360 coupons). Result: modification. |
| D-015 | LATER | Revolver ↔ term loan conversions | 470-50-40-22/23 are out of MVP scope. The engine will show an "outside scope, consult" message (Phase 4). |
