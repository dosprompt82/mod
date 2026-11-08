import Decimal from "decimal.js";

/**
 * Engine-wide Decimal constructor. All monetary and rate math uses this.
 * Precision is high so that rounding happens only at display time.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
export type D = Decimal;
export { Decimal };

export const ZERO = new D(0);
export const ONE = new D(1);

