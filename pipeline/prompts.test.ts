import { describe, expect, it } from "vitest";
import { copyPrompt, criticPrompt, editorPrompt, voicePrompt } from "./prompts";
import type { PrBundle } from "./gather";
import type { RepoConfig } from "./config";

const bundle: PrBundle = {
  repo: "MattDreier/dispatch-schedule-ui",
  number: 207,
  title: "feat: map routing",
  body: "Adds routing",
  labels: ["feature"],
  mergedAt: "2026-07-15T00:00:00Z",
  diff: "diff --git a/x b/x\n+code",
  images: ["https://github.com/user-attachments/assets/before.png"],
  issues: [],
  configJson: undefined,
  changelog: null,
};

const bundleWithIssue: PrBundle = {
  ...bundle,
  issues: [
    {
      number: 260,
      title: "Multi-timezone scheduling",
      body: "Jobs should display in the customer's local time zone.",
    },
  ],
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
  it("editor prompt embeds diff, PR metadata, layouts, images, and budgets", () => {
    const p = editorPrompt(bundle, config);
    expect(p).toContain("feat: map routing");
    expect(p).toContain("+code");
    expect(p).toContain("1-6"); // slide count constraint stated
    expect(p).toContain("There is NO minimum"); // no padding to a floor
    expect(p).toContain("under 55 seconds"); // the one hard ceiling stated
    expect(p).toContain("~6 SECONDS"); // per-slide pacing target stated
    expect(p).toContain("effective communication outranks pacing"); // clarity supremacy stated
    expect(p).toContain("NON-TECHNICAL"); // audience stated
    for (const layout of ["standard", "metrics", "code", "comparison", "grid"]) {
      expect(p).toContain(`"${layout}"`);
    }
    expect(p).toContain("before.png"); // available screenshots listed
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

  it("embeds linked issues as motivation with the diff-authority firewall", () => {
    for (const p of [
      editorPrompt(bundleWithIssue, config),
      copyPrompt({ slides: [] }, bundleWithIssue),
      criticPrompt({}, bundleWithIssue),
    ]) {
      expect(p).toContain("Issue #260: Multi-timezone scheduling");
      expect(p).toContain("customer's local time zone");
      expect(p).toContain("SOLE authority"); // issues motivate; the diff decides what shipped
    }
  });

  it("omits the linked-issues section when the PR closes no issues", () => {
    expect(editorPrompt(bundle, config)).not.toContain("Linked issues");
  });

  it("states the confidence-protecting tone rules in every writing pass and the critic", () => {
    for (const p of [
      editorPrompt(bundle, config),
      copyPrompt({ slides: [] }, bundle),
      voicePrompt({}, { slides: [{ targetSeconds: 6 }] }),
      criticPrompt({}, bundle),
    ]) {
      expect(p).toContain('"finally"'); // relief words banned by name
      expect(p).toContain("never a dedicated slide"); // bugs don't get their own slide
    }
  });

  it("critic checks issue overreach and confidence framing", () => {
    const p = criticPrompt({}, bundleWithIssue);
    expect(p).toContain("issues often span multiple PRs");
    expect(p).toContain("MORE confident");
  });
});
