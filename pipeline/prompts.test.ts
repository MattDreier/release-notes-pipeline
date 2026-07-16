import { describe, expect, it } from "vitest";
import { copyPrompt, criticPrompt, editorPrompt, voicePrompt } from "./prompts";
import type { PrBundle } from "./gather";
import type { RepoConfig } from "./config";

const bundle: PrBundle = {
  number: 207,
  title: "feat: map routing",
  body: "Adds routing",
  labels: ["feature"],
  mergedAt: "2026-07-15T00:00:00Z",
  diff: "diff --git a/x b/x\n+code",
  configJson: undefined,
};

const config: RepoConfig = {
  product: "Dispatch",
  domain: "d.com",
  brand: "MPOWR",
  version: "date",
  ttsModel: "m",
  voice: "v",
};

describe("prompt builders", () => {
  it("editor prompt embeds diff, PR metadata, and slide/runtime budgets", () => {
    const p = editorPrompt(bundle, config);
    expect(p).toContain("feat: map routing");
    expect(p).toContain("+code");
    expect(p).toContain("1-3"); // slide count constraint stated
    expect(p).toContain("28"); // runtime budget stated
  });

  it("copy prompt states hard character budgets", () => {
    const p = copyPrompt({ slides: [] }, bundle);
    expect(p).toContain("48");
    expect(p).toContain("320");
  });

  it("voice prompt states words-per-slide targets", () => {
    expect(voicePrompt({}, { slides: [{ targetSeconds: 12 }] })).toContain("150");
  });

  it("critic prompt includes the diff for grounding", () => {
    expect(criticPrompt({}, bundle)).toContain("+code");
  });
});
