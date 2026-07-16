import { parseArgs } from "node:util";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gatherPr } from "./gather";
import { loadRepoConfig } from "./config";
import { generateManifest } from "./generate";
import { synthesizeManifest } from "./tts";
import type { Manifest } from "./manifest";

const { values } = parseArgs({
  options: {
    repo: { type: "string" },
    pr: { type: "string" },
    out: { type: "string", default: "out" },
    "skip-agent": { type: "boolean", default: false }, // reuse existing manifest.json
    "skip-tts": { type: "boolean", default: false }, // reuse existing audio/
  },
});

if (!values.repo || !values.pr) {
  console.error(
    "usage: bun run generate --repo owner/name --pr 123 [--out dir] [--skip-agent] [--skip-tts]",
  );
  process.exit(1);
}

const root = join(import.meta.dir, "..");
const publicDir = join(root, "video", "public");
const manifestPath = join(publicDir, "manifest.json");

console.error(`gathering ${values.repo}#${values.pr}…`);
const bundle = await gatherPr(values.repo, Number(values.pr));
const config = loadRepoConfig(bundle.configJson, values.repo.split("/")[1]);

let manifest: Manifest;
if (values["skip-agent"]) {
  manifest = JSON.parse(await Bun.file(manifestPath).text());
  console.error("reusing existing manifest.json");
} else {
  manifest = await generateManifest(bundle, config);
  await mkdir(publicDir, { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.error(`manifest: ${manifest.slides.length} slide(s)`);
}

if (!values["skip-tts"]) {
  const files = await synthesizeManifest(manifest, config, join(publicDir, "audio"));
  console.error(`audio: ${files.length} files`);
}

console.error("rendering…");
const render = Bun.spawn(
  ["bunx", "remotion", "render", "video/src/index.ts", "Changelog", "out/render.mp4"],
  { stdout: "inherit", stderr: "inherit", cwd: root },
);
if ((await render.exited) !== 0) throw new Error("remotion render failed");

await mkdir(values.out!, { recursive: true });
const day = new Date(bundle.mergedAt).toISOString().slice(0, 10);
const dest = join(values.out!, `${day}-pr${bundle.number}.mp4`);
await copyFile(join(root, "out", "render.mp4"), dest);
console.log(`✓ ${dest}`);
