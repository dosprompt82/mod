import { addMonths, isAfter, isBefore, compareAsc } from "date-fns";
import { D, Decimal, ZERO } from "./decimal";
import { yearFraction } from "./daycount";
import type { DebtInstrument } from "./schemas";

export type CashFlowKind = "interest" | "principal" | "pik" | "fee" | "optionPremium" | "manual";

export interface DatedCashFlow {
  date: Date;
  amount: Decimal;
  kind: CashFlowKind;
  description?: string;
}

/** Exercise of a call or put: all remaining principal repaid at `price` × par on `date`. */
export interface ExerciseAssumption {
  date: Date;
  price: Decimal;
}

const MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

/**
 * Contractual coupon rate for one period.
 * Floating rates are projected at the index in effect on the modification date, held flat,
 * with floors/caps applied (ASC 470-50-40-12(b)).
 */
export function couponRate(inst: DebtInstrument): Decimal {
  if (inst.rateType === "fixed") return inst.fixedRate;
  const clamp = (r: Decimal) => {
    let out = r;
    if (inst.floor !== undefined && out.lt(inst.floor)) out = inst.floor;
    if (inst.cap !== undefined && out.gt(inst.cap)) out = inst.cap;
    return out;
  };
  if (inst.floorCapAppliesTo === "allIn") return clamp(inst.indexRateAtModificationDate.plus(inst.spread));
  return clamp(inst.indexRateAtModificationDate).plus(inst.spread);
}

/**
 * Regular payment dates, rolled backward from maturity (each date computed directly from maturity,
 * so month-end dates do not drift). Returns ascending dates; the first element is the start of the
 * period containing `fromDate` (on or before fromDate). No business-day adjustment (MVP; D-005).
 */
export function paymentSchedule(inst: DebtInstrument, fromDate: Date): Date[] {
  const m = MONTHS[inst.paymentFrequency];
  if (m === undefined) {
    // At maturity: a single period from the accrual start (or fromDate) to maturity.
    return [inst.interestAccrualStartDate ?? fromDate, inst.maturityDate];
  }
  const dates: Date[] = [];
  for (let k = 0; ; k++) {
    const dt = addMonths(inst.maturityDate, -k * m);
    dates.push(dt);
    if (!isAfter(dt, fromDate)) break;
    if (k > 12 * 200) throw new Error("schedule too long");
  }
  return dates.reverse();
}

/**
 * Builds the remaining contractual cash flows of an instrument after `fromDate`.
 *
 * - Flows dated on or before `fromDate` are excluded (they are settled/accrued; D-003).
 * - The coupon of the period containing `fromDate` is the full contractual coupon unless
 *   `interestAccrualStartDate` falls inside it (D-004).
 * - Level payment: payment = P·i/(1−(1+i)^−n) with i = rate/frequency, recomputed on the
 *   remaining periods; principal portion = payment − i·balance (D-006).
 * - PIK: capitalizing PIK compounds into principal paid at later dates; non-capitalizing PIK
 *   accrues simple and is paid at maturity (ASC 470-50-40-12 — PIK treated as principal flows).
 * - `exercise` truncates the instrument at a call/put date (ASC 470-50-40-12(c)).
 */
export function buildCashFlows(
  inst: DebtInstrument,
  fromDate: Date,
  exercise?: ExerciseAssumption,
): DatedCashFlow[] {
  if (!isAfter(inst.maturityDate, fromDate)) return [];
  let dates = paymentSchedule(inst, fromDate);
  const endDate = exercise ? exercise.date : inst.maturityDate;
  if (exercise) {
    if (!isAfter(exercise.date, fromDate) || isAfter(exercise.date, inst.maturityDate)) {
      throw new Error("Exercise date must be after the analysis date and on/before maturity");
    }
    const kept = dates.filter((x) => isBefore(x, exercise.date));
    dates = [...kept, exercise.date];
  }
  const rate = couponRate(inst);
  const pikRate = inst.pikComponent?.rate ?? ZERO;
  const capitalizes = inst.pikComponent?.capitalizes ?? false;
  const freq = MONTHS[inst.paymentFrequency];
  const custom =
    inst.amortization.type === "custom"
      ? [...inst.amortization.schedule].sort((a, b) => compareAsc(a.date, b.date))
      : [];

  const flows: DatedCashFlow[] = [];
  let balance = inst.principalOutstanding;
  let pikAccrued = ZERO;

  for (let i = 1; i < dates.length; i++) {
    const start0 = dates[i - 1]!;
    const end = dates[i]!;
    const accrualStart =
      inst.interestAccrualStartDate && isAfter(inst.interestAccrualStartDate, start0)
        ? inst.interestAccrualStartDate
        : start0;
    const yf = isBefore(accrualStart, end) ? yearFraction(accrualStart, end, inst.dayCount) : ZERO;
    const interest = balance.mul(rate).mul(yf);
    const pik = balance.mul(pikRate).mul(yf);
    if (capitalizes) balance = balance.plus(pik);
    else pikAccrued = pikAccrued.plus(pik);

    const isLast = i === dates.length - 1;
    let principal = ZERO;
    if (isLast) {
      principal = balance;
    } else if (inst.amortization.type === "levelPayment" && freq !== undefined) {
      const remaining = dates.length - i; // periods remaining including this one
      const pr = rate.div(12 / freq);
      const payment = pr.isZero()
        ? balance.div(remaining)
        : balance.mul(pr).div(new D(1).minus(pr.plus(1).pow(-remaining)));
      principal = Decimal.min(payment.minus(balance.mul(pr)), balance);
    } else if (inst.amortization.type === "custom") {
      principal = custom
        .filter((c) => isAfter(c.date, start0) && !isAfter(c.date, end))
        .reduce((s, c) => s.plus(c.principal), ZERO);
      principal = Decimal.min(principal, balance);
    }

    if (isAfter(end, fromDate)) {
      if (!interest.isZero()) flows.push({ date: end, amount: interest, kind: "interest" });
      if (isLast && exercise) {
        flows.push({ date: end, amount: principal.mul(exercise.price), kind: "principal", description: "Exercise" });
      } else if (!principal.isZero()) {
        flows.push({ date: end, amount: principal, kind: "principal" });
      }
      if (isLast && !pikAccrued.isZero()) {
        const amt = exercise ? pikAccrued.mul(exercise.price) : pikAccrued;
        flows.push({ date: end, amount: amt, kind: "pik", description: "Non-capitalizing PIK" });
      }
    }
    balance = balance.minus(principal);
  }

  if (!exercise && inst.exitFee && !inst.exitFee.isZero()) {
    flows.push({ date: inst.maturityDate, amount: inst.exitFee, kind: "fee", description: "Exit fee" });
  }
  for (const mcf of inst.manualCashFlows) {
    if (isAfter(mcf.date, fromDate) && !isAfter(mcf.date, endDate)) {
      flows.push({ date: mcf.date, amount: mcf.amount, kind: "manual", description: mcf.description });
    }
  }
  return flows.sort((a, b) => compareAsc(a.date, b.date));
}

