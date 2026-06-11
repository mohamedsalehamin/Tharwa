import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "../../src");

/**
 * FR-016 / SC-008: net worth, goals, and real-return must never include practice
 * (SimAccount / SimTrade) data. Guard against accidental coupling at the source level.
 */
const WEALTH_SOURCES = [
  "services/net-worth.ts",
  "services/net-worth-components.ts",
  "services/net-worth-snapshots.ts",
  "services/financial-goals.ts",
  "services/real-return.ts",
  "routes/v1/net-worth.ts",
  "routes/v1/goals.ts",
];

const FORBIDDEN = /\b(simAccount|simTrade|SimAccount|SimTrade)\b/;

/** Remove line and block comments so explanatory prose (e.g. "never reads SimAccount") is ignored. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("wealth features exclude practice/sim data", () => {
  for (const rel of WEALTH_SOURCES) {
    it(`${rel} does not reference SimAccount/SimTrade in code`, () => {
      const code = stripComments(readFileSync(resolve(srcDir, rel), "utf8"));
      expect(FORBIDDEN.test(code)).toBe(false);
    });
  }
});
