const NOISE = [
  /(^|\/)(bun|yarn)\.lock$/,
  /(^|\/)(package-lock|pnpm-lock)\.(json|yaml)$/,
  /(^|\/)__snapshots__\//,
  /(^|\/)(dist|build|out|\.svelte-kit|node_modules)\//,
  /\.(min\.js|map|snap)$/,
];

export const isNoiseFile = (path: string) => NOISE.some((re) => re.test(path));

export function truncateDiff(diff: string, maxBytes = 80_000): string {
  // Split into per-file chunks on "diff --git" boundaries.
  const chunks = diff.split(/^(?=diff --git )/m);
  const kept = chunks.map((chunk) => {
    const m = chunk.match(/^diff --git a\/(\S+) /);
    if (m && isNoiseFile(m[1])) return `[${m[1]}: changes omitted (generated/lockfile)]\n`;
    return chunk;
  });
  let out = kept.join("");
  if (out.length > maxBytes) {
    out = out.slice(0, maxBytes) + `\n[diff truncated at ${maxBytes} bytes]\n`;
  }
  return out;
}

/** Image URLs referenced in a PR body (markdown or HTML) — before/after screenshots. */
export function extractImageUrls(body: string): string[] {
  const urls = new Set<string>();
  for (const m of body.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)) urls.add(m[1]);
  for (const m of body.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/g)) urls.add(m[1]);
  return [...urls];
}

export type LinkedIssue = { number: number; title: string; body: string };

/** Issue bodies can run to essays (or embed huge logs); keep enough to convey
 * the user story without letting one issue crowd out the diff. */
export function truncateIssueBody(body: string, maxChars = 4_000): string {
  if (body.length <= maxChars) return body;
  return body.slice(0, maxChars) + `\n[issue body truncated at ${maxChars} characters]`;
}

export type PrBundle = {
  repo: string; // "owner/name"
  number: number;
  title: string;
  body: string;
  labels: string[];
  mergedAt: string;
  diff: string;
  images: string[];
  /** Issues this PR closes (via "Closes #N" etc.) — the user story / symptom
   * that motivated the change. Motivation context only: prompts treat the
   * diff as the sole authority on what actually shipped. */
  issues: LinkedIssue[];
  configJson: unknown;
  /** Target repo's CHANGELOG.md on the default branch (null if absent).
   * Source of the previous semver version; the CLI overrides this with the
   * local checkout's copy in --target mode, which may be ahead of GitHub. */
  changelog: string | null;
};

/** GitHub-side transient failures worth retrying: 5xx from the REST API and
 * gh's own timeout/connection wording. 4xx (auth, not-found) fail fast. */
export const isTransientGhError = (stderr: string): boolean =>
  /HTTP 5\d\d|\b5\d\d Service Unavailable|Bad Gateway|Gateway Timeout|timed? ?out|connection (reset|refused)/i.test(
    stderr,
  );

const GH_RETRY_DELAYS_MS = [2_000, 8_000, 20_000];

async function gh(args: string[]): Promise<string> {
  let lastErr = "";
  for (let attempt = 0; ; attempt++) {
    const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    if ((await proc.exited) === 0) return out;
    lastErr = err;
    // A GitHub blip mid-run costs a whole release video in CI — ride out
    // short 5xx incidents instead of dying on the first one.
    if (attempt >= GH_RETRY_DELAYS_MS.length || !isTransientGhError(err)) break;
    const delay = GH_RETRY_DELAYS_MS[attempt];
    console.error(`  gh ${args[0]} transient failure (attempt ${attempt + 1}), retrying in ${delay / 1000}s: ${err.trim().slice(0, 120)}`);
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error(`gh ${args[0]} failed: ${lastErr}`);
}

export async function gatherPr(
  repo: string,
  pr: number,
  // Escape hatch for when GitHub's REST diff endpoint is unavailable (it can
  // be down while GraphQL stays healthy — live incident 2026-07-16): a squash
  // merge's `git show <sha> --format=` produces the identical diff locally.
  { diffOverride }: { diffOverride?: string } = {},
): Promise<PrBundle> {
  const viewJson = JSON.parse(
    await gh([
      "pr", "view", String(pr), "--repo", repo,
      "--json", "number,title,body,labels,mergedAt,closingIssuesReferences",
    ]),
  );
  const diff = truncateDiff(diffOverride ?? (await gh(["pr", "diff", String(pr), "--repo", repo])));
  // Linked issues carry the user story behind the PR (symptom, who it hurt) —
  // gold for FIX copy. closingIssuesReferences only exposes number/title, so
  // fetch each body separately; a failed fetch never blocks generation.
  const issues: LinkedIssue[] = [];
  for (const ref of (viewJson.closingIssuesReferences ?? []).slice(0, 3) as { number: number }[]) {
    try {
      const issue = JSON.parse(await gh(["api", `/repos/${repo}/issues/${ref.number}`]));
      issues.push({
        number: issue.number,
        title: issue.title ?? "",
        body: truncateIssueBody(issue.body ?? ""),
      });
    } catch (e) {
      console.error(`  ⚠ linked issue #${ref.number} fetch failed (continuing without it): ${e}`);
    }
  }
  const fetchFile = async (path: string): Promise<string | null> => {
    try {
      const raw = await gh(["api", `/repos/${repo}/contents/${path}`, "--jq", ".content"]);
      return Buffer.from(raw.trim(), "base64").toString("utf8");
    } catch {
      return null; // file absent
    }
  };
  const configRaw = await fetchFile(".release-notes.json");
  const configJson = configRaw === null ? undefined : JSON.parse(configRaw);
  const changelog = await fetchFile("CHANGELOG.md");
  return {
    repo,
    number: viewJson.number,
    title: viewJson.title,
    body: viewJson.body ?? "",
    labels: (viewJson.labels ?? []).map((l: { name: string }) => l.name),
    mergedAt: viewJson.mergedAt,
    diff,
    images: extractImageUrls(viewJson.body ?? ""),
    issues,
    configJson,
    changelog,
  };
}
