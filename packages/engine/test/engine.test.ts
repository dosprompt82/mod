import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseISO } from "date-fns";
import {
  D, DebtInstrument, buildCashFlows, presentValue, solveEffectiveRate, runCashFlowTest, yearFraction,
  EffectiveRateConvergenceError, couponRate, discountFactor, type DebtInstrumentInput,
} from "../src";

const dt = parseISO;
const base: DebtInstrumentInput = {
  principalOutstanding: "1000000", rateType: "fixed", fixedRate: "0.06",
  paymentFrequency: "annual", dayCount: "30/360", maturityDate: "2030-01-01",
};
const inst = (o: Partial<DebtInstrumentInput> = {}) => DebtInstrument.parse({ ...base, ...o } as DebtInstrumentInput);

describe("yearFraction", () => {
  it("30/360 US", () => {
    expect(yearFraction(dt("2024-01-31"), dt("2024-03-31"), "30/360").toString()).toBe(new D(60).div(360).toString());
    expect(yearFraction(dt("2024-02-28"), dt("2024-03-31"), "30/360").mul(360).toNumber()).toBe(33);
  });
  it("ACT/360 vs ACT/365 in a leap year", () => {
    expect(yearFraction(dt("2024-01-01"), dt("2025-01-01"), "ACT/360").mul(360).toNumber()).toBe(366);
    expect(yearFraction(dt("2024-01-01"), dt("2025-01-01"), "ACT/365").toNumber()).toBeCloseTo(366 / 365, 12);
  });
});

describe("buildCashFlows", () => {
  it("bullet: full coupons and principal at maturity", () => {
    const f = buildCashFlows(inst(), dt("2025-01-01"));
    expect(f.filter((x) => x.kind === "interest").map((x) => x.amount.toNumber())).toEqual([60000, 60000, 60000, 60000, 60000]);
    expect(f.at(-1)!.amount.toNumber()).toBe(1000000);
  });
  it("mid-period start includes full coupon by default and a stub with accrual start", () => {
    expect(buildCashFlows(inst(), dt("2025-07-01"))[0]!.amount.toNumber()).toBe(60000);
    const s = buildCashFlows(inst({ interestAccrualStartDate: "2025-07-01" }), dt("2025-07-01"));
    expect(s[0]!.amount.toNumber()).toBe(30000);
  });
  it("month-end schedules do not drift", () => {
    const f = buildCashFlows(inst({ paymentFrequency: "monthly", maturityDate: "2025-12-31" }), dt("2025-01-15"));
    expect(f.filter((x) => x.kind === "interest").map((x) => x.date.getDate())).toContain(28);
    expect(f.at(-1)!.date.getDate()).toBe(31);
  });
  it("level payment amortizes to zero", () => {
    const f = buildCashFlows(inst({ amortization: { type: "levelPayment" } }), dt("2025-01-01"));
    const p = f.filter((x) => x.kind === "principal").reduce((s, x) => s.plus(x.amount), new D(0));
    expect(p.toNumber()).toBeCloseTo(1000000, 6);
    const totals = [2026, 2027, 2028, 2029].map((y) => f.filter((x) => x.date.getFullYear() === y).reduce((s, x) => s.plus(x.amount), new D(0)).toNumber());
    totals.forEach((t) => expect(t).toBeCloseTo(237396.4, 0));
  });
  it("custom amortization", () => {
    const f = buildCashFlows(inst({ amortization: { type: "custom", schedule: [{ date: "2027-01-01", principal: "400000" }] } }), dt("2025-01-01"));
    expect(f.find((x) => x.kind === "principal" && x.date.getFullYear() === 2027)!.amount.toNumber()).toBe(400000);
    expect(f.filter((x) => x.kind === "interest").at(-1)!.amount.toNumber()).toBe(36000);
  });
  it("capitalizing PIK compounds into principal", () => {
    const f = buildCashFlows(inst({ fixedRate: "0", pikComponent: { rate: "0.10", capitalizes: true }, maturityDate: "2027-01-01" }), dt("2025-01-01"));
    expect(f.at(-1)!.amount.toNumber()).toBeCloseTo(1210000, 6);
  });
  it("non-capitalizing PIK is simple, paid at maturity", () => {
    const f = buildCashFlows(inst({ fixedRate: "0", pikComponent: { rate: "0.10", capitalizes: false }, maturityDate: "2027-01-01" }), dt("2025-01-01"));
    expect(f.find((x) => x.kind === "pik")!.amount.toNumber()).toBeCloseTo(200000, 6);
  });
  it("zero-coupon at maturity", () => {
    const f = buildCashFlows(inst({ fixedRate: "0", paymentFrequency: "atMaturity" }), dt("2025-01-01"));
    expect(f).toHaveLength(1);
  });
  it("exit fee, manual flows and exercise truncation", () => {
    const i = inst({ exitFee: "10000", manualCashFlows: [{ date: "2026-06-30", amount: "5000", description: "earnout" }] });
    expect(buildCashFlows(i, dt("2025-01-01")).some((x) => x.kind === "fee")).toBe(true);
    const ex = buildCashFlows(i, dt("2025-01-01"), { date: dt("2026-07-01"), price: new D("1.02") });
    expect(ex.at(-1)!.amount.toNumber()).toBe(1020000);
    expect(ex.find((x) => x.date.getMonth() === 6 && x.kind === "interest")!.amount.toNumber()).toBe(30000);
    expect(() => buildCashFlows(i, dt("2025-01-01"), { date: dt("2031-01-01"), price: new D(1) })).toThrow();
  });
  it("matured debt has no flows", () => {
    expect(buildCashFlows(inst(), dt("2030-01-01"))).toEqual([]);
  });
  it("floating floors/caps on index and all-in", () => {
    const fl = (o: object) => DebtInstrument.parse({ ...base, rateType: "floating", index: "SOFR", spread: "0.02", indexRateAtModificationDate: "0.03", ...o });
    expect(couponRate(fl({ floor: "0.04" })).toNumber()).toBe(0.06);
    expect(couponRate(fl({ cap: "0.025" })).toNumber()).toBe(0.045);
    expect(couponRate(fl({ floor: "0.055", floorCapAppliesTo: "allIn" })).toNumber()).toBe(0.055);
    expect(couponRate(fl({ cap: "0.045", floorCapAppliesTo: "allIn" })).toNumber()).toBe(0.045);
  });
});

describe("presentValue / solveEffectiveRate", () => {
  it("DF convention days/365", () => {
    expect(discountFactor(new D("0.1"), dt("2025-01-01"), dt("2026-01-01")).toNumber()).toBeCloseTo(1 / 1.1, 14);
    expect(discountFactor(new D("0.1"), dt("2025-01-01"), dt("2026-01-01"), "annualEffective360").toNumber()).toBeCloseTo(Math.pow(1.1, -365 / 360), 14);
  });
  it("round trips the rate on dated flows", () => {
    const f = buildCashFlows(inst(), dt("2025-01-01"));
    const pv = presentValue(f, new D("0.0723"), dt("2025-01-01"));
    expect(solveEffectiveRate(f, pv, dt("2025-01-01")).minus("0.0723").abs().lt("1e-10")).toBe(true);
  });
  it("negative rates and bisection fallback", () => {
    const f = [{ date: dt("2026-01-01"), amount: new D(100), kind: "principal" as const }];
    expect(solveEffectiveRate(f, new D(105), dt("2025-01-01")).toNumber()).toBeCloseTo(100 / 105 - 1, 10);
    // Newton overshoots below -99% here, forcing the bisection fallback.
    expect(solveEffectiveRate(f, new D(5000), dt("2025-01-01")).toNumber()).toBeCloseTo(100 / 5000 - 1, 9);
  });
  it("throws typed error when not bracketed", () => {
    const f = [{ date: dt("2026-01-01"), amount: new D(100), kind: "principal" as const }];
    expect(() => solveEffectiveRate(f, new D(-5), dt("2025-01-01"))).toThrow(EffectiveRateConvergenceError);
  });
});

describe("runCashFlowTest edge cases", () => {
  const mk = (o: object) => ({ modificationDate: "2025-01-01", originalTerms: base, newTerms: base, originalEffectiveRate: "0.06", ...o });
  it("exactly 10.00% is an extinguishment", () => {
    const pvOld = runCashFlowTest(mk({})).scenarios[0]!.pvOld;
    const r = runCashFlowTest(mk({ feesPaidToLender: [{ amount: pvOld.mul("0.1").toString() }] }));
    expect(r.controllingPctChange.toFixed(12)).toBe("0.100000000000");
    expect(r.substantiallyDifferent).toBe(true);
    expect(r.closeToThreshold).toBe(true);
  });
  it("negative PV change uses the absolute value; fees received reduce PV_new", () => {
    const r = runCashFlowTest(mk({ feesReceivedFromLender: [{ amount: "50000" }] }));
    expect(r.scenarios[0]!.change.isNegative()).toBe(true);
    expect(r.controllingPctChange.isPositive()).toBe(true);
  });
  it("warnings for contingent flows, third-party costs, scenario cap", () => {
    const nt = { ...base, callOptions: [{ holder: "issuer", exerciseDates: ["2026-01-01", "2027-01-01", "2028-01-01"], price: "1" }], manualCashFlows: [{ date: "2026-01-01", amount: "1", description: "x" }] };
    const r = runCashFlowTest(mk({ newTerms: nt, originalTerms: { ...base, putOptions: [{ holder: "lender", exerciseDates: ["2026-01-01"], price: "1" }], conversionOption: { substantive: true } }, thirdPartyCosts: [{ amount: "1" }], maxScenarios: 3 }));
    expect(r.warnings.map((w) => w.code).sort()).toEqual(["CONTINGENT_JUDGMENT", "SCENARIO_CAP", "THIRD_PARTY_EXCLUDED"]);
    expect(r.scenarios).toHaveLength(3);
    expect(r.citations).toContain("ASC 470-50-40-12(e)");
  });
  it("prior modification older than one year is ignored", () => {
    const r = runCashFlowTest(mk({ priorModificationsWithin1Year: [{ modificationDate: "2023-12-31", termsBefore: { ...base, fixedRate: "0.1" } }] }));
    expect(r.lookbackApplied).toBe(false);
  });
  it("multiple prior modifications: earliest within the year controls", () => {
    const r = runCashFlowTest(mk({ priorModificationsWithin1Year: [
      { modificationDate: "2024-10-01", termsBefore: { ...base, fixedRate: "0.07" } },
      { modificationDate: "2024-03-01", termsBefore: { ...base, fixedRate: "0.09" } },
    ] }));
    expect(r.scenarios[0]!.oldFlows[0]!.amount.toNumber()).toBe(90000);
  });
  it("custom amortization schedule is sorted", () => {
    const f = buildCashFlows(inst({ amortization: { type: "custom", schedule: [{ date: "2028-01-01", principal: "100000" }, { date: "2027-01-01", principal: "100000" }] } }), dt("2025-01-01"));
    expect(f.filter((x) => x.kind === "principal")).toHaveLength(3);
  });
  it("rejects invalid input", () => {
    expect(() => runCashFlowTest(mk({ originalEffectiveRate: "abc" }))).toThrow();
    expect(() => runCashFlowTest(mk({ modificationDate: "nope" }))).toThrow();
  });
  it("property: identical terms, no fees → 0% change", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e9 }), fc.integer({ min: 0, max: 2000 }), fc.integer({ min: 1, max: 1500 }),
        fc.constantFrom("monthly", "quarterly", "semiannual", "annual", "atMaturity"), fc.constantFrom("30/360", "ACT/360", "ACT/365"),
        fc.integer({ min: 0, max: 3000 }),
        (p, bps, eirBps, freq, dc, matDays) => {
          const t = { ...base, principalOutstanding: String(p), fixedRate: String(bps / 10000), paymentFrequency: freq, dayCount: dc, maturityDate: new Date(2025, 0, 2 + matDays) };
          const r = runCashFlowTest(mk({ originalTerms: t, newTerms: t, originalEffectiveRate: String(eirBps / 10000) }));
          return r.controllingPctChange.isZero() && !r.substantiallyDifferent;
        },
      ),
      { numRuns: 60 },
    );
  });
});
