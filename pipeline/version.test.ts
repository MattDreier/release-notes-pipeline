import { describe, expect, it } from "vitest";
import { bump, bumpKind, latestVersion, versionForExistingPr, versionForPr } from "./version";
import type { TechnicalItem } from "./notes";

const item = (category: TechnicalItem["category"]): TechnicalItem => ({ category, bullet: "x" });

describe("bumpKind", () => {
  it("any BREAKING CHANGE wins → major", () => {
    expect(bumpKind([item("FIX"), item("BREAKING CHANGE"), item("FEATURE")])).toBe("major");
  });
  it("a FEATURE without breaking → minor", () => {
    expect(bumpKind([item("FIX"), item("FEATURE"), item("IMPROVEMENT")])).toBe("minor");
  });
  it("fixes and improvements only → patch", () => {
    expect(bumpKind([item("FIX"), item("IMPROVEMENT")])).toBe("patch");
  });
  it("empty items → patch (a merge always bumps something)", () => {
    expect(bumpKind([])).toBe("patch");
  });
});

describe("bump", () => {
  it("major resets minor and patch", () => expect(bump("v1.13.4", "major")).toBe("v2.0.0"));
  it("minor resets patch", () => expect(bump("v1.13.4", "minor")).toBe("v1.14.0"));
  it("patch increments", () => expect(bump("v1.13.4", "patch")).toBe("v1.13.5"));
  it("rejects date versions (shaped like semver but year-majored)", () =>
    expect(() => bump("v2026.7.16", "patch")).toThrow(/not a semver/));
  it("rejects non-versions", () => expect(() => bump("nope", "patch")).toThrow(/not a semver/));
});

const CHANGELOG = `# Changelog

intro text

## v1.13.4 — 2026-07-16 (PR [#246](https://github.com/o/r/pull/246))

### Fixed

- thing

## v1.13.3 — 2026-07-16 (PR [#253](https://github.com/o/r/pull/253))

### Changed

- other thing
`;

describe("latestVersion", () => {
  it("returns the newest (first) semver heading", () => {
    expect(latestVersion(CHANGELOG)).toBe("v1.13.4");
  });
  it("ignores date-version headings", () => {
    expect(latestVersion("## v2026.7.16 — 2026-07-16 (PR [#1](u))\n\n- x\n")).toBeNull();
  });
  it("null changelog → null", () => {
    expect(latestVersion(null)).toBeNull();
  });
});

describe("versionForPr", () => {
  it("reuses the version of an existing section for the same PR (idempotent re-runs)", () => {
    expect(versionForExistingPr(CHANGELOG, 253)).toBe("v1.13.3");
    expect(versionForPr(CHANGELOG, 253, [item("FEATURE")])).toBe("v1.13.3");
  });
  it("bumps from the latest version for a new PR", () => {
    expect(versionForPr(CHANGELOG, 300, [item("FEATURE")])).toBe("v1.14.0");
    expect(versionForPr(CHANGELOG, 300, [item("FIX")])).toBe("v1.13.5");
    expect(versionForPr(CHANGELOG, 300, [item("BREAKING CHANGE")])).toBe("v2.0.0");
  });
  it("does not confuse PR 25 with PR 253", () => {
    expect(versionForExistingPr(CHANGELOG, 25)).toBeNull();
  });
  it("never reuses a date-scheme heading for an existing PR", () => {
    const dated = "## v2026.7.16 — 2026-07-16 (PR [#246](https://github.com/o/r/pull/246))\n";
    expect(versionForExistingPr(dated, 246)).toBeNull();
  });
  it("starts at v1.0.0 with no changelog or no semver history", () => {
    expect(versionForPr(null, 1, [item("FEATURE")])).toBe("v1.0.0");
    expect(versionForPr("# Changelog\n\n## v2026.7.16 — x (PR [#9](u))\n", 1, [item("FIX")])).toBe(
      "v1.0.0",
    );
  });
});
