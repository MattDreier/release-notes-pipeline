import { describe, expect, it } from "vitest";
import {
  BUDGETS,
  estimateSpokenSeconds,
  fitsBody,
  fitsTitle,
  narrationBudgetCheck,
  slidePacingCheck,
  stripDeliveryTags,
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

  it("estimates spoken duration from the calibrated pace constant", () => {
    const thirtyWords = Array(30).fill("word").join(" ");
    expect(estimateSpokenSeconds(thirtyWords)).toBeCloseTo(30 / BUDGETS.wordsPerSecond, 5);
  });

  it("strips delivery tags before timing — tags direct the voice, they are not spoken", () => {
    // 10 words + a tag ⇒ still timed as 10 words
    const script = "[with quiet excitement] one two three four five six seven eight nine ten";
    expect(estimateSpokenSeconds(script)).toBeCloseTo(10 / BUDGETS.wordsPerSecond, 5);
    expect(stripDeliveryTags("[serious] Heads up. [slower] It changed.")).toBe(
      "Heads up. It changed.",
    );
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
