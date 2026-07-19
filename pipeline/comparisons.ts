import { z } from "zod";
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

/**
 * Committed before/after comparison assets.
 *
 * A target repo can commit screenshots for a PR under
 * `release-notes/assets/pr<N>/` alongside a `meta.json` manifest (produced by an
 * automated smoke test — see dispatch-schedule-ui `scripts/smoke-tz.ts`). In
 * `--target` mode the whole repo is checked out on disk, so we read these
 * straight off the filesystem: private-repo-safe, deterministic, and needing no
 * PR-attachment scraping or authenticated download.
 *
 * The manifest is intentionally loose — extra keys (title, scenario, observed
 * labels…) are carried for humans and ignored here.
 */
export type ComparisonAsset = {
  /** repo-relative path, e.g. "release-notes/assets/pr266/before.png" */
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  caption?: string;
};

const ManifestSchema = z
  .object({
    pr: z.number().int().positive().optional(),
    comparisons: z
      .array(
        z.object({
          before: z.string().min(1),
          after: z.string().min(1),
          beforeLabel: z.string().min(1).optional(),
          afterLabel: z.string().min(1).optional(),
          caption: z.string().min(1).optional(),
        }),
      )
      .min(1),
  })
  .passthrough();

/** Repo-relative directory that holds a PR's committed comparison assets. */
export const assetDir = (pr: number): string => posix.join("release-notes", "assets", `pr${pr}`);

/** A src that points at a committed comparison asset (repo-relative), not a URL
 *  and not an already-localized `images/…` path. */
export const isCommittedAssetPath = (src: string): boolean =>
  src.startsWith("release-notes/assets/");

export type ResolvedSource =
  | { kind: "remote"; url: string } // http(s) — download (PR-attachment / preview URL)
  | { kind: "local"; relPath: string } // committed repo asset — copy from the checkout
  | { kind: "ready" }; // already a public-relative path (post-localize) — leave it

/** Decide how a slide's before/after src should be materialized into the render. */
export function resolveImageSource(src: string): ResolvedSource {
  if (/^https?:\/\//.test(src)) return { kind: "remote", url: src };
  if (isCommittedAssetPath(src)) return { kind: "local", relPath: src };
  return { kind: "ready" };
}

/** Normalize a manifest object into assets whose before/after are repo-relative
 *  paths (the manifest lists bare filenames relative to the PR's asset dir). */
export function parseComparisonManifest(json: unknown, pr: number): ComparisonAsset[] {
  const parsed = ManifestSchema.safeParse(json);
  if (!parsed.success) return [];
  const dir = assetDir(pr);
  const toPath = (file: string) =>
    file.startsWith("release-notes/assets/") ? file : posix.join(dir, file);
  return parsed.data.comparisons.map((c) => ({
    before: toPath(c.before),
    after: toPath(c.after),
    ...(c.beforeLabel ? { beforeLabel: c.beforeLabel } : {}),
    ...(c.afterLabel ? { afterLabel: c.afterLabel } : {}),
    ...(c.caption ? { caption: c.caption } : {}),
  }));
}

/** Read a target repo's committed comparison manifest for a PR. Returns [] when
 *  there is no target, no manifest, or the manifest is malformed — committed
 *  assets are an optional enhancement, never a hard dependency of a run. */
export function discoverCommittedComparisons(
  targetDir: string | undefined,
  pr: number,
): ComparisonAsset[] {
  if (!targetDir) return [];
  try {
    const raw = readFileSync(join(targetDir, assetDir(pr), "meta.json"), "utf8");
    return parseComparisonManifest(JSON.parse(raw), pr);
  } catch {
    return []; // absent or unreadable — no committed comparisons for this PR
  }
}
