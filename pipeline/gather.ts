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

export type PrBundle = {
  repo: string; // "owner/name"
  number: number;
  title: string;
  body: string;
  labels: string[];
  mergedAt: string;
  diff: string;
  images: string[];
  configJson: unknown;
  /** Target repo's CHANGELOG.md on the default branch (null if absent).
   * Source of the previous semver version; the CLI overrides this with the
   * local checkout's copy in --target mode, which may be ahead of GitHub. */
  changelog: string | null;
};

async function gh(args: string[]): Promise<string> {
  const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if ((await proc.exited) !== 0) throw new Error(`gh ${args[0]} failed: ${err}`);
  return out;
}

export async function gatherPr(repo: string, pr: number): Promise<PrBundle> {
  const viewJson = JSON.parse(
    await gh(["pr", "view", String(pr), "--repo", repo, "--json", "number,title,body,labels,mergedAt"]),
  );
  const diff = truncateDiff(await gh(["pr", "diff", String(pr), "--repo", repo]));
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
    configJson,
    changelog,
  };
}
