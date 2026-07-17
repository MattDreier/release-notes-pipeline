import { describe, expect, it } from "vitest";
import {
  changelogSection,
  releaseNotesSection,
  upsertChangelog,
  upsertReleaseNotes,
  type TechnicalItem,
} from "./notes";
import type { Manifest } from "./manifest";

const items: TechnicalItem[] = [
  { category: "FEATURE", bullet: "WO search resolves Ticket/Deal/Site anchors (`resolveAnchor`)" },
  { category: "FIX", bullet: "per-user initials in top-bar avatar" },
  { category: "BREAKING CHANGE", bullet: "`visit_status` property retired in favor of `hs_meeting_outcome`" },
  { category: "IMPROVEMENT", bullet: "board hydration bounded at mapLimit=6" },
];

describe("changelogSection", () => {
  const section = changelogSection({
    version: "v2026.7.16",
    date: "2026-07-16",
    pr: 231,
    repo: "MattDreier/dispatch-schedule-ui",
    items,
  });

  it("renders a Keep-a-Changelog style section with PR link", () => {
    expect(section).toContain("## v2026.7.16 — 2026-07-16");
    expect(section).toContain("[#231](https://github.com/MattDreier/dispatch-schedule-ui/pull/231)");
  });

  it("groups items under Added/Changed/Fixed and prefixes breaking changes", () => {
    const added = section.indexOf("### Added");
    const changed = section.indexOf("### Changed");
    const fixed = section.indexOf("### Fixed");
    expect(added).toBeGreaterThan(-1);
    expect(changed).toBeGreaterThan(added);
    expect(fixed).toBeGreaterThan(changed);
    expect(section).toContain("- **BREAKING:** `visit_status` property retired");
    expect(section).toContain("- board hydration bounded at mapLimit=6");
  });

  it("omits headings with no items", () => {
    const s = changelogSection({
      version: "v1",
      date: "2026-01-01",
      pr: 1,
      repo: "o/r",
      items: [{ category: "FIX", bullet: "x" }],
    });
    expect(s).not.toContain("### Added");
    expect(s).toContain("### Fixed");
  });
});

describe("upsertChangelog", () => {
  const section = changelogSection({ version: "v2", date: "2026-07-16", pr: 2, repo: "o/r", items });

  it("creates the file with a header when none exists", () => {
    const out = upsertChangelog(null, section);
    expect(out.startsWith("# Changelog")).toBe(true);
    expect(out).toContain("## v2 — 2026-07-16");
  });

  it("inserts the newest section above existing entries", () => {
    const first = upsertChangelog(null, changelogSection({ version: "v1", date: "2026-07-01", pr: 1, repo: "o/r", items }));
    const out = upsertChangelog(first, section);
    expect(out.indexOf("## v2")).toBeLessThan(out.indexOf("## v1"));
    expect(out.match(/# Changelog/g)).toHaveLength(1);
  });

  it("replaces an existing section for the same PR (idempotent re-runs)", () => {
    const first = upsertChangelog(null, section);
    const revised = changelogSection({ version: "v2", date: "2026-07-16", pr: 2, repo: "o/r", items: [{ category: "FIX", bullet: "revised" }] });
    const out = upsertChangelog(first, revised);
    expect(out).toContain("- revised");
    expect(out.match(/## v2/g)).toHaveLength(1);
  });

  it("replaces a backfilled older version IN PLACE, not at the top", () => {
    // Live failure 2026-07-16: regenerating v1.13.0 after v1.14.x existed
    // landed the section above them and needed hand-reordering.
    const mk = (version: string, pr: number, bullet = "b") =>
      changelogSection({ version, date: "2026-07-16", pr, repo: "o/r", items: [{ category: "FIX", bullet }] });
    let doc = upsertChangelog(null, mk("v1.13.0", 230));
    doc = upsertChangelog(doc, mk("v1.14.0", 251));
    doc = upsertChangelog(doc, mk("v1.14.4", 246));
    const out = upsertChangelog(doc, mk("v1.13.0", 230, "regenerated with richer bullets"));
    expect(out).toContain("- regenerated with richer bullets");
    expect(out.match(/## v1\.13\.0/g)).toHaveLength(1);
    // Order preserved: newest first, the regenerated section stays at the bottom.
    expect(out.indexOf("## v1.14.4")).toBeLessThan(out.indexOf("## v1.14.0"));
    expect(out.indexOf("## v1.14.0")).toBeLessThan(out.indexOf("## v1.13.0"));
  });

  it("matches by PR number even when the heading's date differs between runs", () => {
    const first = upsertChangelog(null, section); // pr 2, date 2026-07-16
    const rerun = changelogSection({ version: "v2", date: "2026-07-17", pr: 2, repo: "o/r", items: [{ category: "FIX", bullet: "next-day re-run" }] });
    const out = upsertChangelog(first, rerun);
    expect(out).toContain("- next-day re-run");
    expect(out.match(/## v2/g)).toHaveLength(1);
  });
});

const manifest: Manifest = {
  product: "Dispatch",
  version: "v2026.7.16",
  pr: 231,
  domain: "DISPATCH.SOLARINBOUND.COM",
  brand: "MATT DREIER",
  cover: { script: "Dispatch release notes." },
  slides: [
    { type: "FEATURE", layout: "standard", title: "Search Finds Everything", script: "s1", body: "Search now finds tickets and deals." },
    { type: "IMPROVEMENT", layout: "metrics", title: "Faster Boards", script: "s2", metrics: [{ value: "2×", label: "faster board loads" }] },
    { type: "FIX", layout: "grid", title: "Also Fixed", script: "s3", gridItems: [{ tag: "avatar", description: "Your own initials show in the top bar." }] },
  ],
  outro: { headline: "Dispatch News", cta: "Subscribe", subline: "Full release notes below.", script: "o" },
};

describe("releaseNotesSection", () => {
  const section = releaseNotesSection(manifest, { date: "2026-07-16", videoFile: "2026-07-16-pr231.mp4" });

  it("links the video and renders each slide's payload as text", () => {
    expect(section).toContain("## v2026.7.16 — 2026-07-16");
    expect(section).toContain("(./2026-07-16-pr231.mp4)");
    expect(section).toContain("**Search Finds Everything**");
    expect(section).toContain("Search now finds tickets and deals.");
    expect(section).toContain("**2×** — faster board loads");
    expect(section).toContain("**avatar** — Your own initials show in the top bar.");
  });

  it("tags each slide with its category", () => {
    expect(section).toContain("`FEATURE`");
    expect(section).toContain("`FIX`");
  });
});

describe("upsertReleaseNotes", () => {
  const section = releaseNotesSection(manifest, { date: "2026-07-16", videoFile: "2026-07-16-pr231.mp4" });

  it("creates the file with a header, newest first, and is idempotent per PR", () => {
    const first = upsertReleaseNotes(null, section);
    expect(first.startsWith("# Release Notes")).toBe(true);
    const again = upsertReleaseNotes(first, section);
    expect(again.match(/## v2026\.7\.16/g)).toHaveLength(1);
  });

  it("replaces a backfilled older version IN PLACE, keyed by version token", () => {
    const mk = (version: string, title: string) =>
      releaseNotesSection(
        { ...manifest, version, slides: [{ type: "FIX", layout: "standard", title, script: "s", body: "b." }] },
        { date: "2026-07-16", videoFile: `x-${version}.mp4` },
      );
    let doc = upsertReleaseNotes(null, mk("v1.13.0", "Old Copy"));
    doc = upsertReleaseNotes(doc, mk("v1.14.4", "Newer Release"));
    const out = upsertReleaseNotes(doc, mk("v1.13.0", "Regenerated Copy"));
    expect(out).toContain("**Regenerated Copy**");
    expect(out).not.toContain("**Old Copy**");
    expect(out.match(/## v1\.13\.0/g)).toHaveLength(1);
    expect(out.indexOf("## v1.14.4")).toBeLessThan(out.indexOf("## v1.13.0"));
  });
});
