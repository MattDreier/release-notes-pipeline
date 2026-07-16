import { describe, expect, it } from "vitest";
import { contentBodySize, contentTitleSize, outroHeadlineSize } from "./sizing";

describe("sizing", () => {
  it("steps content titles down as they grow", () => {
    expect(contentTitleSize("Nested Sub-Agents")).toBe(150); // 17 chars
    expect(contentTitleSize("The Range Comes With You")).toBe(120); // 24 chars
    expect(contentTitleSize("x".repeat(48))).toBe(96); // max schema length
  });

  it("steps body copy down and tightens leading as it grows", () => {
    expect(contentBodySize("short")).toEqual({ fontSize: 44, lineHeight: 1.6 });
    expect(contentBodySize("x".repeat(250))).toEqual({ fontSize: 40, lineHeight: 1.5 });
    expect(contentBodySize("x".repeat(320))).toEqual({ fontSize: 36, lineHeight: 1.45 });
  });

  it("steps outro headlines down for long product names", () => {
    expect(outroHeadlineSize("Dispatch News")).toBe(150); // 13 chars
    expect(outroHeadlineSize("Grow Tent Planner News")).toBe(110); // 22 chars
    expect(outroHeadlineSize("dispatch-schedule-ui News")).toBe(84); // 25 chars — the #189 overflow
  });
});
