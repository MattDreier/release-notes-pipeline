import { query } from "@anthropic-ai/claude-agent-sdk";
import { BUDGETS, narrationBudgetCheck, slidePacingCheck } from "./budgets";
import type { RepoConfig } from "./config";
import { dateVersion } from "./config";
import type { PrBundle } from "./gather";
import { validateManifest, type Manifest } from "./manifest";
import { copyPrompt, criticPrompt, editorPrompt, voicePrompt } from "./prompts";
import { GenerationExhausted, type AttemptRecord, type DraftSnapshot } from "./runlog";
import { versionForPr } from "./version";

export type RunQuery = (prompt: string, schema: Record<string, unknown>) => Promise<unknown>;

export const runAgentQuery: RunQuery = async (prompt, schema) => {
  for await (const message of query({
    prompt,
    options: {
      tools: [], // pure text reasoning — no file/bash access needed
      maxTurns: 8, // structured-output retries can consume extra turns; 1 is too tight
      outputFormat: { type: "json_schema", schema },
    },
  })) {
    if (message.type === "result") {
      if (message.subtype !== "success") {
        throw new Error(`agent query failed: ${message.subtype}`);
      }
      if (message.structured_output === undefined) {
        // A "success" result with no structured output usually means the CLI
        // answered with plain text instead of running the task — e.g. a usage-
        // limit notice. Surface that text; a silent undefined crashes later
        // with a useless TypeError.
        const text = "result" in message ? String(message.result).slice(0, 300) : "(no result text)";
        throw new Error(`agent query returned no structured output; result text: ${text}`);
      }
      return message.structured_output;
    }
  }
  throw new Error("agent query produced no result message");
};

// JSON schemas for each pass (enforced by the SDK's structured output).
const CATEGORY_ENUM = ["FEATURE", "IMPROVEMENT", "FIX", "BREAKING CHANGE"];
const LAYOUT_ENUM = ["standard", "metrics", "code", "comparison", "grid"];

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    newsworthy: { type: "boolean" },
    technical: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string", enum: CATEGORY_ENUM },
          bullet: { type: "string" },
        },
        required: ["category", "bullet"],
      },
    },
    slides: {
      type: "array",
      minItems: 1,
      maxItems: BUDGETS.maxSlides,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: CATEGORY_ENUM },
          layout: { type: "string", enum: LAYOUT_ENUM },
          angle: { type: "string" },
          targetSeconds: { type: "number" },
        },
        required: ["type", "layout", "angle", "targetSeconds"],
      },
    },
  },
  required: ["newsworthy", "technical", "slides"],
};

const COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    slides: {
      type: "array",
      minItems: 1,
      maxItems: BUDGETS.maxSlides,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          metrics: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              properties: { value: { type: "string" }, label: { type: "string" } },
              required: ["value", "label"],
            },
          },
          code: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              lines: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } },
            },
            required: ["label", "lines"],
          },
          beforeAfter: {
            type: "object",
            additionalProperties: false,
            properties: {
              before: { type: "string" },
              after: { type: "string" },
              beforeLabel: { type: "string" },
              afterLabel: { type: "string" },
            },
            required: ["before", "after"],
          },
          gridItems: {
            type: "array",
            minItems: 2,
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              properties: { tag: { type: "string" }, description: { type: "string" } },
              required: ["tag", "description"],
            },
          },
        },
        required: ["title"],
      },
    },
  },
  required: ["slides"],
};

const VOICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    cover: { type: "string" },
    slides: { type: "array", items: { type: "string" } },
    outro: { type: "string" },
  },
  required: ["cover", "slides", "outro"],
};

const CRITIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pass: { type: "boolean" },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["pass", "notes"],
};

type Category = "FEATURE" | "IMPROVEMENT" | "FIX" | "BREAKING CHANGE";
type LayoutType = "standard" | "metrics" | "code" | "comparison" | "grid";
type Plan = {
  technical: { category: Category; bullet: string }[];
  slides: { type: Category; layout: LayoutType; angle: string; targetSeconds: number }[];
};
type CopySlide = {
  title: string;
  body?: string;
  metrics?: { value: string; label: string }[];
  code?: { label: string; lines: string[] };
  beforeAfter?: { before: string; after: string; beforeLabel?: string; afterLabel?: string };
  gridItems?: { tag: string; description: string }[];
};
type Copy = { slides: CopySlide[] };
type Voice = { cover: string; slides: string[]; outro: string };
type Critique = { pass: boolean; notes: string[] };

export type GenerationResult = {
  manifest: Manifest;
  /** Terse dev-facing bullets for CHANGELOG.md, produced by the same
   * diff-grounded editor pass that plans the video. */
  technical: { category: Category; bullet: string }[];
  /** Per-cycle ledger records — every draft, gate verdict, and pass timing,
   * including the cycles that failed review. See runlog.ts. */
  attempts: AttemptRecord[];
};

export async function generateManifest(
  bundle: PrBundle,
  config: RepoConfig,
  { runQuery = runAgentQuery }: { runQuery?: RunQuery } = {},
): Promise<GenerationResult> {
  let notes: string[] = [];
  const attempts: AttemptRecord[] = [];
  const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
    const t0 = performance.now();
    const v = await fn();
    return [v, Math.round(performance.now() - t0)];
  };
  // Revision context: critic notes are indexical ("Slide 3's second sentence…"),
  // so revision passes must SEE the draft the notes refer to. Without it each
  // cycle re-invents the manifest from the PR bundle alone — which is how a
  // near-approved draft regresses (run history: a cycle re-added 31 words and
  // re-introduced wording an earlier cycle had already corrected).
  let prevDraft: string | null = null;
  const revisionContext = () =>
    prevDraft
      ? `\n\nPREVIOUS DRAFT — the REVISION NOTES below refer to THIS draft (its slide numbers, its quoted sentences). Treat it as the baseline: keep every title, script, and body the notes do NOT flag verbatim; change only what the notes call out. Do not re-invent unflagged content.\n${prevDraft}`
      : "";
  let plan: Plan | undefined;
  // Salvage inputs for the graceful-degradation path: the freshest diff-grounded
  // changelog bullets and computed version, so an exhausted run can still ship
  // its CHANGELOG entry even when no video converges.
  let lastTechnical: { category: Category; bullet: string }[] = [];
  let lastVersion = "";
  // Four attempts: an ambitious draft, one revision, then TWO safe-mode passes.
  // The editor re-plans on revision cycles too — critic notes are often
  // structural ("split this into two slides"), which only the plan can fix;
  // freezing the plan after pass 1 made such notes impossible to apply.
  // SAFE MODE collapses to <=3 slides to clear the runtime ceiling. Dense PRs
  // converge structurally on the FIRST safe pass but pick up fresh wording
  // notes on the collapsed draft — so a SECOND safe pass exists purely to apply
  // those notes within the collapsed shape (otherwise the run throws one polish
  // cycle short of a good, in-budget video).
  const MAX_ATTEMPTS = 4;
  const SAFE_MODE_FROM = 2;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const safeMode =
      attempt >= SAFE_MODE_FROM
        ? `\n\nSAFE MODE. Earlier drafts failed review. Your goal is to FIT the two hard narration budgets, which are measured in WORDS — slide count is NOT the lever (packing ideas into fewer slides makes each slide fail the per-slide gate):
- TOTAL: all narration together (cover + every slide + outro) must stay under ~135 words (~50s at the measured ~2.7 words/sec pace; the hard ceiling is 55s).
- PER SLIDE: no slide's script may exceed ~25 words (~10s; the hard per-slide gate is 12s). More short slides beat fewer packed ones — one idea per slide, up to the 6-slide maximum.
To fit the total budget, cut framing before substance: keep the cover and outro scripts to one short sentence each, then keep only the 2–4 MOST newsworthy items as their own "standard" slides and bundle the remaining minor items into ONE "grid" slide (a grid slide REQUIRES the gridItems payload — one item per bundled change, and its script gets one short clause per item). If REVISION NOTES above propose concrete replacement titles or scripts, adopt them verbatim unless they break a budget — do not re-invent what the reviewer already fixed. Use the plainest language available. A short, modest, obviously-true video that a stranger understands is the goal; ambition is not.`
        : "";
    const attemptLabel =
      attempt >= SAFE_MODE_FROM
        ? ` (SAFE MODE${attempt > SAFE_MODE_FROM ? ` revision ${attempt - SAFE_MODE_FROM}` : ""})`
        : attempt
          ? ` (revision ${attempt})`
          : "";
    console.error(`pass 1/4: editor${attemptLabel}`);
    const [planOut, editorMs] = await timed(() =>
      runQuery(
        editorPrompt(bundle, config) +
          (notes.length ? `${revisionContext()}\n\nREVISION NOTES from the previous cycle (apply any that concern the slide plan — e.g. splitting/merging slides):\n- ${notes.join("\n- ")}` : "") +
          safeMode,
        PLAN_SCHEMA,
      ),
    );
    plan = planOut as Plan;
    lastTechnical = plan.technical;
    console.error(`  → ${plan.slides.length} slide(s): ${plan.slides.map((s) => s.type).join(", ")}`);

    console.error(`pass 2/4: copywriter${attempt ? ` (revision ${attempt})` : ""}`);
    const [copyOut, copywriterMs] = await timed(() =>
      runQuery(
        copyPrompt(plan!, bundle) +
          (notes.length ? `${revisionContext()}\n\nREVISION NOTES (fix these):\n- ${notes.join("\n- ")}` : ""),
        COPY_SCHEMA,
      ),
    );
    const copy = copyOut as Copy;

    console.error("pass 3/4: voiceover");
    // Revision notes go to the voiceover pass too — the cover/outro scripts are
    // written here, so critic feedback about them must reach this pass.
    const [voiceOut, voiceoverMs] = await timed(() =>
      runQuery(
        voicePrompt(copy, plan!) +
          (notes.length ? `${revisionContext()}\n\nREVISION NOTES from the previous cycle (apply any that concern scripts):\n- ${notes.join("\n- ")}` : ""),
        VOICE_SCHEMA,
      ),
    );
    const voice = voiceOut as Voice;

    // Semver is descriptive: the bump falls out of this attempt's classified
    // contents (breaking → major, feature → minor, fix/improvement → patch),
    // with the previous version read from the target repo's CHANGELOG. A PR
    // that already has a changelog section reuses its version (idempotent).
    const version =
      config.version === "semver"
        ? versionForPr(bundle.changelog, bundle.number, plan.technical)
        : dateVersion(new Date(bundle.mergedAt));
    lastVersion = version;

    const draft = {
      product: config.product,
      version,
      pr: bundle.number,
      domain: config.domain.toUpperCase(),
      brand: config.brand.toUpperCase(),
      cover: { script: voice.cover },
      slides: plan.slides.map((s, i) => {
        const c = copy.slides[i];
        return {
          type: s.type,
          layout: s.layout,
          title: c?.title ?? "",
          script: voice.slides[i] ?? "",
          ...(c?.body !== undefined ? { body: c.body } : {}),
          ...(c?.metrics !== undefined ? { metrics: c.metrics } : {}),
          ...(c?.code !== undefined ? { code: c.code } : {}),
          ...(c?.beforeAfter !== undefined ? { beforeAfter: c.beforeAfter } : {}),
          ...(c?.gridItems !== undefined ? { gridItems: c.gridItems } : {}),
        };
      }),
      outro: {
        headline: `${config.product} News`,
        // Fixed copy — this line points at the two written artifacts committed
        // alongside the video, so it is not the copywriter's to reinterpret.
        subline: "Full release notes and official changelog at the link below.",
        link: `github.com/${bundle.repo}`,
        script: voice.outro,
      },
    };

    // Agent-written content of this cycle's draft — the scope the critic
    // judges, the next cycle's revision baseline, and the ledger's retained
    // draft. One snapshot serves all three.
    const snapshot: DraftSnapshot = {
      cover: { script: draft.cover.script },
      slides: draft.slides,
      outro: { script: draft.outro.script },
    };
    prevDraft = JSON.stringify(snapshot, null, 1);

    // Local hard checks first (free), then the critic pass (agent).
    const localBudget = narrationBudgetCheck([
      draft.cover.script,
      ...draft.slides.map((s) => s.script),
      draft.outro.script,
    ]);
    const pacing = slidePacingCheck(draft.slides.map((s) => s.script));
    const schema = validateManifest(draft);
    console.error("pass 4/4: critic");
    // The critic judges ONLY agent-written content. Fixed chrome (product,
    // version, brand, domain, outro link/subline/headline) is product-owner
    // config no revision pass can change — showing it produces unactionable
    // notes that burn revision cycles (live failure, PR #246 regeneration).
    const [criticOut, criticMs] = await timed(() =>
      runQuery(criticPrompt(snapshot, bundle), CRITIC_SCHEMA),
    );
    const critic = criticOut as Critique;

    attempts.push({
      attempt,
      safeMode: attempt >= SAFE_MODE_FROM,
      slideCount: draft.slides.length,
      slideTypes: draft.slides.map((s) => s.type),
      estimatedSeconds: Number(localBudget.seconds.toFixed(1)),
      gates: { runtime: localBudget.ok, pacing: pacing.ok, schema: schema.ok, critic: critic.pass },
      criticNotes: critic.notes,
      draft: snapshot,
      passMs: { editor: editorMs, copywriter: copywriterMs, voiceover: voiceoverMs, critic: criticMs },
    });

    if (localBudget.ok && pacing.ok && schema.ok && critic.pass) {
      console.error(`  ✓ approved (narration ~${localBudget.seconds.toFixed(0)}s, ${draft.slides.length} slides)`);
      return { manifest: schema.manifest, technical: plan.technical, attempts };
    }

    notes = [
      ...(localBudget.ok ? [] : [localBudget.reason!]),
      ...(pacing.ok ? [] : [pacing.reason!]),
      ...(schema.ok ? [] : [schema.error]),
      ...critic.notes,
    ];
    console.error(`  ✗ revision cycle ${attempt + 1}: ${notes.join(" | ")}`);
  }
  throw new GenerationExhausted(
    `manifest failed validation after ${MAX_ATTEMPTS - 1} revision cycles: ${notes.join(" | ")}`,
    attempts,
    notes,
    lastTechnical,
    lastVersion,
  );
}
