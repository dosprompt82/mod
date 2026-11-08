import { differenceInCalendarDays } from "date-fns";
import { D, Decimal } from "./decimal";

export type DayCountConvention = "30/360" | "ACT/360" | "ACT/365";

/**
 * Accrual year fraction between two dates.
 * 30/360 is the US (bond basis) variant: D1=31→30; D2=31→30 only when D1 is 30 or 31.
 */
export function yearFraction(start: Date, end: Date, dc: DayCountConvention): Decimal {
  switch (dc) {
    case "ACT/360":
      return new D(differenceInCalendarDays(end, start)).div(360);
    case "ACT/365":
      return new D(differenceInCalendarDays(end, start)).div(365);
    case "30/360": {
      let d1 = start.getDate();
      let d2 = end.getDate();
      if (d1 === 31) d1 = 30;
      if (d2 === 31 && d1 === 30) d2 = 30;
      const days =
        360 * (end.getFullYear() - start.getFullYear()) + 30 * (end.getMonth() - start.getMonth()) + (d2 - d1);
      return new D(days).div(360);
    }
  }
}
