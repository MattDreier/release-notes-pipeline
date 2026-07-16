import { describe, expect, it } from "vitest";
import type { RepoConfig } from "./config";
import type { PrBundle } from "./gather";
import { generateManifest, type RunQuery } from "./generate";

const bundle: PrBundle = {
  repo: "acme/widgets",
  number: 42,
  title: "feat: add frobnicator",
  body: "Adds the frobnicator.",
  labels: [],
  mergedAt: "2026-07-16T12:00:00Z",
  diff: "diff --git a/x b/x",
  images: [],
  configJson: undefined,
  changelog: null,
};

const config: RepoConfig = {
  product: "Widgets",
  domain: "widgets.example.com",
  brand: "Acme",
  version: "semver",
  ttsModel: "tts-model",
  voice: "Charon",
};

/** Passes arrive in fixed groups of 4 per cycle: editor, copywriter, voiceover, critic. */
type Recorded = { prompt: string };

function fakeRunQuery(criticVerdicts: { pass: boolean; notes: string[] }[]) {
  const calls: Recorded[] = [];
  let n = 0;
  const runQuery: RunQuery = async (prompt) => {
    calls.push({ prompt });
    const pass = n % 4;
    const cycle = Math.floor(n / 4);
    n++;
    switch (pass) {
      case 0: // editor → plan
        return {
          newsworthy: true,
          technical: [{ category: "FIX", bullet: "fixed the frobnicator" }],
          slides: [{ type: "FIX", layout: "standard", angle: "it works now", targetSeconds: 6 }],
        };
      case 1: // copywriter
        return { slides: [{ title: `Title Cycle ${cycle}`, body: `Body cycle ${cycle}.` }] };
      case 2: // voiceover
        return {
          cover: `Cover script cycle ${cycle}.`,
          slides: [`UNIQUE-SCRIPT-CYCLE-${cycle} words here.`],
          outro: `Outro cycle ${cycle}.`,
        };
      default: // critic
        return criticVerdicts[cycle];
    }
  };
  return { runQuery, calls };
}

describe("generateManifest revision loop", () => {
  it("converges on first cycle without any revision context", async () => {
    const { runQuery, calls } = fakeRunQuery([{ pass: true, notes: [] }]);
    const result = await generateManifest(bundle, config, { runQuery });
    expect(calls).toHaveLength(4);
    expect(result.manifest.slides[0].script).toBe("UNIQUE-SCRIPT-CYCLE-0 words here.");
    for (const c of calls) expect(c.prompt).not.toContain("PREVIOUS DRAFT");
  });

  it("shows revision passes the previous draft the notes refer to", async () => {
    const { runQuery, calls } = fakeRunQuery([
      { pass: false, notes: ["Slide 1 body: say it plainly"] },
      { pass: true, notes: [] },
    ]);
    const result = await generateManifest(bundle, config, { runQuery });
    expect(calls).toHaveLength(8);

    // Cycle 1 (calls 0-3): no revision context anywhere.
    for (const c of calls.slice(0, 4)) expect(c.prompt).not.toContain("PREVIOUS DRAFT");

    // Cycle 2 editor/copy/voice (calls 4-6): each sees the prior draft verbatim
    // plus the critic notes, so indexical notes have a referent.
    for (const c of calls.slice(4, 7)) {
      expect(c.prompt).toContain("PREVIOUS DRAFT");
      expect(c.prompt).toContain("UNIQUE-SCRIPT-CYCLE-0 words here.");
      expect(c.prompt).toContain("Slide 1 body: say it plainly");
    }

    // The approved manifest is cycle 2's draft.
    expect(result.manifest.slides[0].script).toBe("UNIQUE-SCRIPT-CYCLE-1 words here.");
    expect(result.technical).toEqual([{ category: "FIX", bullet: "fixed the frobnicator" }]);
  });

  it("throws after exhausting all attempts, carrying the final notes", async () => {
    const reject = { pass: false, notes: ["still unclear"] };
    const { runQuery, calls } = fakeRunQuery([reject, reject, reject, reject]);
    await expect(generateManifest(bundle, config, { runQuery })).rejects.toThrow(/still unclear/);
    expect(calls).toHaveLength(16); // 4 attempts × 4 passes
  });
});
