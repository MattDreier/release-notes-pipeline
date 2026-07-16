import type { Category, TechnicalItem } from "./notes";

/**
 * Semantic versioning derived from a release's own contents — descriptive,
 * not roadmap-driven. The bump is computed from the editor's classified
 * changelog items with the same mapping semantic-release uses for
 * conventional commits: breaking → major, new capability → minor,
 * everything else (fixes, improvements, docs, infra) → patch.
 *
 * The previous version is read from the target repo's CHANGELOG.md itself,
 * which doubles as the idempotency key: a re-run for a PR that already has
 * a section reuses that section's version instead of bumping again.
 */

export type BumpKind = "major" | "minor" | "patch";

const BUMP_FOR: Record<Category, BumpKind> = {
  "BREAKING CHANGE": "major",
  FEATURE: "minor",
  IMPROVEMENT: "patch",
  FIX: "patch",
};

const RANK: Record<BumpKind, number> = { major: 2, minor: 1, patch: 0 };

export function bumpKind(items: TechnicalItem[]): BumpKind {
  return items.reduce<BumpKind>(
    (acc, item) => (RANK[BUMP_FOR[item.category]] > RANK[acc] ? BUMP_FOR[item.category] : acc),
    "patch",
  );
}

/** A year-like major means the legacy date scheme (v2026.7.16), which is
 * shaped exactly like semver — never bump from or reuse one of those. */
const isDateScheme = (version: string) => Number(version.slice(1).split(".")[0]) >= 1970;

export function bump(prev: string, kind: BumpKind): string {
  const m = prev.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!m || isDateScheme(prev)) throw new Error(`not a semver version: ${prev}`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === "major") return `v${major + 1}.0.0`;
  if (kind === "minor") return `v${major}.${minor + 1}.0`;
  return `v${major}.${minor}.${patch + 1}`;
}

/** Newest semver heading in a newest-first changelog, or null if none.
 * Date-version headings (v2026.7.16) don't match — the day a repo switches
 * to semver, its history restarts at v1.0.0 unless backfilled. */
export function latestVersion(changelog: string | null): string | null {
  for (const m of changelog?.matchAll(/^## (v\d+\.\d+\.\d+)(?:\s|$)/gm) ?? []) {
    if (!isDateScheme(m[1])) return m[1];
  }
  return null;
}

/** Version an existing changelog section already assigned to this PR, or null. */
export function versionForExistingPr(changelog: string | null, pr: number): string | null {
  if (!changelog) return null;
  const re = new RegExp(`^## (v\\d+\\.\\d+\\.\\d+) .*/pull/${pr}\\)`, "m");
  const m = changelog.match(re);
  return m && !isDateScheme(m[1]) ? m[1] : null;
}

export function versionForPr(
  changelog: string | null,
  pr: number,
  items: TechnicalItem[],
): string {
  const existing = versionForExistingPr(changelog, pr);
  if (existing) return existing;
  const latest = latestVersion(changelog);
  return latest ? bump(latest, bumpKind(items)) : "v1.0.0";
}
