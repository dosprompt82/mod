import { z } from "zod";
import { parseISO, isValid } from "date-fns";
import { D, Decimal } from "../decimal";

/** Accepts string | number | Decimal and yields a Decimal. Strings are preferred for money. */
export const zDecimal = z
  .union([z.string(), z.number(), z.instanceof(Decimal)])
  .transform((v, ctx) => {
    try {
      const out = new D(v as Decimal.Value);
      if (!out.isFinite()) throw new Error("not finite");
      return out as Decimal;
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid decimal: ${String(v)}` });
      return z.NEVER;
    }
  });

/** ISO date (yyyy-MM-dd) or Date, yielding a Date at local midnight. */
export const zDate = z.union([z.string(), z.date()]).transform((v, ctx) => {
  const out = typeof v === "string" ? parseISO(v) : v;
  if (!isValid(out)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid date: ${String(v)}` });
    return z.NEVER;
  }
  return out;
});

export const PaymentFrequency = z.enum(["monthly", "quarterly", "semiannual", "annual", "atMaturity"]);
export const DayCount = z.enum(["30/360", "ACT/360", "ACT/365"]);

export const Amortization = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bullet") }),
  z.object({ type: z.literal("levelPayment") }),
  z.object({
    type: z.literal("custom"),
    schedule: z.array(z.object({ date: zDate, principal: zDecimal })),
  }),
]);

/** Call or put option. Price is a fraction of outstanding principal (1.01 = 101% of par). */
export const OptionTerm = z.object({
  id: z.string().optional(),
  holder: z.enum(["issuer", "lender"]),
  /** Specific exercise dates analysed (each window should be represented by the dates to test). */
  exerciseDates: z.array(zDate).min(1),
  price: zDecimal,
});

export const RateTerms = z.discriminatedUnion("rateType", [
  z.object({ rateType: z.literal("fixed"), fixedRate: zDecimal }),
  z.object({
    rateType: z.literal("floating"),
    index: z.string(),
    spread: zDecimal,
    indexRateAtModificationDate: zDecimal,
    floor: zDecimal.optional(),
    cap: zDecimal.optional(),
    /** Whether the floor/cap applies to the index (default) or to the all-in rate. See DECISIONS.md D-007. */
    floorCapAppliesTo: z.enum(["index", "allIn"]).default("index"),
  }),
]);

const InstrumentBase = z.object({
  principalOutstanding: zDecimal,
  currency: z.string().length(3).default("USD"),
  paymentFrequency: PaymentFrequency,
  dayCount: DayCount,
  amortization: Amortization.default({ type: "bullet" }),
  pikComponent: z.object({ rate: zDecimal, capitalizes: z.boolean() }).optional(),
  maturityDate: zDate,
  /**
   * Date from which interest on the current period accrues under these terms. If omitted the
   * full coupon of the period containing the analysis date is included. See DECISIONS.md D-004.
   */
  interestAccrualStartDate: zDate.optional(),
  callOptions: z.array(OptionTerm).default([]),
  putOptions: z.array(OptionTerm).default([]),
  conversionOption: z.object({ substantive: z.boolean(), fairValue: zDecimal.optional() }).optional(),
  exitFee: zDecimal.optional(),
  /** Manually entered contingent / unusual cash flows (ASC 470-50-40-12(d)). */
  manualCashFlows: z.array(z.object({ date: zDate, amount: zDecimal, description: z.string() })).default([]),
});

export const DebtInstrument = z.intersection(InstrumentBase, RateTerms);
export type DebtInstrumentInput = z.input<typeof DebtInstrument>;
export type DebtInstrument = z.output<typeof DebtInstrument>;

export const CarryingAmount = z.object({
  principal: zDecimal,
  /** Positive = discount, negative = premium. */
  unamortizedDiscount: zDecimal.default(new D(0)),
  unamortizedDebtIssuanceCosts: zDecimal.default(new D(0)),
  accruedInterest: zDecimal.default(new D(0)),
});
export type CarryingAmount = z.output<typeof CarryingAmount>;

export const Fee = z.object({ amount: zDecimal, description: z.string().default("") });

export const PriorModification = z.object({
  modificationDate: zDate,
  /** Terms of the debt as they existed immediately before the prior modification. */
  termsBefore: DebtInstrument,
});

export const CashFlowTestInput = z.object({
  modificationDate: zDate,
  originalTerms: DebtInstrument,
  newTerms: DebtInstrument,
  /** Effective rate currently being amortized on the original debt (ASC 470-50-40-12(a)). Annual effective. */
  originalEffectiveRate: zDecimal,
  feesPaidToLender: z.array(Fee).default([]),
  feesReceivedFromLender: z.array(Fee).default([]),
  thirdPartyCosts: z.array(Fee).default([]),
  priorModificationsWithin1Year: z.array(PriorModification).default([]),
  maxScenarios: z.number().int().positive().default(256),
});
export type CashFlowTestInputRaw = z.input<typeof CashFlowTestInput>;
export type CashFlowTestInput = z.output<typeof CashFlowTestInput>;
