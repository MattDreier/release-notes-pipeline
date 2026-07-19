import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assetDir,
  discoverCommittedComparisons,
  isCommittedAssetPath,
  parseComparisonManifest,
  resolveImageSource,
} from "./comparisons";

// The exact shape dispatch-schedule-ui's scripts/smoke-tz.ts writes — extra keys
// (title, scenario, observed…) must be tolerated and ignored.
const producerManifest = {
  pr: 266,
  title: "Universal / Local timezone modes",
  generatedBy: "scripts/smoke-tz.ts",
  scenario: "two work orders both at 10:00am site-local",
  comparisons: [
    {
      before: "before.png",
      after: "after.png",
      beforeLabel: "Local — one axis zone",
      afterLabel: "Universal — site-local + zone suffix",
      caption: "cross-zone jobs self-identify with EDT / CDT",
      observed: { before: [{ title: "Hoffman", time: "10:00am" }] },
    },
  ],
};

describe("assetDir / isCommittedAssetPath", () => {
  it("builds the repo-relative asset dir for a PR", () => {
    expect(assetDir(266)).toBe("release-notes/assets/pr266");
  });

  it("recognizes committed asset paths, not URLs or localized paths", () => {
    expect(isCommittedAssetPath("release-notes/assets/pr266/before.png")).toBe(true);
    expect(isCommittedAssetPath("https://github.com/user-attachments/assets/x.png")).toBe(false);
    expect(isCommittedAssetPath("images/slide1-before.png")).toBe(false);
  });
});

describe("resolveImageSource", () => {
  it("routes http(s) to remote download", () => {
    expect(resolveImageSource("https://example.com/a.png")).toEqual({
      kind: "remote",
      url: "https://example.com/a.png",
    });
  });

  it("routes committed asset paths to a local copy", () => {
    expect(resolveImageSource("release-notes/assets/pr266/after.png")).toEqual({
      kind: "local",
      relPath: "release-notes/assets/pr266/after.png",
    });
  });

  it("leaves already-localized public paths untouched", () => {
    expect(resolveImageSource("images/slide1-before.png")).toEqual({ kind: "ready" });
  });
});

describe("parseComparisonManifest", () => {
  it("prefixes bare filenames to repo-relative paths and carries labels/caption", () => {
    const assets = parseComparisonManifest(producerManifest, 266);
    expect(assets).toEqual([
      {
        before: "release-notes/assets/pr266/before.png",
        after: "release-notes/assets/pr266/after.png",
        beforeLabel: "Local — one axis zone",
        afterLabel: "Universal — site-local + zone suffix",
        caption: "cross-zone jobs self-identify with EDT / CDT",
      },
    ]);
  });

  it("passes through entries that already carry a repo-relative path", () => {
    const assets = parseComparisonManifest(
      { comparisons: [{ before: "release-notes/assets/pr9/b.png", after: "a.png" }] },
      9,
    );
    expect(assets[0].before).toBe("release-notes/assets/pr9/b.png");
    expect(assets[0].after).toBe("release-notes/assets/pr9/a.png");
  });

  it("returns [] for malformed manifests", () => {
    expect(parseComparisonManifest({ comparisons: [] }, 1)).toEqual([]);
    expect(parseComparisonManifest({ nope: true }, 1)).toEqual([]);
    expect(parseComparisonManifest(null, 1)).toEqual([]);
  });
});

describe("discoverCommittedComparisons", () => {
  it("reads a committed meta.json off a target checkout", () => {
    const dir = mkdtempSync(join(tmpdir(), "rnp-"));
    try {
      const assetPath = join(dir, "release-notes", "assets", "pr266");
      mkdirSync(assetPath, { recursive: true });
      writeFileSync(join(assetPath, "meta.json"), JSON.stringify(producerManifest));
      const assets = discoverCommittedComparisons(dir, 266);
      expect(assets).toHaveLength(1);
      expect(assets[0].after).toBe("release-notes/assets/pr266/after.png");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns [] with no target, no file, or unreadable manifest", () => {
    expect(discoverCommittedComparisons(undefined, 266)).toEqual([]);
    const dir = mkdtempSync(join(tmpdir(), "rnp-"));
    try {
      expect(discoverCommittedComparisons(dir, 266)).toEqual([]); // no meta.json
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
