import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { gatherPr, type PrBundle } from "./gather";
import { runAgentQuery, type RunQuery } from "./generate";
import type { AttemptRecord, DraftSnapshot, RunRecord } from "./runlog";

/**
 * Offline quality eval over run-ledger records (`bun run eval`).
 *
 * The live critic verifies grounding — it holds the diff, so it can check
 * claims, but it can never experience the video the way the audience does:
 * cold. This eval closes that gap with a two-role protocol per draft:
 *
 *  1. BLIND VIEWER — sees ONLY what the video shows and says (scripts +
 *     on-screen copy), reconstructs what changed / who's affected / what to
 *     do differently. No diff, no PR, no title.
 *  2. GRADER — holds the PR ground truth and scores the reconstruction:
 *     what was understood, what was missed, what was falsely believed.
 *
 * Run on the FIRST and FINAL drafts of a record, the score delta answers the
 * question the live loop can't: did the revision cycles actually improve
 * comprehensibility, or just churn the wording? Costs 2 agent calls per
 * draft judged — run it when tuning prompts, not on every merge.
 */

const BLIND_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    whatChanged: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
    whoIsAffected: { type: "string" },
    whatToDoDifferently: { type: "string" },
    ambiguities: { type: "array", items: { type: "string" } },
  },
  required: ["whatChanged", "whoIsAffected", "whatToDoDifferently", "ambiguities"],
};

const GRADE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "number" },
    correct: { type: "array", items: { type: "string" } },
    missed: { type: "array", items: { type: "string" } },
    falseBeliefs: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["score", "correct", "missed", "falseBeliefs", "notes"],
};

export type BlindReconstruction = {
  whatChanged: string[];
  whoIsAffected: string;
  whatToDoDifferently: string;
  ambiguities: string[];
};

export type Grade = {
  score: number;
  correct: string[];
  missed: string[];
  falseBeliefs: string[];
  notes: string[];
};

export type DraftEval = {
  attempt: number;
  label: "first" | "final";
  blind: BlindReconstruction;
  grade: Grade;
};

export type EvalReport = {
  runFile: string;
  repo: string;
  pr: number;
  outcome: RunRecord["outcome"];
  drafts: DraftEval[];
  /** Present when first and final differ: finalScore - firstScore. */
  cycleDelta?: number;
};

/** Everything a viewer sees and hears, as plain text — nothing else. */
export function viewerMaterials(draft: DraftSnapshot): string {
  const lines: string[] = [`[COVER — narration] ${draft.cover.script}`];
  (draft.slides as Record<string, unknown>[]).forEach((s, i) => {
    lines.push(`[SLIDE ${i + 1} — on-screen title] ${s.title}`);
    if (typeof s.body === "string") lines.push(`[SLIDE ${i + 1} — on-screen text] ${s.body}`);
    if (Array.isArray(s.gridItems)) {
      for (const g of s.gridItems as { tag: string; description: string }[]) {
        lines.push(`[SLIDE ${i + 1} — on-screen tile] (${g.tag}) ${g.description}`);
      }
    }
    lines.push(`[SLIDE ${i + 1} — narration] ${s.script}`);
  });
  lines.push(`[OUTRO — narration] ${draft.outro.script}`);
  return lines.join("\n");
}

export function blindPrompt(draft: DraftSnapshot): string {
  return `You are a dispatcher at a field-service company. You just watched a short product-update video about the scheduling software you use every day. You have NO other context: you have not read any code, pull request, changelog, or documentation, and nobody has told you what this update contains.

Below is a transcript of everything the video showed on screen and spoke aloud, in order.

Reconstruct your understanding STRICTLY from this transcript:
- whatChanged: each distinct change you believe shipped, in your own words
- whoIsAffected: which people this matters to
- whatToDoDifferently: what you would now do differently in the product
- ambiguities: anything you could not confidently decode on one viewing (words you didn't understand, sentences that could mean two things, references with no explanation)

Do not guess beyond what the transcript supports — if a reading is uncertain, it belongs in ambiguities, not in whatChanged.

TRANSCRIPT:
${viewerMaterials(draft)}`;
}

export function gradePrompt(blind: BlindReconstruction, bundle: PrBundle): string {
  return `A cold viewer — no context beyond the video itself — watched a product-update video and reconstructed their understanding of it. Your job is to grade how faithfully that understanding matches what ACTUALLY shipped, using the pull request below as ground truth.

Grade ONLY user-facing reality: internal refactors, test counts, and implementation details do not count as "missed" — the video is for a non-technical audience. A change counts as understood if the viewer got its practical effect right, even in different words.

- score: 0-100. 100 = every user-facing change correctly understood and nothing false believed. Subtract heavily for falseBeliefs (a wrong belief is worse than a gap), moderately for missed user-facing changes, lightly for vagueness.
- correct: shipped changes the viewer correctly understood
- missed: user-facing shipped changes absent from the reconstruction
- falseBeliefs: things the viewer came away believing that are not true of what shipped
- notes: anything else worth knowing (e.g. an ambiguity the viewer flagged that the video should have prevented)

VIEWER'S RECONSTRUCTION:
${JSON.stringify(blind, null, 1)}

GROUND TRUTH — PR #${bundle.number}: ${bundle.title}
${bundle.body}

DIFF:
${bundle.diff}`;
}

/** First and final attempts of a record — deduped when the run converged in one. */
export function draftsToEvaluate(record: RunRecord): { attempt: AttemptRecord; label: "first" | "final" }[] {
  const first = record.attempts[0];
  const final = record.attempts[record.attempts.length - 1];
  if (!first) return [];
  if (first === final) return [{ attempt: first, label: "final" }];
  return [
    { attempt: first, label: "first" },
    { attempt: final, label: "final" },
  ];
}

/** Newest run file by the sortable timestamp prefix in its name. */
export function latestRunFile(files: string[]): string | undefined {
  return files
    .filter((f) => f.endsWith(".json") && !f.endsWith(".eval.json"))
    .sort()
    .at(-1);
}

export async function evaluateRun(
  runPath: string,
  { runQuery = runAgentQuery }: { runQuery?: RunQuery } = {},
): Promise<EvalReport> {
  const record: RunRecord = JSON.parse(await readFile(runPath, "utf8"));
  const bundle = await gatherPr(record.repo, record.pr);
  const drafts: DraftEval[] = [];
  for (const { attempt, label } of draftsToEvaluate(record)) {
    console.error(`eval: blind viewing ${label} draft (attempt ${attempt.attempt})…`);
    const blind = (await runQuery(blindPrompt(attempt.draft), BLIND_SCHEMA)) as BlindReconstruction;
    console.error(`eval: grading ${label} draft against PR ground truth…`);
    const grade = (await runQuery(gradePrompt(blind, bundle), GRADE_SCHEMA)) as Grade;
    drafts.push({ attempt: attempt.attempt, label, blind, grade });
  }
  const first = drafts.find((d) => d.label === "first");
  const final = drafts.find((d) => d.label === "final");
  return {
    runFile: basename(runPath),
    repo: record.repo,
    pr: record.pr,
    outcome: record.outcome,
    drafts,
    ...(first && final ? { cycleDelta: final.grade.score - first.grade.score } : {}),
  };
}

// ---- CLI entrypoint (bun run eval) -----------------------------------------

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      run: { type: "string" }, // path to a specific runs/*.json; default = newest
    },
  });
  const root = join(import.meta.dir, "..");
  const runsDir = join(root, "runs");
  const runPath =
    values.run ??
    (await (async () => {
      const latest = latestRunFile(await readdir(runsDir).catch(() => []));
      if (!latest) {
        console.error("no run records in runs/ — generate something first");
        process.exit(1);
      }
      return join(runsDir, latest);
    })());

  const report = await evaluateRun(runPath);
  const outPath = runPath.replace(/\.json$/, ".eval.json");
  await writeFile(outPath, JSON.stringify(report, null, 2));

  for (const d of report.drafts) {
    console.log(`\n── ${d.label} draft (attempt ${d.attempt}) — comprehension ${d.grade.score}/100`);
    if (d.grade.missed.length) console.log(`  missed: ${d.grade.missed.join(" | ")}`);
    if (d.grade.falseBeliefs.length) console.log(`  FALSE BELIEFS: ${d.grade.falseBeliefs.join(" | ")}`);
    if (d.blind.ambiguities.length) console.log(`  viewer ambiguities: ${d.blind.ambiguities.join(" | ")}`);
  }
  if (report.cycleDelta !== undefined) {
    console.log(
      `\ncycle delta: ${report.cycleDelta >= 0 ? "+" : ""}${report.cycleDelta} (revision cycles ${
        report.cycleDelta > 0 ? "improved" : report.cycleDelta < 0 ? "DEGRADED" : "did not change"
      } comprehension)`,
    );
  }
  console.log(`\n✓ ${outPath}`);
}
