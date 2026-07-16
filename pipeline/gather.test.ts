import { describe, expect, it } from "vitest";
import { isNoiseFile, truncateDiff } from "./gather";

describe("isNoiseFile", () => {
  it("flags lockfiles, snapshots, and generated dirs", () => {
    for (const p of [
      "bun.lock",
      "package-lock.json",
      "yarn.lock",
      "src/__snapshots__/a.snap",
      "dist/bundle.js",
      ".svelte-kit/types.d.ts",
    ]) {
      expect(isNoiseFile(p), p).toBe(true);
    }
  });

  it("keeps source files", () => {
    for (const p of ["src/lib/routing/core.ts", "pipeline/tts.ts", "README.md"]) {
      expect(isNoiseFile(p), p).toBe(false);
    }
  });
});

const fileDiff = (path: string, lines = 5) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n` +
  Array.from({ length: lines }, (_, i) => `+line ${i}`).join("\n") +
  "\n";

describe("truncateDiff", () => {
  it("replaces noise-file hunks with a one-line stub", () => {
    const out = truncateDiff(fileDiff("bun.lock", 500) + fileDiff("src/app.ts"));
    expect(out).toContain("[bun.lock: changes omitted (generated/lockfile)]");
    expect(out).not.toContain("+line 400");
    expect(out).toContain("src/app.ts");
    expect(out).toContain("+line 2");
  });

  it("caps total output at maxBytes with a truncation note", () => {
    const big = fileDiff("src/a.ts", 10_000);
    const out = truncateDiff(big, 5_000);
    expect(out.length).toBeLessThanOrEqual(5_100);
    expect(out).toContain("[diff truncated");
  });
});
