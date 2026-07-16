import { parseArgs } from "node:util";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gatherPr } from "./gather";
import { loadRepoConfig } from "./config";
import { generateManifest } from "./generate";
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
const bundle = await gatherPr(values.repo, Number(values.pr));

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

/** Download any remote comparison screenshots into video/public/images/. */
async function localizeImages(m: Manifest): Promise<void> {
  for (const [i, slide] of m.slides.entries()) {
    if (slide.layout !== "comparison" || !slide.beforeAfter) continue;
    for (const key of ["before", "after"] as const) {
      const src = slide.beforeAfter[key];
      if (!/^https?:\/\//.test(src)) continue; // already local
      const res = await fetch(src, {
        headers: process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {},
      });
      if (!res.ok) throw new Error(`failed to download ${key} screenshot (${res.status}): ${src}`);
      const ext = (res.headers.get("content-type") ?? "").includes("jpeg") ? "jpg" : "png";
      const rel = `images/slide${i + 1}-${key}.${ext}`;
      await mkdir(join(publicDir, "images"), { recursive: true });
      await Bun.write(join(publicDir, rel), await res.arrayBuffer());
      slide.beforeAfter[key] = rel;
      console.error(`  🖼  ${rel}`);
    }
  }
}

let manifest: Manifest;
let technical: TechnicalItem[] = [];
if (values["skip-agent"]) {
  const saved = JSON.parse(await Bun.file(manifestPath).text());
  technical = saved.technical ?? [];
  delete saved.technical;
  manifest = saved;
  console.error("reusing existing manifest.json");
} else {
  const result = await generateManifest(bundle, config);
  manifest = result.manifest;
  technical = result.technical;
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
