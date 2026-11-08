import { differenceInCalendarDays } from "date-fns";
import { D, Decimal, ZERO } from "./decimal";
import type { DatedCashFlow } from "./cashflows";

/**
 * Discounting convention. Default "annualEffective365": DF = (1 + r)^(−days/365).
 * The same convention is used to solve effective rates and to discount (ASC 470-50-40-12(a)
 * requires discounting at the original effective rate; consistency avoids a spurious change).
 */
export type DiscountConvention = "annualEffective365" | "annualEffective360";

function basis(conv: DiscountConvention): number {
  return conv === "annualEffective360" ? 360 : 365;
}

export function discountFactor(rate: Decimal, asOf: Date, date: Date, conv: DiscountConvention = "annualEffective365"): Decimal {
  const t = new D(differenceInCalendarDays(date, asOf)).div(basis(conv));
  return rate.plus(1).pow(t.neg());
}

/** Present value of dated flows at `asOf`. Flows dated on `asOf` are undiscounted (t = 0). */
export function presentValue(
  flows: readonly DatedCashFlow[],
  annualRate: Decimal,
  asOfDate: Date,
  convention: DiscountConvention = "annualEffective365",
): Decimal {
  return flows.reduce((s, f) => s.plus(f.amount.mul(discountFactor(annualRate, asOfDate, f.date, convention))), ZERO);
}

/** d PV / d r */
function pvDerivative(flows: readonly DatedCashFlow[], r: Decimal, asOf: Date, conv: DiscountConvention): Decimal {
  const b = basis(conv);
  return flows.reduce((s, f) => {
    const t = new D(differenceInCalendarDays(f.date, asOf)).div(b);
    return s.minus(f.amount.mul(t).mul(r.plus(1).pow(t.neg().minus(1))));
  }, ZERO);
}

export class EffectiveRateConvergenceError extends Error {
  readonly code = "EFFECTIVE_RATE_NO_CONVERGENCE";
  constructor(message: string) {
    super(message);
    this.name = "EffectiveRateConvergenceError";
  }
}

/**
 * Solves r such that presentValue(flows, r, asOf) = pv (an IRR on dated flows).
 * Used for the original effective rate (ASC 470-50-40-12(a)) and new effective rates
 * (ASC 470-50-40-14; ASC 835-30). Newton–Raphson with bisection fallback; tolerance 1e-12;
 * max 200 iterations. Throws EffectiveRateConvergenceError if no root is found.
 */
export function solveEffectiveRate(
  flows: readonly DatedCashFlow[],
  pv: Decimal,
  asOfDate: Date,
  convention: DiscountConvention = "annualEffective365",
): Decimal {
  const tol = new D("1e-12");
  const maxIter = 200;
  const f = (r: Decimal) => presentValue(flows, r, asOfDate, convention).minus(pv);
  const scale = Decimal.max(pv.abs(), new D(1));

  // Newton
  let r = new D("0.05");
  for (let i = 0; i < maxIter; i++) {
    const fr = f(r);
    if (fr.abs().div(scale).lt(tol)) return r;
    const dfr = pvDerivative(flows, r, asOfDate, convention);
    if (dfr.isZero()) break;
    const next = r.minus(fr.div(dfr));
    if (!next.isFinite() || next.lte(-0.99)) break;
    if (next.minus(r).abs().lt(tol)) return next;
    r = next;
  }

  // Bisection fallback on [-0.99, 10]
  let lo = new D("-0.99");
  let hi = new D(10);
  let flo = f(lo);
  const fhi = f(hi);
  if (flo.isPositive() === fhi.isPositive()) {
    throw new EffectiveRateConvergenceError("No sign change: effective rate not bracketed in [-99%, 1000%]");
  }
  for (let i = 0; i < maxIter; i++) {
    const mid = lo.plus(hi).div(2);
    const fm = f(mid);
    if (fm.abs().div(scale).lt(tol) || hi.minus(lo).lt(tol)) return mid;
    if (fm.isPositive() === flo.isPositive()) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  throw new EffectiveRateConvergenceError("Effective rate did not converge in 200 iterations");
}
