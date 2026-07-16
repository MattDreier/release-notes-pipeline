# changelog-video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pipeline that turns a merged GitHub PR into a 30–60s editorial release-notes video (Claude Agent SDK editorial workflow → Gemini TTS → Remotion render) saved into the target repo's `changelog/` folder, first as a CLI, then as a reusable GitHub Action.

**Architecture:** Standalone repo at `/opt/Projects/changelog-video`. `pipeline/` holds the orchestrator (gather → 5-pass agent workflow → TTS → manifest+audio into `video/public/`). `video/` is a Remotion project whose composition duration is computed from the real audio durations via `calculateMetadata`. `action/` wraps the CLI in a `workflow_call` reusable workflow.

**Tech Stack:** TypeScript, bun (runtime + test runner via vitest), `@anthropic-ai/claude-agent-sdk` (subscription auth — no API key), Gemini TTS REST (`gemini-3.1-flash-tts-preview`), Remotion 4 (`remotion`, `@remotion/cli`, `@remotion/media-utils`, `@remotion/google-fonts`), zod.

## Global Constraints

- **Spec:** `docs/specs/2026-07-15-changelog-video-design.md` — authoritative for palette, layout, budgets.
- **Palette tokens (exact):** bg `#FAF9F6`, accent `#D05A3F`, ink `#191919`, muted `#8A8A8A`.
- **Fonts:** Lora (serif) + Inter (sans) via `@remotion/google-fonts`. Content-slide body = Lora **italic** muted, NOT sans.
- **Budgets:** title ≤ 48 chars (2 lines × 24), body ≤ 320 chars, total narration estimate 28–55s at 150 wpm (2.5 words/sec), slides 1–3.
- **TTS model default:** `gemini-3.1-flash-tts-preview` (per-repo overridable via `.changelog-video.json` `ttsModel`).
- **Video:** 1920×1080 @ 30 fps; each slide = its audio frames + 15 padding frames.
- **Auth:** Agent SDK inherits local Claude Code login; never read/require `ANTHROPIC_API_KEY`. Gemini key from `GEMINI_API_KEY` env (`.env` is gitignored).
- **Never call Claude or Gemini from vitest** — all network code lives behind small wrappers; tests mock `fetch` / inject fakes.
- **Agent SDK `query()` calls:** always pass `tools: []`, `maxTurns: 1` (single response, no tool loop), and `outputFormat: {type: 'json_schema', schema}`; read the `result` message's `.output`. Do NOT set `model` (inherit the subscription default).
- Conventional commits with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- All commands run from repo root `/opt/Projects/changelog-video` unless stated.

---

### Task 1: Repo scaffolding + budgets module

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env` (gitignored), `pipeline/budgets.ts`
- Test: `pipeline/budgets.test.ts`

**Interfaces:**
- Produces: `BUDGETS` const and pure functions `fitsTitle(s: string): boolean`, `fitsBody(s: string): boolean`, `estimateSpokenSeconds(script: string): number`, `narrationBudgetCheck(scripts: string[]): { seconds: number; ok: boolean; reason?: string }` — used by Tasks 5 (generate) and consumed in critic prompts.

- [ ] **Step 1: Scaffold package**

```jsonc
// package.json
{
  "name": "changelog-video",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "bun pipeline/cli.ts",
    "test": "vitest run",
    "video:studio": "remotion studio video/src/index.ts",
    "video:render": "remotion render video/src/index.ts Changelog out/changelog.mp4",
    "video:still": "remotion still video/src/index.ts Changelog"
  }
}
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["pipeline", "video/src"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["pipeline/**/*.test.ts"] } });
```

Install:
```bash
bun add zod @anthropic-ai/claude-agent-sdk remotion @remotion/cli @remotion/media-utils @remotion/google-fonts react react-dom
bun add -d vitest typescript @types/node @types/react
```

Create `.env` containing `GEMINI_API_KEY=<the key Matt provided in chat>` (already covered by `.gitignore`).

- [ ] **Step 2: Write the failing tests**

```ts
// pipeline/budgets.test.ts
import { describe, expect, it } from "vitest";
import { BUDGETS, estimateSpokenSeconds, fitsBody, fitsTitle, narrationBudgetCheck } from "./budgets";

describe("budgets", () => {
  it("accepts titles within 48 chars and rejects longer", () => {
    expect(fitsTitle("Nested Sub-Agents")).toBe(true);
    expect(fitsTitle("x".repeat(49))).toBe(false);
  });
  it("accepts bodies within 320 chars and rejects longer", () => {
    expect(fitsBody("Short body.")).toBe(true);
    expect(fitsBody("x".repeat(321))).toBe(false);
  });
  it("estimates spoken duration at 150 wpm", () => {
    const thirtyWords = Array(30).fill("word").join(" ");
    expect(estimateSpokenSeconds(thirtyWords)).toBeCloseTo(12, 0); // 30 / 2.5
  });
  it("flags narration outside 28-55s", () => {
    const w = (n: number) => Array(n).fill("word").join(" ");
    expect(narrationBudgetCheck([w(100)]).ok).toBe(true);  // 40s
    expect(narrationBudgetCheck([w(20)]).ok).toBe(false);  // 8s — too short
    expect(narrationBudgetCheck([w(200)]).ok).toBe(false); // 80s — too long
  });
  it("exposes the budget constants", () => {
    expect(BUDGETS.titleMaxChars).toBe(48);
    expect(BUDGETS.narration).toEqual({ minSeconds: 28, maxSeconds: 55 });
  });
});
```

- [ ] **Step 3: Run tests, verify FAIL** — `bunx vitest run` → cannot resolve `./budgets`.

- [ ] **Step 4: Implement**

```ts
// pipeline/budgets.ts
export const BUDGETS = {
  titleMaxChars: 48, // 2 lines × ~24 chars in the huge serif
  bodyMaxChars: 320,
  wordsPerSecond: 2.5, // ~150 spoken wpm
  narration: { minSeconds: 28, maxSeconds: 55 }, // + padding ⇒ 30–60s video
  maxSlides: 3,
} as const;

export const fitsTitle = (s: string) => s.length <= BUDGETS.titleMaxChars;
export const fitsBody = (s: string) => s.length <= BUDGETS.bodyMaxChars;

export function estimateSpokenSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return words / BUDGETS.wordsPerSecond;
}

export function narrationBudgetCheck(scripts: string[]) {
  const seconds = scripts.reduce((t, s) => t + estimateSpokenSeconds(s), 0);
  const { minSeconds, maxSeconds } = BUDGETS.narration;
  if (seconds < minSeconds) return { seconds, ok: false, reason: `narration ~${seconds.toFixed(0)}s is under the ${minSeconds}s floor — expand scripts` };
  if (seconds > maxSeconds) return { seconds, ok: false, reason: `narration ~${seconds.toFixed(0)}s exceeds the ${maxSeconds}s ceiling — tighten scripts` };
  return { seconds, ok: true as const };
}
```

- [ ] **Step 5: Run tests, verify PASS** — `bunx vitest run`.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(pipeline): scaffold repo + character/duration budgets"`

---

### Task 2: WAV wrapper (PCM → WAV)

**Files:**
- Create: `pipeline/wav.ts`
- Test: `pipeline/wav.test.ts`

**Interfaces:**
- Produces: `pcmToWav(pcm: Buffer, opts?: { sampleRate?: number; channels?: number; bitDepth?: number }): Buffer` (defaults 24000 Hz, 1 channel, 16-bit — Gemini TTS output format). Consumed by Task 6 (tts).

- [ ] **Step 1: Write the failing tests**

```ts
// pipeline/wav.test.ts
import { describe, expect, it } from "vitest";
import { pcmToWav } from "./wav";

describe("pcmToWav", () => {
  const pcm = Buffer.alloc(2400 * 2); // 0.1s of 16-bit mono @ 24kHz
  const wav = pcmToWav(pcm);

  it("produces a RIFF/WAVE header", () => {
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
  });
  it("has correct sizes", () => {
    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.length); // RIFF chunk size
    expect(wav.readUInt32LE(40)).toBe(pcm.length);     // data chunk size
  });
  it("encodes format fields (PCM, mono, 24kHz, 16-bit)", () => {
    expect(wav.readUInt16LE(20)).toBe(1);      // PCM
    expect(wav.readUInt16LE(22)).toBe(1);      // channels
    expect(wav.readUInt32LE(24)).toBe(24000);  // sample rate
    expect(wav.readUInt32LE(28)).toBe(48000);  // byte rate = 24000*1*2
    expect(wav.readUInt16LE(34)).toBe(16);     // bit depth
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL.**
- [ ] **Step 3: Implement**

```ts
// pipeline/wav.ts
export function pcmToWav(
  pcm: Buffer,
  { sampleRate = 24000, channels = 1, bitDepth = 16 } = {},
): Buffer {
  const blockAlign = (channels * bitDepth) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);            // fmt chunk size
  header.writeUInt16LE(1, 20);             // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
```

- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(pipeline): PCM→WAV wrapper for Gemini TTS output"`

---

### Task 3: Manifest schema + per-repo config

**Files:**
- Create: `pipeline/manifest.ts`, `pipeline/config.ts`
- Test: `pipeline/manifest.test.ts`, `pipeline/config.test.ts`

**Interfaces:**
- Produces (manifest.ts): `SlideSchema`, `ManifestSchema` (zod), types `Slide`, `Manifest`, and `validateManifest(data: unknown): { ok: true; manifest: Manifest } | { ok: false; error: string }`.
- Produces (config.ts): `RepoConfig` type + `loadRepoConfig(json: unknown, repoName: string): RepoConfig` — pure merge of `.changelog-video.json` over defaults. Fields: `product`, `domain`, `brand`, `version` (`"date"`), `ttsModel` (default `gemini-3.1-flash-tts-preview`), `voice` (default `"Charon"`), plus `dateVersion(d: Date): string` → `v2026.7.15`.
- Manifest shape (consumed by Task 5, 6 and the Remotion props in Task 7):

```ts
type Manifest = {
  product: string; version: string; pr: number;
  domain: string; brand: string;
  cover: { script: string };
  slides: { type: "FEATURE" | "FIX" | "IMPROVEMENT"; title: string; body: string; script: string }[];
  outro: { headline: string; cta: string; subline: string; script: string };
};
```

- [ ] **Step 1: Write the failing tests**

```ts
// pipeline/manifest.test.ts
import { describe, expect, it } from "vitest";
import { validateManifest } from "./manifest";

const good = {
  product: "Dispatch", version: "v2026.7.15", pr: 207,
  domain: "DISPATCH.SOLARINBOUND.COM", brand: "MPOWR",
  cover: { script: "Dispatch release notes for July fifteenth." },
  slides: [{ type: "FEATURE", title: "Map Routing", body: "Routes now render on the map.", script: "Routes now render directly on the dispatch map." }],
  outro: { headline: "Dispatch News", cta: "Subscribe", subline: "Full changelog at the link below.", script: "Thanks for watching." },
};

describe("validateManifest", () => {
  it("accepts a valid manifest", () => {
    expect(validateManifest(good)).toEqual({ ok: true, manifest: good });
  });
  it("rejects unknown slide types", () => {
    const bad = { ...good, slides: [{ ...good.slides[0], type: "CHORE" }] };
    const r = validateManifest(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("slides");
  });
  it("rejects zero slides and more than three slides", () => {
    expect(validateManifest({ ...good, slides: [] }).ok).toBe(false);
    expect(validateManifest({ ...good, slides: Array(4).fill(good.slides[0]) }).ok).toBe(false);
  });
  it("rejects over-budget title/body", () => {
    expect(validateManifest({ ...good, slides: [{ ...good.slides[0], title: "x".repeat(49) }] }).ok).toBe(false);
    expect(validateManifest({ ...good, slides: [{ ...good.slides[0], body: "x".repeat(321) }] }).ok).toBe(false);
  });
});
```

```ts
// pipeline/config.test.ts
import { describe, expect, it } from "vitest";
import { dateVersion, loadRepoConfig } from "./config";

describe("config", () => {
  it("applies defaults when config file is absent", () => {
    const c = loadRepoConfig(undefined, "dispatch-schedule-ui");
    expect(c.product).toBe("dispatch-schedule-ui");
    expect(c.ttsModel).toBe("gemini-3.1-flash-tts-preview");
    expect(c.voice).toBeTruthy();
  });
  it("merges overrides over defaults", () => {
    const c = loadRepoConfig({ product: "Dispatch", brand: "MPOWR", domain: "dispatch.solarinbound.com" }, "dispatch-schedule-ui");
    expect(c.product).toBe("Dispatch");
    expect(c.brand).toBe("MPOWR");
    expect(c.ttsModel).toBe("gemini-3.1-flash-tts-preview");
  });
  it("rejects malformed config", () => {
    expect(() => loadRepoConfig({ ttsModel: 42 }, "x")).toThrow();
  });
  it("formats date versions without zero padding", () => {
    expect(dateVersion(new Date(2026, 6, 15))).toBe("v2026.7.15");
    expect(dateVersion(new Date(2026, 11, 3))).toBe("v2026.12.3");
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL.**
- [ ] **Step 3: Implement**

```ts
// pipeline/manifest.ts
import { z } from "zod";
import { BUDGETS } from "./budgets";

export const SlideSchema = z.object({
  type: z.enum(["FEATURE", "FIX", "IMPROVEMENT"]),
  title: z.string().min(1).max(BUDGETS.titleMaxChars),
  body: z.string().min(1).max(BUDGETS.bodyMaxChars),
  script: z.string().min(1),
});

export const ManifestSchema = z.object({
  product: z.string().min(1),
  version: z.string().min(1),
  pr: z.number().int().positive(),
  domain: z.string().min(1),
  brand: z.string().min(1),
  cover: z.object({ script: z.string().min(1) }),
  slides: z.array(SlideSchema).min(1).max(BUDGETS.maxSlides),
  outro: z.object({
    headline: z.string().min(1),
    cta: z.string().min(1),
    subline: z.string().min(1),
    script: z.string().min(1),
  }),
});

export type Slide = z.infer<typeof SlideSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

export function validateManifest(data: unknown):
  | { ok: true; manifest: Manifest }
  | { ok: false; error: string } {
  const r = ManifestSchema.safeParse(data);
  if (r.success) return { ok: true, manifest: r.data };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}
```

```ts
// pipeline/config.ts
import { z } from "zod";

const RepoConfigSchema = z.object({
  product: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  version: z.literal("date").optional(),
  ttsModel: z.string().min(1).optional(),
  voice: z.string().min(1).optional(),
});

export type RepoConfig = {
  product: string; domain: string; brand: string;
  version: "date"; ttsModel: string; voice: string;
};

export function loadRepoConfig(json: unknown, repoName: string): RepoConfig {
  const overrides = json === undefined ? {} : RepoConfigSchema.parse(json);
  return {
    product: overrides.product ?? repoName,
    domain: overrides.domain ?? `github.com/${repoName}`,
    brand: overrides.brand ?? repoName.toUpperCase(),
    version: "date",
    ttsModel: overrides.ttsModel ?? "gemini-3.1-flash-tts-preview",
    voice: overrides.voice ?? "Charon",
  };
}

export const dateVersion = (d: Date) => `v${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
```

- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(pipeline): manifest zod schema + per-repo config defaults"`

---

### Task 4: PR gathering with smart diff truncation

**Files:**
- Create: `pipeline/gather.ts`
- Test: `pipeline/gather.test.ts`

**Interfaces:**
- Produces: `truncateDiff(diff: string, maxBytes?: number): string` (pure), `isNoiseFile(path: string): boolean` (pure), and `gatherPr(repo: string, pr: number): Promise<PrBundle>` (calls `gh` via `Bun.spawn`; not unit-tested).
- `type PrBundle = { number: number; title: string; body: string; labels: string[]; mergedAt: string; diff: string; configJson: unknown }` — consumed by Task 5. `configJson` is the target repo's `.changelog-video.json` fetched via `gh api /repos/{repo}/contents/.changelog-video.json` (undefined on 404).

- [ ] **Step 1: Write the failing tests**

```ts
// pipeline/gather.test.ts
import { describe, expect, it } from "vitest";
import { isNoiseFile, truncateDiff } from "./gather";

describe("isNoiseFile", () => {
  it("flags lockfiles, snapshots, and generated dirs", () => {
    for (const p of ["bun.lock", "package-lock.json", "yarn.lock", "src/__snapshots__/a.snap", "dist/bundle.js", ".svelte-kit/types.d.ts"]) {
      expect(isNoiseFile(p)).toBe(true);
    }
  });
  it("keeps source files", () => {
    for (const p of ["src/lib/routing/core.ts", "pipeline/tts.ts", "README.md"]) {
      expect(isNoiseFile(p)).toBe(false);
    }
  });
});

const fileDiff = (path: string, lines = 5) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n` +
  Array.from({ length: lines }, (_, i) => `+line ${i}`).join("\n") + "\n";

describe("truncateDiff", () => {
  it("replaces noise-file hunks with a one-line stub", () => {
    const out = truncateDiff(fileDiff("bun.lock", 500) + fileDiff("src/app.ts"));
    expect(out).toContain("[bun.lock: changes omitted (generated/lockfile)]");
    expect(out).not.toContain("+line 400");
    expect(out).toContain("src/app.ts");
    expect(out).toContain("+line 2");
  });
  it("caps total output at maxBytes with a truncation note", () => {
    const big = fileDiff("src/a.ts", 10_000);
    const out = truncateDiff(big, 5_000);
    expect(out.length).toBeLessThanOrEqual(5_100);
    expect(out).toContain("[diff truncated");
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL.**
- [ ] **Step 3: Implement**

```ts
// pipeline/gather.ts
const NOISE = [
  /(^|\/)(bun|package-lock|yarn|pnpm-lock)\.(lock|json|yaml)$/,
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

export type PrBundle = {
  number: number; title: string; body: string; labels: string[];
  mergedAt: string; diff: string; configJson: unknown;
};

async function gh(args: string[]): Promise<string> {
  const proc = Bun.spawn(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  if ((await proc.exited) !== 0) throw new Error(`gh ${args[0]} failed: ${err}`);
  return out;
}

export async function gatherPr(repo: string, pr: number): Promise<PrBundle> {
  const viewJson = JSON.parse(
    await gh(["pr", "view", String(pr), "--repo", repo, "--json", "number,title,body,labels,mergedAt"]),
  );
  const diff = truncateDiff(await gh(["pr", "diff", String(pr), "--repo", repo]));
  let configJson: unknown;
  try {
    const raw = await gh(["api", `/repos/${repo}/contents/.changelog-video.json`, "--jq", ".content"]);
    configJson = JSON.parse(Buffer.from(raw.trim(), "base64").toString("utf8"));
  } catch {
    configJson = undefined; // no config file — defaults apply
  }
  return {
    number: viewJson.number, title: viewJson.title, body: viewJson.body ?? "",
    labels: (viewJson.labels ?? []).map((l: { name: string }) => l.name),
    mergedAt: viewJson.mergedAt, diff, configJson,
  };
}
```

- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Smoke the gh path against a real PR**

Run: `bun -e 'import {gatherPr} from "./pipeline/gather.ts"; const b = await gatherPr("<owner>/dispatch-schedule-ui", 205); console.log(b.title, b.diff.length)'`
(Resolve `<owner>` with `gh repo view --json owner -q .owner.login` in `/opt/Projects/dispatch-schedule-ui` first.)
Expected: prints the PR title and a nonzero diff length.

- [ ] **Step 6: Commit** — `git commit -am "feat(pipeline): PR gathering with noise-aware diff truncation"`

---

### Task 5: Editorial agent workflow (Agent SDK, 5 passes)

**Files:**
- Create: `pipeline/generate.ts`, `pipeline/prompts.ts`
- Test: `pipeline/prompts.test.ts` (prompt builders are pure); agent flow itself is covered by the golden-PR harness in Task 8.

**Interfaces:**
- Consumes: `PrBundle` (Task 4), `RepoConfig` (Task 3), `narrationBudgetCheck`/`BUDGETS` (Task 1), `validateManifest` (Task 3).
- Produces: `generateManifest(bundle: PrBundle, config: RepoConfig, opts?: { runQuery?: RunQuery }): Promise<Manifest>` where `type RunQuery = (prompt: string, schema: object) => Promise<unknown>` — the injectable Agent SDK wrapper (real impl uses `query()`; harness can inject fakes).
- Prompt builders exported for tests: `editorPrompt(bundle, config)`, `copyPrompt(plan, bundle)`, `voicePrompt(copy, plan)`, `criticPrompt(draft, bundle)`.

- [ ] **Step 1: Write the failing prompt tests**

```ts
// pipeline/prompts.test.ts
import { describe, expect, it } from "vitest";
import { copyPrompt, criticPrompt, editorPrompt, voicePrompt } from "./prompts";

const bundle = { number: 207, title: "feat: map routing", body: "Adds routing", labels: ["feature"], mergedAt: "2026-07-15T00:00:00Z", diff: "diff --git a/x b/x\n+code", configJson: undefined };
const config = { product: "Dispatch", domain: "d.com", brand: "MPOWR", version: "date" as const, ttsModel: "m", voice: "v" };

describe("prompt builders", () => {
  it("editor prompt embeds diff, PR metadata, and slide/runtime budgets", () => {
    const p = editorPrompt(bundle as any, config);
    expect(p).toContain("feat: map routing");
    expect(p).toContain("+code");
    expect(p).toContain("1-3");        // slide count constraint stated
    expect(p).toContain("28");          // runtime budget stated
  });
  it("copy prompt states hard character budgets", () => {
    const p = copyPrompt({ slides: [] }, bundle as any);
    expect(p).toContain("48");
    expect(p).toContain("320");
  });
  it("voice prompt states words-per-slide targets", () => {
    expect(voicePrompt({}, { slides: [{ targetSeconds: 12 }] })).toContain("150");
  });
  it("critic prompt includes the diff for grounding", () => {
    expect(criticPrompt({}, bundle as any)).toContain("+code");
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL.**

- [ ] **Step 3: Implement prompts.ts**

Each builder returns a single string. Content requirements (write full prose in the implementation):

- `editorPrompt` — role: release-notes editor for `${config.product}`. Input: PR title/body/labels + truncated diff. Ask: is this newsworthy to a *user of the product*? Decide 1-3 slides, each `{type: FEATURE|FIX|IMPROVEMENT, angle: string, targetSeconds: number}`, allocating a total narration budget of 28-55 seconds (cover ~6-9s, each slide the remainder, outro ~4-6s — state these numbers). Pure-chore PRs → 1 modest IMPROVEMENT slide. Output JSON only.
- `copyPrompt` — role: copywriter. Input: editor plan + PR context. Write per slide: `title` (≤48 chars, no trailing period, editorial noun-phrase like "Nested Sub-Agents"), `body` (≤320 chars, plain confident prose, no markdown), plus cover `tocLabels` (short, one per slide) and outro `subline`. Output JSON only.
- `voicePrompt` — role: voiceover writer. Input: copy + per-slide `targetSeconds`. Rewrite *for the ear*: short sentences, no parentheticals, numbers spelled naturally; target `targetSeconds × 2.5` words per slide at 150 wpm (state the arithmetic); cover script intros the release ("<Product> release notes, <version> …"); outro script is one closing line. Output JSON only.
- `criticPrompt` — role: skeptical editor. Input: full draft manifest + the diff. Check: char budgets (state 48/320), total narration 28-55s at 2.5 words/sec, no jargon/internal codenames, every claim grounded in the diff (list any hallucinated claims). Output JSON: `{pass: boolean, notes: string[]}`.

- [ ] **Step 4: Run prompt tests, verify PASS.**

- [ ] **Step 5: Implement generate.ts**

```ts
// pipeline/generate.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { BUDGETS, narrationBudgetCheck } from "./budgets";
import type { RepoConfig } from "./config";
import { dateVersion } from "./config";
import type { PrBundle } from "./gather";
import { validateManifest, type Manifest } from "./manifest";
import { copyPrompt, criticPrompt, editorPrompt, voicePrompt } from "./prompts";

export type RunQuery = (prompt: string, schema: object) => Promise<unknown>;

export const runAgentQuery: RunQuery = async (prompt, schema) => {
  for await (const message of query({
    prompt,
    options: { tools: [], maxTurns: 1, outputFormat: { type: "json_schema", schema } },
  })) {
    if (message.type === "result") return (message as { output?: unknown }).output;
  }
  throw new Error("agent query produced no result message");
};

// JSON schemas for each pass (plain objects; the SDK enforces them).
const PLAN_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    newsworthy: { type: "boolean" },
    slides: {
      type: "array", minItems: 1, maxItems: BUDGETS.maxSlides,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["FEATURE", "FIX", "IMPROVEMENT"] },
          angle: { type: "string" },
          targetSeconds: { type: "number" },
        },
        required: ["type", "angle", "targetSeconds"],
      },
    },
  },
  required: ["newsworthy", "slides"],
};

const COPY_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    slides: {
      type: "array", minItems: 1, maxItems: BUDGETS.maxSlides,
      items: {
        type: "object", additionalProperties: false,
        properties: { title: { type: "string" }, body: { type: "string" } },
        required: ["title", "body"],
      },
    },
    subline: { type: "string" },
  },
  required: ["slides", "subline"],
};

const VOICE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    cover: { type: "string" },
    slides: { type: "array", items: { type: "string" } },
    outro: { type: "string" },
  },
  required: ["cover", "slides", "outro"],
};

const CRITIC_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { pass: { type: "boolean" }, notes: { type: "array", items: { type: "string" } } },
  required: ["pass", "notes"],
};

export async function generateManifest(
  bundle: PrBundle,
  config: RepoConfig,
  { runQuery = runAgentQuery }: { runQuery?: RunQuery } = {},
): Promise<Manifest> {
  const version = dateVersion(new Date(bundle.mergedAt));

  // Pass 2: editor
  const plan = (await runQuery(editorPrompt(bundle, config), PLAN_SCHEMA)) as {
    slides: { type: "FEATURE" | "FIX" | "IMPROVEMENT"; angle: string; targetSeconds: number }[];
  };

  let notes: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    // Pass 3: copywriter (revision notes appended on retries)
    const copy = (await runQuery(
      copyPrompt(plan, bundle) + (notes.length ? `\n\nREVISION NOTES (fix these):\n- ${notes.join("\n- ")}` : ""),
      COPY_SCHEMA,
    )) as { slides: { title: string; body: string }[]; subline: string };

    // Pass 4: voiceover
    const voice = (await runQuery(voicePrompt(copy, plan), VOICE_SCHEMA)) as {
      cover: string; slides: string[]; outro: string;
    };

    const draft = {
      product: config.product, version, pr: bundle.number,
      domain: config.domain.toUpperCase(), brand: config.brand.toUpperCase(),
      cover: { script: voice.cover },
      slides: plan.slides.map((s, i) => ({
        type: s.type, title: copy.slides[i]?.title ?? "", body: copy.slides[i]?.body ?? "",
        script: voice.slides[i] ?? "",
      })),
      outro: { headline: `${config.product} News`, cta: "Subscribe", subline: copy.subline, script: voice.outro },
    };

    // Local hard checks first (free), then critic pass (agent).
    const localBudget = narrationBudgetCheck([draft.cover.script, ...draft.slides.map((s) => s.script), draft.outro.script]);
    const schema = validateManifest(draft);
    const critic = (await runQuery(criticPrompt(draft, bundle), CRITIC_SCHEMA)) as { pass: boolean; notes: string[] };

    if (localBudget.ok && schema.ok && critic.pass) return schema.manifest;

    notes = [
      ...(localBudget.ok ? [] : [localBudget.reason!]),
      ...(schema.ok ? [] : [schema.error]),
      ...critic.notes,
    ];
    console.error(`revision cycle ${attempt + 1}: ${notes.join(" | ")}`);
  }
  throw new Error(`manifest failed validation after 2 revision cycles: ${notes.join(" | ")}`);
}
```

- [ ] **Step 6: Typecheck** — `bunx tsc --noEmit`. Expected: clean. (If the SDK's `result` message type differs — e.g. `structured_output` field instead of `output` — adjust the cast in `runAgentQuery` per `node_modules/@anthropic-ai/claude-agent-sdk` type defs; do not guess.)
- [ ] **Step 7: Run full test suite, verify PASS** — `bunx vitest run`.
- [ ] **Step 8: Commit** — `git commit -am "feat(pipeline): 5-pass editorial agent workflow with critic gate"`

---

### Task 6: Gemini TTS client

**Files:**
- Create: `pipeline/tts.ts`
- Test: `pipeline/tts.test.ts` (mocked fetch)

**Interfaces:**
- Consumes: `pcmToWav` (Task 2), `Manifest` (Task 3), `RepoConfig` (Task 3).
- Produces: `synthesize(text: string, cfg: { model: string; voice: string; apiKey: string; fetchImpl?: typeof fetch }): Promise<Buffer>` (WAV bytes) and `synthesizeManifest(manifest, config, outDir): Promise<string[]>` writing `cover.wav`, `slide1.wav`…`slideN.wav`, `outro.wav` into `outDir`, returning the file list.

- [ ] **Step 1: Write the failing tests**

```ts
// pipeline/tts.test.ts
import { describe, expect, it, vi } from "vitest";
import { synthesize } from "./tts";

const pcmBase64 = Buffer.alloc(4800).toString("base64");
const fakeResponse = {
  ok: true,
  json: async () => ({
    candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcmBase64 } }] } }],
  }),
};

describe("synthesize", () => {
  it("POSTs to the configured model with AUDIO modality and voice, returns WAV", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse as unknown as Response);
    const wav = await synthesize("Hello world", { model: "gemini-3.1-flash-tts-preview", voice: "Charon", apiKey: "k", fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("models/gemini-3.1-flash-tts-preview:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Charon");
    expect(body.contents[0].parts[0].text).toBe("Hello world");
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.length).toBe(44 + 4800);
  });

  it("throws with the API error body on non-200", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 429, text: async () => "quota" }) as unknown as Response);
    await expect(synthesize("x", { model: "m", voice: "v", apiKey: "k", fetchImpl })).rejects.toThrow(/429.*quota/s);
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL.**
- [ ] **Step 3: Implement**

```ts
// pipeline/tts.ts
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RepoConfig } from "./config";
import type { Manifest } from "./manifest";
import { pcmToWav } from "./wav";

type TtsCfg = { model: string; voice: string; apiKey: string; fetchImpl?: typeof fetch };

export async function synthesize(text: string, { model, voice, apiKey, fetchImpl = fetch }: TtsCfg): Promise<Buffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
  };
  const b64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error(`Gemini TTS returned no audio: ${JSON.stringify(json).slice(0, 500)}`);
  return pcmToWav(Buffer.from(b64, "base64"));
}

export async function synthesizeManifest(manifest: Manifest, config: RepoConfig, outDir: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  await mkdir(outDir, { recursive: true });
  const jobs: [string, string][] = [
    ["cover.wav", manifest.cover.script],
    ...manifest.slides.map((s, i): [string, string] => [`slide${i + 1}.wav`, s.script]),
    ["outro.wav", manifest.outro.script],
  ];
  const files: string[] = [];
  for (const [name, script] of jobs) { // sequential — avoids TTS rate limits
    const wav = await synthesize(script, { model: config.ttsModel, voice: config.voice, apiKey });
    const path = join(outDir, name);
    await Bun.write(path, wav);
    files.push(path);
  }
  return files;
}
```

- [ ] **Step 4: Run tests, verify PASS.**
- [ ] **Step 5: Live smoke (one short line)** — `bun -e 'import {synthesize} from "./pipeline/tts.ts"; const w = await synthesize("Dispatch release notes.", {model: "gemini-3.1-flash-tts-preview", voice: "Charon", apiKey: process.env.GEMINI_API_KEY!}); await Bun.write("/tmp/tts-smoke.wav", w); console.log(w.length)'` (load `.env` first: `set -a; source .env; set +a`). Expected: nonzero length; play the file to confirm it's speech. If the model name 404s, list models via `curl -s -H "x-goog-api-key: $GEMINI_API_KEY" https://generativelanguage.googleapis.com/v1beta/models | grep tts` and report findings to Matt before substituting.
- [ ] **Step 6: Commit** — `git commit -am "feat(pipeline): Gemini TTS client writing per-slide WAVs"`

---

### Task 7: Remotion project (theme, layout, slides, dynamic duration)

**Files:**
- Create: `video/src/index.ts`, `video/src/Root.tsx`, `video/src/theme.ts`, `video/src/Layout.tsx`, `video/src/CoverSlide.tsx`, `video/src/ContentSlide.tsx`, `video/src/OutroSlide.tsx`, `video/src/Main.tsx`, `video/public/manifest.json` (sample fixture), `video/public/audio/` (fixture WAVs from Task 6 smoke or silence)
- Test: visual — `bunx remotion still` per slide + compare against `docs/reference/*.jpg`. No vitest (rendering, not logic).

**Interfaces:**
- Consumes: `manifest.json` + `audio/*.wav` in `video/public/` (produced by Tasks 5-6 via the CLI in Task 8).
- Produces: composition id `Changelog`; `calculateMetadata` reads audio durations and stashes per-slide frame counts into props as `timing: {coverFrames, slideFrames: number[], outroFrames}`.

Key implementation notes (write these exactly):

```ts
// video/src/theme.ts
export const theme = {
  bg: "#FAF9F6", accent: "#D05A3F", ink: "#191919", muted: "#8A8A8A",
} as const;
// Fonts: import { loadFont as loadLora } from "@remotion/google-fonts/Lora";
//        import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
// Call both at module top of Root.tsx; export the returned fontFamily strings as serif/sans.
```

```tsx
// video/src/Layout.tsx — four-corner metadata grid used by every slide
import React from "react";
import { AbsoluteFill } from "remotion";
import { theme } from "./theme";

const corner: React.CSSProperties = {
  position: "absolute", fontSize: 22, letterSpacing: "0.18em",
  color: theme.muted, textTransform: "uppercase",
};

export const Layout: React.FC<{
  topLeft: string; topRight: string; bottomLeft: string; bottomRight: string;
  sans: string; children: React.ReactNode;
}> = ({ topLeft, topRight, bottomLeft, bottomRight, sans, children }) => (
  <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: sans }}>
    {/* hairline rules */}
    <div style={{ position: "absolute", top: 110, left: 96, right: 96, height: 1, background: "#E5E2DC" }} />
    <div style={{ position: "absolute", bottom: 96, left: 96, right: 96, height: 1, background: "#E5E2DC" }} />
    <div style={{ ...corner, top: 68, left: 96, color: theme.ink, fontWeight: 600 }}>{topLeft}</div>
    <div style={{ ...corner, top: 68, right: 96 }}>{topRight}</div>
    <div style={{ ...corner, bottom: 56, left: 96 }}>{bottomLeft}</div>
    <div style={{ ...corner, bottom: 56, right: 96 }}>{bottomRight}</div>
    {children}
  </AbsoluteFill>
);
```

Slide components (each also renders `<Audio src={staticFile(...)} />`):

- **CoverSlide** — "Release Notes" (serif italic, ~54px, muted→ink), version in ~230px serif starting `#C9C5BD`, snapping to `theme.ink` at frame 30 while a `spring({frame: frame-30, fps, config:{damping:12}})`-scaled terracotta circle (~160px) pops in beside it; TOC lower-left: rows of `01`-index (sans, muted, small) + slide title (serif, ink, ~40px), each row `opacity/translateY` interpolated in staggered 8-frame steps starting frame 45. Corners: `${PRODUCT} · ${VERSION}` / `COVER` / domain / brand.
- **ContentSlide** — top content area: terracotta 14px dot + `CATEGORY` letterspaced sans; title serif ~150px, ink, lineHeight 1.05, max-width ~1400px; body **Lora italic** ~44px, `theme.muted`, lineHeight 1.6, max-width ~1450px. Whole slide fades in over 8 frames. Corner top-right: `§ 0${index+1}`.
- **OutroSlide** — "Thanks for watching" serif italic muted ~48px; `${headline}` serif ~150px ink; charcoal pill (borderRadius 999, `#191919`, padding ~28×56) containing terracotta dot + `Subscribe` in sans white 600; subline serif italic muted; `— ${DOMAIN}` sans letterspaced. Corner top-right: `END`.
- **Main.tsx** — `<Series>`: cover for `timing.coverFrames`, each ContentSlide for `timing.slideFrames[i]`, outro for `timing.outroFrames`.

```tsx
// video/src/Root.tsx (core of the dynamic-duration wiring)
import { Composition, staticFile } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { Main } from "./Main";

const FPS = 30;
const PAD = 15;

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Changelog"
    component={Main}
    fps={FPS}
    width={1920}
    height={1080}
    durationInFrames={300} // placeholder; calculateMetadata overrides
    defaultProps={{ manifest: null as any, timing: null as any }}
    calculateMetadata={async () => {
      const manifest = await fetch(staticFile("manifest.json")).then((r) => r.json());
      const frames = async (name: string) =>
        Math.ceil((await getAudioDurationInSeconds(staticFile(`audio/${name}`))) * FPS) + PAD;
      const coverFrames = await frames("cover.wav");
      const slideFrames = await Promise.all(
        manifest.slides.map((_: unknown, i: number) => frames(`slide${i + 1}.wav`)),
      );
      const outroFrames = (await frames("outro.wav")) + 45; // hold ~1.5s extra on outro
      const timing = { coverFrames, slideFrames, outroFrames };
      return {
        durationInFrames: coverFrames + slideFrames.reduce((a: number, b: number) => a + b, 0) + outroFrames,
        props: { manifest, timing },
      };
    }}
  />
);
```

`video/src/index.ts`: `import { registerRoot } from "remotion"; import { RemotionRoot } from "./Root"; registerRoot(RemotionRoot);`

- [ ] **Step 1: Create fixture** — hand-write `video/public/manifest.json` matching the reference content (v2026.7.15, 2 slides: FEATURE "Nested Sub-Agents"-style + FIX) and generate fixture WAVs with the Task 6 smoke script (or `pcmToWav(Buffer.alloc(24000*2*8))` for 8s silence each) into `video/public/audio/`.
- [ ] **Step 2: Implement all components** per the notes above.
- [ ] **Step 3: Render stills of each act**

```bash
bunx remotion still video/src/index.ts Changelog out/still-cover.png --frame=80
bunx remotion still video/src/index.ts Changelog out/still-slide1.png --frame=300
bunx remotion still video/src/index.ts Changelog out/still-outro.png --frame=-20
```
Expected: three PNGs. Compare each against `docs/reference/shot1/2/4.jpg` — same grid, palette, type hierarchy. Iterate until close.
- [ ] **Step 4: Full test render** — `bunx remotion render video/src/index.ts Changelog out/test.mp4`. Expected: MP4 whose duration ≈ sum of audio + padding; audio audible per slide.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(video): Remotion editorial composition with audio-driven durations"`

---

### Task 8: CLI wiring + golden-PR end-to-end

**Files:**
- Create: `pipeline/cli.ts`, `pipeline/fixtures/` (golden manifests)
- Test: end-to-end run against a real merged dispatch PR.

**Interfaces:**
- Consumes: everything above.
- Produces: `bun run generate --repo <owner/name> --pr <n> [--out <dir>] [--skip-agent] [--skip-tts]` → writes `video/public/manifest.json` + `video/public/audio/*.wav`, runs `bunx remotion render`, copies the MP4 to `<out>/YYYY-MM-DD-pr<N>.mp4` (default `<target repo clone>/changelog/` is NOT assumed — default out is `./out`).

- [ ] **Step 1: Implement cli.ts**

```ts
// pipeline/cli.ts
import { parseArgs } from "node:util";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gatherPr } from "./gather";
import { loadRepoConfig } from "./config";
import { generateManifest } from "./generate";
import { synthesizeManifest } from "./tts";

const { values } = parseArgs({
  options: {
    repo: { type: "string" }, pr: { type: "string" },
    out: { type: "string", default: "out" },
    "skip-agent": { type: "boolean", default: false }, // reuse existing manifest.json
    "skip-tts": { type: "boolean", default: false },   // reuse existing audio/
  },
});
if (!values.repo || !values.pr) {
  console.error("usage: bun run generate --repo owner/name --pr 123 [--out dir] [--skip-agent] [--skip-tts]");
  process.exit(1);
}

const publicDir = join(import.meta.dir, "..", "video", "public");
const manifestPath = join(publicDir, "manifest.json");

const bundle = await gatherPr(values.repo, Number(values.pr));
const config = loadRepoConfig(bundle.configJson, values.repo.split("/")[1]);

let manifest;
if (values["skip-agent"]) {
  manifest = JSON.parse(await Bun.file(manifestPath).text());
  console.log("reusing existing manifest.json");
} else {
  manifest = await generateManifest(bundle, config);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`manifest: ${manifest.slides.length} slide(s)`);
}

if (!values["skip-tts"]) {
  const files = await synthesizeManifest(manifest, config, join(publicDir, "audio"));
  console.log(`audio: ${files.length} files`);
}

const render = Bun.spawn(
  ["bunx", "remotion", "render", "video/src/index.ts", "Changelog", "out/render.mp4"],
  { stdout: "inherit", stderr: "inherit", cwd: join(import.meta.dir, "..") },
);
if ((await render.exited) !== 0) throw new Error("remotion render failed");

await mkdir(values.out!, { recursive: true });
const day = new Date(bundle.mergedAt).toISOString().slice(0, 10);
const dest = join(values.out!, `${day}-pr${bundle.number}.mp4`);
await copyFile(join(import.meta.dir, "..", "out", "render.mp4"), dest);
console.log(`✓ ${dest}`);
```

- [ ] **Step 2: Load env and run end-to-end against a real PR**

```bash
set -a; source .env; set +a
bun run generate --repo <owner>/dispatch-schedule-ui --pr 205
```
Expected: manifest logged, N audio files, render completes, `out/2026-XX-XX-pr205.mp4` exists. Watch the video.
- [ ] **Step 3: Golden fixtures** — copy the generated manifest to `pipeline/fixtures/pr205.manifest.json`; repeat generation for one more PR (e.g. #189) and save it too. These are drift-detection references for future prompt changes (eyeball diff, not asserted in CI).
- [ ] **Step 4: Quality pass** — read both manifests critically: are titles editorial? Bodies grounded? Scripts natural? Iterate on `prompts.ts` wording if not, re-run with `--skip-tts` to save quota while tuning, and refresh fixtures.
- [ ] **Step 5: Full suite + typecheck green** — `bunx vitest run && bunx tsc --noEmit`.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(pipeline): CLI wiring + golden-PR fixtures"`

---

### Task 9: Reusable GitHub Action + docs

**Files:**
- Create: `.github/workflows/render-changelog.yml` (the `workflow_call` reusable workflow), `action/README.md` (opt-in instructions + stub), `README.md`

**Interfaces:**
- Consumes: the CLI (Task 8).
- Produces: a reusable workflow callable as `uses: <owner>/changelog-video/.github/workflows/render-changelog.yml@main` with secrets `CLAUDE_CODE_OAUTH_TOKEN`, `GEMINI_API_KEY`.

- [ ] **Step 1: Write the reusable workflow**

```yaml
# .github/workflows/render-changelog.yml
name: Render changelog video
on:
  workflow_call:
    inputs:
      pr_number: { required: true, type: number }
    secrets:
      CLAUDE_CODE_OAUTH_TOKEN: { required: true }
      GEMINI_API_KEY: { required: true }

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - name: Check out changelog-video
        uses: actions/checkout@v4
        with: { repository: ${{ github.repository_owner }}/changelog-video, path: changelog-video }
      - name: Check out target repo
        uses: actions/checkout@v4
        with: { path: target, token: ${{ github.token }} }
      - uses: oven-sh/setup-bun@v2
      - name: Install deps
        run: cd changelog-video && bun install --frozen-lockfile
      - name: Generate video
        env:
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          GH_TOKEN: ${{ github.token }}
        run: |
          cd changelog-video
          bun run generate --repo "${{ github.repository }}" --pr "${{ inputs.pr_number }}" --out ../target/changelog
      - name: Commit video to changelog/
        run: |
          cd target
          git config user.name "changelog-video[bot]"
          git config user.email "noreply@github.com"
          git add changelog/
          git commit -m "docs(changelog): release video for PR #${{ inputs.pr_number }} [skip ci]"
          git push
```

- [ ] **Step 2: Write the target-repo stub in action/README.md**

```yaml
# .github/workflows/changelog-video.yml  (in the TARGET repo)
name: Changelog video
on:
  pull_request: { types: [closed] }
jobs:
  video:
    if: github.event.pull_request.merged == true
    uses: <owner>/changelog-video/.github/workflows/render-changelog.yml@main
    with: { pr_number: ${{ github.event.pull_request.number }} }
    secrets:
      CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

Document in the same README: run `claude setup-token` once locally → store as org/repo secret `CLAUDE_CODE_OAUTH_TOKEN`; add `GEMINI_API_KEY` secret; optional `.changelog-video.json` fields with the dispatch example; note that Remotion in CI needs Chrome — add `npx remotion browser ensure` before render if the render step fails headless.

- [ ] **Step 3: Write repo README.md** — architecture sketch, local usage (`bun run generate …`), config reference, link to spec.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(action): reusable workflow_call + target-repo opt-in docs"`
- [ ] **Step 5 (with Matt):** create the GitHub repo, push, set secrets, add the stub + config to dispatch-schedule-ui via PR, merge a test PR to verify the event path end-to-end. (This step needs Matt's go-ahead — repo creation and secrets are account-level actions.)

---

## Self-review notes

- Spec coverage: gather/editor/copy/voice/critic → Task 4-5; TTS + WAV → Tasks 2, 6; dynamic timing + visual system → Task 7; CLI + golden PRs → Task 8; event-driven + config + stub → Tasks 3, 9. Version scheme (`dateVersion`) → Task 3. Rotation of the pasted Gemini key: remind Matt at Task 9 Step 5.
- Known uncertainty flagged in-task: Agent SDK result-message field name (Task 5 Step 6), Gemini model name availability (Task 6 Step 5), Remotion headless Chrome in CI (Task 9 Step 2). Each has a verify-don't-guess instruction.
