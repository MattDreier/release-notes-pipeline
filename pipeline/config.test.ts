import { describe, expect, it } from "vitest";
import { dateVersion, loadRepoConfig } from "./config";

describe("config", () => {
  it("applies defaults when config file is absent", () => {
    const c = loadRepoConfig(undefined, "dispatch-schedule-ui");
    expect(c.product).toBe("dispatch-schedule-ui");
    expect(c.ttsModel).toBe("gemini-3.1-flash-tts-preview");
    expect(c.voice).toBeTruthy();
    expect(c.brand).toBe("Matt Dreier"); // bottom-right corner defaults to Matt's name
  });

  it("merges overrides over defaults", () => {
    const c = loadRepoConfig(
      { product: "Dispatch", brand: "MPOWR", domain: "dispatch.solarinbound.com" },
      "dispatch-schedule-ui",
    );
    expect(c.product).toBe("Dispatch");
    expect(c.brand).toBe("MPOWR");
    expect(c.ttsModel).toBe("gemini-3.1-flash-tts-preview");
  });

  it("rejects malformed config", () => {
    expect(() => loadRepoConfig({ ttsModel: 42 }, "x")).toThrow();
  });

  it("formats date versions without zero padding", () => {
    expect(dateVersion(new Date(2026, 6, 15))).toBe("v2026.7.15");
    expect(dateVersion(new Date(2026, 11, 3))).toBe("v2026.12.3");
  });
});
