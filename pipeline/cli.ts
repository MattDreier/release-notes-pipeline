import { parseArgs } from "node:util";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { estimateSpokenSeconds } from "./budgets";
import { gatherPr } from "./gather";
import { discoverCommittedComparisons, resolveImageSource } from "./comparisons";
import { loadRepoConfig } from "./config";
import { generateManifest } from "./generate";
import { GenerationExhausted, measureClips, writeRunRecord, type RunRecord } from "./runlog";
import { synthesizeManifest } from "./tts";
import type { Manifest } from "./manifest";
import {
  changelogSection,
  releaseNotesSection,
  upsertChangelog,
  upsertReleaseNotes,
  type TechnicalItem,
} from "./notes";

const { values } = parseArgs({
  options: {
    repo: { type: "string" },
    pr: { type: "string" },
    // Target repo root: writes release-notes/<video>, release-notes/RELEASE-NOTES.md,
    // and CHANGELOG.md there. Without it, just drops the video in --out.
    target: { type: "string" },
    out: { type: "string", default: "out" },
    "skip-agent": { type: "boolean", default: false }, // reuse existing manifest.json
    "skip-tts": { type: "boolean", default: false }, // reuse existing audio/
    // Local diff file instead of GitHub's REST diff endpoint (outage escape
    // hatch; produce one with `git show <squash-sha> --format=`).
    "diff-file": { type: "string" },
  },
});

if (!values.repo || !values.pr) {
  console.error(
    "usage: bun run generate --repo owner/name --pr 123 [--target repoDir | --out dir] [--skip-agent] [--skip-tts]",
  );
  process.exit(1);
}

const root = join(import.meta.dir, "..");
const publicDir = join(root, "video", "public");
const manifestPath = join(publicDir, "manifest.json");

console.error(`gathering ${values.repo}#${values.pr}…`);
const bundle = await gatherPr(values.repo, Number(values.pr), {
  diffOverride: values["diff-file"] ? await readFile(values["diff-file"], "utf8") : undefined,
});

// In --target mode the local checkout is authoritative for BOTH the config
// and the changelog (it may be ahead of the GitHub API copy — e.g. a voice or
// version change edited locally but not yet merged). Fall back to the fetched
// copies when the local files are absent.
let configJson = bundle.configJson;
if (values.target) {
  try {
    configJson = JSON.parse(await readFile(join(values.target, ".release-notes.json"), "utf8"));
  } catch {
    /* no local config — keep the fetched copy (or undefined) */
  }
  try {
    bundle.changelog = await readFile(join(values.target, "CHANGELOG.md"), "utf8");
  } catch {
    /* no local changelog yet — keep the fetched copy (or null) */
  }
}
const config = loadRepoConfig(configJson, values.repo.split("/")[1]);

// Committed before/after comparison assets in the target checkout (produced by
// an automated smoke test, e.g. dispatch-schedule-ui `scripts/smoke-tz.ts`).
// Surface them to the editorial agent as available screenshots so it can choose
// the comparison layout; localizeImages then resolves them straight off disk —
// private-repo-safe, no authenticated download. Absent → no-op.
const committed = discoverCommittedComparisons(values.target, Number(values.pr));
if (committed.length > 0) {
  bundle.images = [...bundle.images, ...committed.flatMap((c) => [c.before, c.after])];
  console.error(`  🖼  ${committed.length} committed comparison pair(s) from ${values.target}`);
}

/** Materialize a comparison slide's screenshots into video/public/images/:
 *  http(s) URLs are downloaded (PR attachments / preview URLs), committed repo
 *  assets are copied off the --target checkout. */
async function localizeImages(m: Manifest): Promise<void> {
  for (const [i, slide] of m.slides.entries()) {
    if (slide.layout !== "comparison" || !slide.beforeAfter) continue;
    for (const key of ["before", "after"] as const) {
      const resolved = resolveImageSource(slide.beforeAfter[key]);
      if (resolved.kind === "ready") continue; // already a public-relative path

      let bytes: ArrayBuffer | Uint8Array;
      let ext: "jpg" | "png";
      if (resolved.kind === "remote") {
        const res = await fetch(resolved.url, {
          headers: process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {},
        });
        if (!res.ok)
          throw new Error(`failed to download ${key} screenshot (${res.status}): ${resolved.url}`);
        ext = (res.headers.get("content-type") ?? "").includes("jpeg") ? "jpg" : "png";
        bytes = await res.arrayBuffer();
      } else {
        // Committed repo asset — copy straight off the checkout.
        if (!values.target)
          throw new Error(`committed comparison asset needs --target: ${resolved.relPath}`);
        bytes = await readFile(join(values.target, resolved.relPath));
        ext = /\.jpe?g$/i.test(resolved.relPath) ? "jpg" : "png";
      }

      const rel = `images/slide${i + 1}-${key}.${ext}`;
      await mkdir(join(publicDir, "images"), { recursive: true });
      await Bun.write(join(publicDir, rel), bytes);
      slide.beforeAfter[key] = rel;
      console.error(`  🖼  ${rel}`);
    }
  }
}

// Run ledger — one record per live editorial run (skip-agent re-runs have no
// cycles to record). Persisted on success AND exhaustion; the retained drafts
// are the substrate for offline evals.
const startedAt = new Date().toISOString();
const recordConfig = {
  product: config.product,
  version: config.version,
  voice: config.voice,
  ttsModel: config.ttsModel,
};
let runRecord: RunRecord | null = null;

let manifest: Manifest;
let technical: TechnicalItem[] = [];
if (values["skip-agent"]) {
  const saved = JSON.parse(await Bun.file(manifestPath).text());
  technical = saved.technical ?? [];
  delete saved.technical;
  manifest = saved;
  console.error("reusing existing manifest.json");
} else {
  let result;
  try {
    result = await generateManifest(bundle, config);
  } catch (e) {
    if (e instanceof GenerationExhausted) {
      const path = await writeRunRecord(root, {
        repo: values.repo,
        pr: Number(values.pr),
        config: recordConfig,
        startedAt,
        finishedAt: new Date().toISOString(),
        outcome: { status: "exhausted", attempts: e.attempts.length, finalNotes: e.finalNotes },
        attempts: e.attempts,
      });
      console.error(`run ledger: ${path}`);

      // Graceful degradation: the VIDEO never converged, but the technical
      // bullets came from the diff-grounded editor pass and are safe to ship.
      // Salvage the CHANGELOG entry so a merged PR is never silently dropped
      // from the record (and CI goes green instead of blocking the merge
      // train). We deliberately do NOT ship the last draft's video/RELEASE-
      // NOTES prose — it's the copy the critic kept rejecting, exactly the
      // unreviewed content this project exists to keep off screen.
      const salvage = (e.technical ?? []) as TechnicalItem[];
      if (values.target && salvage.length > 0) {
        const day = new Date(bundle.mergedAt).toISOString().slice(0, 10);
        const changelogPath = join(values.target, "CHANGELOG.md");
        const clSection = changelogSection({
          version: e.version || "unversioned",
          date: day,
          pr: bundle.number,
          repo: values.repo,
          items: salvage,
        });
        let existing: string | null = null;
        try {
          existing = await readFile(changelogPath, "utf8");
        } catch {
          /* no changelog yet */
        }
        await writeFile(changelogPath, upsertChangelog(existing, clSection));
        console.error(
          `⚠ video withheld (copy did not converge after ${e.attempts.length} attempts) — ` +
            `salvaged ${salvage.length} CHANGELOG bullet(s) to ${changelogPath}. ` +
            `Re-run generation to attempt the video again.`,
        );
        console.log(`✓ ${changelogPath} (changelog-only; video withheld)`);
        process.exit(0);
      }
      console.error(
        "⚠ no salvageable changelog bullets (generation failed before the first plan) — nothing written.",
      );
    }
    throw e;
  }
  manifest = result.manifest;
  technical = result.technical;
  runRecord = {
    repo: values.repo,
    pr: Number(values.pr),
    config: recordConfig,
    startedAt,
    finishedAt: new Date().toISOString(),
    outcome: {
      status: "converged",
      attempts: result.attempts.length,
      version: manifest.version,
    },
    attempts: result.attempts,
  };
  await localizeImages(manifest);
  await mkdir(publicDir, { recursive: true });
  // technical rides along in manifest.json so --skip-agent re-runs keep it;
  // the video's calculateMetadata ignores unknown keys.
  await writeFile(manifestPath, JSON.stringify({ ...manifest, technical }, null, 2));
  console.error(`manifest: ${manifest.slides.length} slide(s), ${technical.length} changelog bullet(s)`);
}

if (!values["skip-tts"]) {
  const files = await synthesizeManifest(manifest, config, join(publicDir, "audio"));
  console.error(`audio: ${files.length} files`);
  if (runRecord) {
    // Estimator self-audit: had this been recorded from day one, the 14%-slow
    // pace constant would have been visible on the first shipped video.
    const scripts = [manifest.cover.script, ...manifest.slides.map((s) => s.script), manifest.outro.script];
    const clips = await measureClips(files);
    runRecord.tts = {
      estimatedSeconds: Number(scripts.reduce((t, s) => t + estimateSpokenSeconds(s), 0).toFixed(1)),
      actualSeconds: Number(clips.reduce((t, c) => t + c.seconds, 0).toFixed(1)),
      clips: clips.map((c) => ({ ...c, seconds: Number(c.seconds.toFixed(2)) })),
    };
    runRecord.finishedAt = new Date().toISOString();
  }
}

if (runRecord) {
  const path = await writeRunRecord(root, runRecord);
  console.error(`run ledger: ${path}`);
}

console.error("rendering…");
const render = Bun.spawn(
  ["bunx", "remotion", "render", "video/src/index.ts", "ReleaseNotes", "out/render.mp4"],
  { stdout: "inherit", stderr: "inherit", cwd: root },
);
if ((await render.exited) !== 0) throw new Error("remotion render failed");

const day = new Date(bundle.mergedAt).toISOString().slice(0, 10);
const videoFile = `${day}-pr${bundle.number}.mp4`;

const readIfExists = async (p: string) => {
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
};

if (values.target) {
  const notesDir = join(values.target, "release-notes");
  await mkdir(notesDir, { recursive: true });
  await copyFile(join(root, "out", "render.mp4"), join(notesDir, videoFile));

  const relNotesPath = join(notesDir, "RELEASE-NOTES.md");
  const relSection = releaseNotesSection(manifest, { date: day, videoFile });
  await writeFile(relNotesPath, upsertReleaseNotes(await readIfExists(relNotesPath), relSection));

  if (technical.length > 0) {
    const changelogPath = join(values.target, "CHANGELOG.md");
    const clSection = changelogSection({
      version: manifest.version,
      date: day,
      pr: bundle.number,
      repo: values.repo,
      items: technical,
    });
    await writeFile(changelogPath, upsertChangelog(await readIfExists(changelogPath), clSection));
  } else {
    console.error("⚠ no technical bullets — CHANGELOG.md left untouched");
  }
  console.log(`✓ ${join(notesDir, videoFile)}`);
  console.log(`✓ ${relNotesPath}`);
} else {
  await mkdir(values.out!, { recursive: true });
  const dest = join(values.out!, videoFile);
  await copyFile(join(root, "out", "render.mp4"), dest);
  console.log(`✓ ${dest}`);
}
