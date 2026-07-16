import { describe, expect, it } from "vitest";
import { blindPrompt, draftsToEvaluate, latestRunFile, viewerMaterials } from "./eval";
import type { AttemptRecord, DraftSnapshot, RunRecord } from "./runlog";

const draft = (marker: string): DraftSnapshot => ({
  cover: { script: `Cover ${marker}.` },
  slides: [
    { type: "FEATURE", layout: "standard", title: `Title ${marker}`, script: `Script ${marker}.`, body: `Body ${marker}.` },
    {
      type: "FIX",
      layout: "grid",
      title: "Small Stuff",
      script: "Also fixed things.",
      gridItems: [
        { tag: "FIX", description: "thing one" },
        { tag: "FIX", description: "thing two" },
      ],
    },
  ],
  outro: { script: `Outro ${marker}.` },
});

const attempt = (n: number, marker: string): AttemptRecord => ({
  attempt: n,
  safeMode: false,
  slideCount: 2,
  slideTypes: ["FEATURE", "FIX"],
  estimatedSeconds: 20,
  gates: { runtime: true, pacing: true, schema: true, critic: n > 0 },
  criticNotes: [],
  draft: draft(marker),
  passMs: { editor: 1, copywriter: 1, voiceover: 1, critic: 1 },
});

const record = (attempts: AttemptRecord[]): RunRecord => ({
  repo: "acme/widgets",
  pr: 7,
  config: { product: "W", version: "semver", voice: "Schedar", ttsModel: "t" },
  startedAt: "2026-07-16T00:00:00Z",
  finishedAt: "2026-07-16T00:05:00Z",
  outcome: { status: "converged", attempts: attempts.length, version: "v1.0.1" },
  attempts,
});

describe("viewerMaterials", () => {
  it("renders exactly what the viewer sees and hears — narration, titles, bodies, grid tiles", () => {
    const text = viewerMaterials(draft("A"));
    expect(text).toContain("[COVER — narration] Cover A.");
    expect(text).toContain("[SLIDE 1 — on-screen title] Title A");
    expect(text).toContain("[SLIDE 1 — on-screen text] Body A.");
    expect(text).toContain("[SLIDE 2 — on-screen tile] (FIX) thing one");
    expect(text).toContain("[OUTRO — narration] Outro A.");
  });

  it("feeds the blind prompt with the transcript and nothing about the PR", () => {
    const p = blindPrompt(draft("A"));
    expect(p).toContain("Cover A.");
    expect(p).not.toMatch(/pull request #|diff --git/i);
  });
});

describe("draftsToEvaluate", () => {
  it("returns first and final when a run took multiple cycles", () => {
    const r = record([attempt(0, "first"), attempt(1, "mid"), attempt(2, "final")]);
    const out = draftsToEvaluate(r);
    expect(out.map((d) => d.label)).toEqual(["first", "final"]);
    expect(out[0].attempt.attempt).toBe(0);
    expect(out[1].attempt.attempt).toBe(2);
  });

  it("dedupes when the run converged on the first cycle", () => {
    const out = draftsToEvaluate(record([attempt(0, "only")]));
    expect(out.map((d) => d.label)).toEqual(["final"]);
  });

  it("is empty for a record with no attempts", () => {
    expect(draftsToEvaluate(record([]))).toEqual([]);
  });
});

describe("latestRunFile", () => {
  it("picks the newest by timestamp prefix and ignores eval reports", () => {
    expect(
      latestRunFile([
        "2026-07-15T10-00-00Z-pr1.json",
        "2026-07-16T09-00-00Z-pr2.json",
        "2026-07-16T09-00-00Z-pr2.eval.json",
        "notes.txt",
      ]),
    ).toBe("2026-07-16T09-00-00Z-pr2.json");
  });

  it("returns undefined when there are no records", () => {
    expect(latestRunFile(["x.eval.json"])).toBeUndefined();
  });
});
