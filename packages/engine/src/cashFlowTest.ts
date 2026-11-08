import { isAfter, subYears, isBefore, compareAsc, format } from "date-fns";
import { D, Decimal, ZERO } from "./decimal";
import { buildCashFlows, type DatedCashFlow, type ExerciseAssumption } from "./cashflows";
import { presentValue, type DiscountConvention } from "./pv";
import { CashFlowTestInput, type CashFlowTestInputRaw, type DebtInstrument } from "./schemas";

/** ASC 470-50-40-10: substantially different if the PV change is at least 10%. */
export const TEN_PERCENT = new D("0.10");
export const CLOSE_LOW = new D("0.09");
export const CLOSE_HIGH = new D("0.11");

export interface Warning {
  code: string;
  message: string;
  citation?: string;
}

export interface ScenarioResult {
  id: string;
  label: string;
  oldExercise: ExerciseAssumption | null;
  newExercise: ExerciseAssumption | null;
  oldFlows: DatedCashFlow[];
  newFlows: DatedCashFlow[];
  pvOld: Decimal;
  /** PV of new contractual flows only (before t=0 fees). */
  pvNewContractual: Decimal;
  /** Fees paid to lender less fees received from lender, at t=0 (undiscounted). */
  netFeesToLender: Decimal;
  pvNew: Decimal;
  change: Decimal;
  /** |PV_new − PV_old| ÷ PV_old */
  pctChange: Decimal;
}

export interface CashFlowTestResult {
  discountRate: Decimal;
  lookbackApplied: boolean;
  scenarios: ScenarioResult[];
  controllingScenarioId: string;
  controllingPctChange: Decimal;
  substantiallyDifferent: boolean;
  closeToThreshold: boolean;
  warnings: Warning[];
  citations: string[];
}

type Choice = { label: string; exercise: ExerciseAssumption | null };

function exerciseChoices(inst: DebtInstrument, modDate: Date, which: "Old" | "New"): Choice[] {
  const out: Choice[] = [{ label: `${which}: not exercised`, exercise: null }];
  const add = (kind: string, o: DebtInstrument["callOptions"][number]) => {
    for (const dt of o.exerciseDates) {
      if (isAfter(dt, modDate) && !isAfter(dt, inst.maturityDate)) {
        out.push({
          label: `${which}: ${kind} (${o.holder}) exercised ${format(dt, "yyyy-MM-dd")} at ${o.price.mul(100).toString()}%`,
          exercise: { date: dt, price: o.price },
        });
      }
    }
  };
  inst.callOptions.forEach((o) => add("call", o));
  inst.putOptions.forEach((o) => add("put", o));
  return out;
}

/**
 * The 10% cash flow test (ASC 470-50-40-10 and 40-12).
 *
 * - Both sets of flows are discounted at the original effective rate (40-12(a)).
 * - Floating rates use the index at the modification date, held flat (40-12(b)) — see couponRate.
 * - Calls/puts: every exercise/non-exercise combination is run; the scenario producing the
 *   smaller change controls (40-12(c)).
 * - Fees paid to / received from the creditor are t=0 flows in PV_new; third-party costs are
 *   excluded (40-12(a), 40-17).
 * - Prior non-extinguishment modifications within one year: test against the terms that existed
 *   one year ago (40-12(f)).
 * - Conversion option value is excluded (40-12(e)); tested separately.
 */
export function runCashFlowTest(raw: CashFlowTestInputRaw, convention: DiscountConvention = "annualEffective365"): CashFlowTestResult {
  const input = CashFlowTestInput.parse(raw);
  const modDate = input.modificationDate;
  const rate = input.originalEffectiveRate;
  const warnings: Warning[] = [];
  const citations = new Set<string>(["ASC 470-50-40-10", "ASC 470-50-40-12(a)"]);

  // ASC 470-50-40-12(f): one-year lookback.
  const oneYearAgo = subYears(modDate, 1);
  const priorInWindow = input.priorModificationsWithin1Year
    .filter((p) => !isBefore(p.modificationDate, oneYearAgo) && isBefore(p.modificationDate, modDate))
    .sort((a, b) => compareAsc(a.modificationDate, b.modificationDate));
  const lookbackApplied = priorInWindow.length > 0;
  const oldTerms = lookbackApplied ? priorInWindow[0]!.termsBefore : input.originalTerms;
  if (lookbackApplied) {
    citations.add("ASC 470-50-40-12(f)");
    warnings.push({
      code: "LOOKBACK_APPLIED",
      message: `A modification within the past year (${format(priorInWindow[0]!.modificationDate, "yyyy-MM-dd")}) was not accounted for as an extinguishment; the test compares against the terms that existed immediately before it.`,
      citation: "ASC 470-50-40-12(f)",
    });
  }

  if (input.originalTerms.rateType === "floating" || input.newTerms.rateType === "floating" || oldTerms.rateType === "floating") {
    citations.add("ASC 470-50-40-12(b)");
  }
  for (const [name, inst] of [["original", oldTerms], ["new", input.newTerms]] as const) {
    if (inst.manualCashFlows.length > 0) {
      citations.add("ASC 470-50-40-12(d)");
      warnings.push({
        code: "CONTINGENT_JUDGMENT",
        message: `User-entered contingent/unusual cash flows are included for the ${name} debt. These are a user-asserted judgment.`,
        citation: "ASC 470-50-40-12(d)",
      });
    }
    if (inst.conversionOption) citations.add("ASC 470-50-40-12(e)");
  }

  const feesPaid = input.feesPaidToLender.reduce((s, f) => s.plus(f.amount), ZERO);
  const feesRecv = input.feesReceivedFromLender.reduce((s, f) => s.plus(f.amount), ZERO);
  const netFees = feesPaid.minus(feesRecv);

  const oldChoices = exerciseChoices(oldTerms, modDate, "Old");
  const newChoices = exerciseChoices(input.newTerms, modDate, "New");
  const hasOptions = oldChoices.length > 1 || newChoices.length > 1;
  if (hasOptions) citations.add("ASC 470-50-40-12(c)");

  let pairs: [Choice, Choice][] = [];
  for (const o of oldChoices) for (const n of newChoices) pairs.push([o, n]);
  if (pairs.length > input.maxScenarios) {
    warnings.push({
      code: "SCENARIO_CAP",
      message: `${pairs.length} call/put scenarios exceed the cap of ${input.maxScenarios}; only the first ${input.maxScenarios} were run. Reduce the exercise dates tested.`,
      citation: "ASC 470-50-40-12(c)",
    });
    pairs = pairs.slice(0, input.maxScenarios);
  }

  const scenarios: ScenarioResult[] = pairs.map(([o, n], idx) => {
    const oldFlows = buildCashFlows(oldTerms, modDate, o.exercise ?? undefined);
    const newFlows = buildCashFlows(input.newTerms, modDate, n.exercise ?? undefined);
    const pvOld = presentValue(oldFlows, rate, modDate, convention);
    const pvNewContractual = presentValue(newFlows, rate, modDate, convention);
    const pvNew = pvNewContractual.plus(netFees);
    const change = pvNew.minus(pvOld);
    return {
      id: `S${idx + 1}`,
      label: hasOptions ? `${o.label} / ${n.label}` : "Base case",
      oldExercise: o.exercise,
      newExercise: n.exercise,
      oldFlows,
      newFlows,
      pvOld,
      pvNewContractual,
      netFeesToLender: netFees,
      pvNew,
      change,
      pctChange: change.abs().div(pvOld),
    };
  });

  // ASC 470-50-40-12(c): the scenario producing the smaller change controls.
  const controlling = scenarios.reduce((a, b) => (b.pctChange.lt(a.pctChange) ? b : a));
  const pct = controlling.pctChange;
  // Compared unrounded; display is rounded to 2 decimals (D-008).
  // A 1e-12 tolerance absorbs decimal arithmetic noise only (D-008).
  const substantiallyDifferent = pct.toDecimalPlaces(12).gte(TEN_PERCENT);
  const closeToThreshold = pct.gte(CLOSE_LOW) && pct.lte(CLOSE_HIGH);
  if (closeToThreshold) {
    warnings.push({
      code: "CLOSE_TO_THRESHOLD",
      message: `The PV change of ${pct.mul(100).toFixed(2)}% is within 9%–11% of the 10% threshold. Inputs (especially fees and the discount rate) should be verified.`,
      citation: "ASC 470-50-40-10",
    });
  }
  if (input.thirdPartyCosts.length > 0) {
    warnings.push({
      code: "THIRD_PARTY_EXCLUDED",
      message: "Third-party costs are excluded from the cash flow test.",
      citation: "ASC 470-50-40-12(a)",
    });
  }

  return {
    discountRate: rate,
    lookbackApplied,
    scenarios,
    controllingScenarioId: controlling.id,
    controllingPctChange: pct,
    substantiallyDifferent,
    closeToThreshold,
    warnings,
    citations: [...citations],
  };
}
