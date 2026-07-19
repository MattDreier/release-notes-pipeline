import { describe, expect, it } from "vitest";
import { extractImageUrls, isNoiseFile, isTransientGhError, truncateDiff, truncateIssueBody } from "./gather";

describe("extractImageUrls", () => {
  it("finds markdown and html images, deduped", () => {
    const body = `Before:\n![before](https://github.com/user-attachments/assets/abc.png)\n
After: <img src="https://github.com/user-attachments/assets/def.png" width="400">\n
Dupe: ![x](https://github.com/user-attachments/assets/abc.png)`;
    expect(extractImageUrls(body)).toEqual([
      "https://github.com/user-attachments/assets/abc.png",
      "https://github.com/user-attachments/assets/def.png",
    ]);
  });

  it("returns empty for image-free bodies", () => {
    expect(extractImageUrls("just text, no [links](https://x.com)")).toEqual([]);
  });
});

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

describe("truncateIssueBody", () => {
  it("passes short bodies through untouched", () => {
    expect(truncateIssueBody("a short user story")).toBe("a short user story");
  });

  it("caps long bodies with a truncation note", () => {
    const out = truncateIssueBody("x".repeat(10_000), 4_000);
    expect(out.length).toBeLessThan(4_100);
    expect(out).toContain("[issue body truncated at 4000 characters]");
  });
});

describe("isTransientGhError", () => {
  it("matches GitHub 5xx and connection-level failures", () => {
    expect(isTransientGhError("could not find pull request diff: HTTP 503: 503 Service Unavailable (https://api.github.com/...)")).toBe(true);
    expect(isTransientGhError("HTTP 502: Bad Gateway")).toBe(true);
    expect(isTransientGhError("Gateway Timeout")).toBe(true);
    expect(isTransientGhError("read: connection reset by peer")).toBe(true);
  });

  it("fails fast on auth and not-found errors", () => {
    expect(isTransientGhError("HTTP 401: Bad credentials")).toBe(false);
    expect(isTransientGhError("HTTP 404: Not Found")).toBe(false);
    expect(isTransientGhError("GraphQL: Could not resolve to a PullRequest")).toBe(false);
  });
});
