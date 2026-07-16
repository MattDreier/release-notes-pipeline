import { query } from "@anthropic-ai/claude-agent-sdk";
import { BUDGETS, narrationBudgetCheck } from "./budgets";
import type { RepoConfig } from "./config";
import { dateVersion } from "./config";
import type { PrBundle } from "./gather";
import { validateManifest, type Manifest } from "./manifest";
import { copyPrompt, criticPrompt, editorPrompt, voicePrompt } from "./prompts";

export type RunQuery = (prompt: string, schema: Record<string, unknown>) => Promise<unknown>;

export const runAgentQuery: RunQuery = async (prompt, schema) => {
  for await (const message of query({
    prompt,
    options: {
      tools: [], // pure text reasoning — no file/bash access needed
      maxTurns: 1,
      outputFormat: { type: "json_schema", schema },
    },
  })) {
    if (message.type === "result") {
      if (message.subtype !== "success") {
        throw new Error(`agent query failed: ${message.subtype}`);
      }
      return message.structured_output;
    }
  }
  throw new Error("agent query produced no result message");
};

// JSON schemas for each pass (enforced by the SDK's structured output).
const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    newsworthy: { type: "boolean" },
    slides: {
      type: "array",
      minItems: 1,
      maxItems: BUDGETS.maxSlides,
      items: {
        type: "object",
        additionalProperties: false,
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
        properties: { title: { type: "string" }, body: { type: "string" } },
        required: ["title", "body"],
      },
    },
    subline: { type: "string" },
  },
  required: ["slides", "subline"],
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

type Plan = { slides: { type: "FEATURE" | "FIX" | "IMPROVEMENT"; angle: string; targetSeconds: number }[] };
type Copy = { slides: { title: string; body: string }[]; subline: string };
type Voice = { cover: string; slides: string[]; outro: string };
type Critique = { pass: boolean; notes: string[] };

export async function generateManifest(
  bundle: PrBundle,
  config: RepoConfig,
  { runQuery = runAgentQuery }: { runQuery?: RunQuery } = {},
): Promise<Manifest> {
  const version = dateVersion(new Date(bundle.mergedAt));

  console.error("pass 1/4: editor");
  const plan = (await runQuery(editorPrompt(bundle, config), PLAN_SCHEMA)) as Plan;
  console.error(`  → ${plan.slides.length} slide(s): ${plan.slides.map((s) => s.type).join(", ")}`);

  let notes: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    console.error(`pass 2/4: copywriter${attempt ? ` (revision ${attempt})` : ""}`);
    const copy = (await runQuery(
      copyPrompt(plan, bundle) +
        (notes.length ? `\n\nREVISION NOTES (fix these):\n- ${notes.join("\n- ")}` : ""),
      COPY_SCHEMA,
    )) as Copy;

    console.error("pass 3/4: voiceover");
    const voice = (await runQuery(voicePrompt(copy, plan), VOICE_SCHEMA)) as Voice;

    const draft = {
      product: config.product,
      version,
      pr: bundle.number,
      domain: config.domain.toUpperCase(),
      brand: config.brand.toUpperCase(),
      cover: { script: voice.cover },
      slides: plan.slides.map((s, i) => ({
        type: s.type,
        title: copy.slides[i]?.title ?? "",
        body: copy.slides[i]?.body ?? "",
        script: voice.slides[i] ?? "",
      })),
      outro: {
        headline: `${config.product} News`,
        cta: "Subscribe",
        subline: copy.subline,
        script: voice.outro,
      },
    };

    // Local hard checks first (free), then the critic pass (agent).
    const localBudget = narrationBudgetCheck([
      draft.cover.script,
      ...draft.slides.map((s) => s.script),
      draft.outro.script,
    ]);
    const schema = validateManifest(draft);
    console.error("pass 4/4: critic");
    const critic = (await runQuery(criticPrompt(draft, bundle), CRITIC_SCHEMA)) as Critique;

    if (localBudget.ok && schema.ok && critic.pass) {
      console.error(`  ✓ approved (narration ~${localBudget.seconds.toFixed(0)}s)`);
      return schema.manifest;
    }

    notes = [
      ...(localBudget.ok ? [] : [localBudget.reason!]),
      ...(schema.ok ? [] : [schema.error]),
      ...critic.notes,
    ];
    console.error(`  ✗ revision cycle ${attempt + 1}: ${notes.join(" | ")}`);
  }
  throw new Error(`manifest failed validation after 2 revision cycles: ${notes.join(" | ")}`);
}
