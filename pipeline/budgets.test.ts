import { describe, expect, it } from "vitest";
import { BUDGETS, estimateSpokenSeconds, fitsBody, fitsTitle, narrationBudgetCheck } from "./budgets";

describe("budgets", () => {
  it("accepts titles within 48 chars and rejects longer", () => {
    expect(fitsTitle("Nested Sub-Agents")).toBe(true);
    expect(fitsTitle("x".repeat(49))).toBe(false);
  });

  it("accepts bodies within 320 chars and rejects longer", () => {
    expect(fitsBody("Short body.")).toBe(true);
    expect(fitsBody("x".repeat(321))).toBe(false);
  });

  it("estimates spoken duration at 150 wpm", () => {
    const thirtyWords = Array(30).fill("word").join(" ");
    expect(estimateSpokenSeconds(thirtyWords)).toBeCloseTo(12, 0); // 30 / 2.5
  });

  it("flags narration outside 28-55s", () => {
    const w = (n: number) => Array(n).fill("word").join(" ");
    expect(narrationBudgetCheck([w(100)]).ok).toBe(true); // 40s
    expect(narrationBudgetCheck([w(20)]).ok).toBe(false); // 8s — too short
    expect(narrationBudgetCheck([w(200)]).ok).toBe(false); // 80s — too long
  });

  it("exposes the budget constants", () => {
    expect(BUDGETS.titleMaxChars).toBe(48);
    expect(BUDGETS.narration).toEqual({ minSeconds: 28, maxSeconds: 55 });
  });
});
