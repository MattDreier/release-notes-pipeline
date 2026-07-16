import { changelogSection, CHANGELOG_HEADER, type TechnicalItem } from "./notes";
import { bump, bumpKind } from "./version";

/**
 * One-time semver backfill: replay a repo's merged-PR history into a full
 * CHANGELOG.md, computing each version bump from that PR's classified items
 * with the same rules the live pipeline uses (version.ts). The anchor is a
 * hand-written markdown section for the v1.0.0 baseline (e.g. a go-live).
 *
 *   bun pipeline/backfill.ts data.json > CHANGELOG.md
 *
 * data.json: {
 *   repo: "owner/name",
 *   anchor: "## v1.0.0 — YYYY-MM-DD ...",        // raw markdown section
 *   prs: [{ number, date: "YYYY-MM-DD", items: TechnicalItem[] }, ...]  // OLDEST FIRST
 * }
 */

type BackfillPr = { number: number; date: string; items: TechnicalItem[] };
type BackfillData = { repo: string; anchor: string; prs: BackfillPr[] };

const path = process.argv[2];
if (!path) {
  console.error("usage: bun pipeline/backfill.ts data.json > CHANGELOG.md");
  process.exit(1);
}
const data: BackfillData = JSON.parse(await Bun.file(path).text());

let version = "v1.0.0"; // the anchor
const sections = data.prs.map((pr) => {
  version = bump(version, bumpKind(pr.items));
  return changelogSection({
    version,
    date: pr.date,
    pr: pr.number,
    repo: data.repo,
    items: pr.items,
  });
});
console.error(`replayed ${data.prs.length} PRs → current version ${version}`);

const doc = [CHANGELOG_HEADER.trimEnd(), ...sections.reverse().map((s) => s.trimEnd()), data.anchor.trimEnd()];
console.log(doc.join("\n\n") + "\n");
