import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCashFlowTest } from "../src";

const dir = join(import.meta.dirname, "fixtures");
const files = readdirSync(dir).filter((f: string) => f.endsWith(".json")).sort();

describe("10% cash flow test fixtures (expected values from fixtures/reference.py + Excel)", () => {
  for (const f of files) {
    const fx = JSON.parse(readFileSync(join(dir, f), "utf8"));
    it(`${fx.id}: ${fx.description}`, () => {
      const r = runCashFlowTest(fx.input);
      expect(r.scenarios).toHaveLength(fx.expected.scenarios.length);
      r.scenarios.forEach((s, i) => {
        const e = fx.expected.scenarios[i];
        expect(s.pvOld.toDecimalPlaces(2).toNumber()).toBeCloseTo(e.pvOld, 2);
        expect(s.pvNew.toDecimalPlaces(2).toNumber()).toBeCloseTo(e.pvNew, 2);
        expect(s.pctChange.mul(100).toDecimalPlaces(4).toNumber()).toBeCloseTo(e.pctChange, 4);
      });
      expect(r.controllingPctChange.mul(100).toDecimalPlaces(4).toNumber()).toBeCloseTo(fx.expected.controllingPctChange, 4);
      expect(r.substantiallyDifferent ? "extinguishment" : "modification").toBe(fx.expected.conclusion);
    });
  }
});
