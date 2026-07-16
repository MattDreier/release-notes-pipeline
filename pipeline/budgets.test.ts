import { describe, expect, it } from "vitest";
import {
  BUDGETS,
  estimateSpokenSeconds,
  fitsBody,
  fitsTitle,
  narrationBudgetCheck,
  slidePacingCheck,
} from "./budgets";

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

  it("enforces only the ceiling — shortness is the critic's call, never failed locally", () => {
    const w = (n: number) => Array(n).fill("word").join(" ");
    expect(narrationBudgetCheck([w(100)]).ok).toBe(true); // 40s
    expect(narrationBudgetCheck([w(20)]).ok).toBe(true); // 8s — short is fine when the message is told
    const over = narrationBudgetCheck([w(200)]); // 80s — too long
    expect(over.ok).toBe(false);
    expect(over.reason).toContain("do NOT compress wording");
  });

  it("exposes the budget constants", () => {
    expect(BUDGETS.titleMaxChars).toBe(48);
    expect(BUDGETS.narration).toEqual({ aimMinSeconds: 28, maxSeconds: 55 });
    expect(BUDGETS.maxSlides).toBe(6);
    expect(BUDGETS.slideMaxSeconds).toBe(12);
  });

  it("only flags true pacing outliers — a clear 9s slide is fine", () => {
    const w = (n: number) => Array(n).fill("word").join(" ");
    expect(slidePacingCheck([w(15), w(23)]).ok).toBe(true); // 6s, 9.2s — clarity wins
    const r = slidePacingCheck([w(15), w(35)]); // slide 2 = 14s — genuine outlier
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("slide 2");
    expect(r.reason).toContain("split");
  });
});
