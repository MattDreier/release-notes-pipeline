import { describe, expect, it } from "vitest";
import { validateDemo, DEMO_BUDGETS } from "./demo";

const source = { repo: "MattDreier/dispatch-schedule-ui", pr: 266, issue: 261 };
const env = {
  baseUrl: "${DEMO_BASE_URL}",
  auth: "storageState",
  viewport: { width: 1440, height: 900, dpr: 2 },
  emulate: { timezone: "America/New_York" },
  seed: { dataset: "demo:two-zone-roofing", jobs: [{ tech: "Marcus Chen" }] },
};

// Concept 2 — the real timezone example, in canonical (camelCase) form.
const settingsDemo = {
  kind: "settings-demo",
  story: { slug: "universal-local-timezone", title: "Universal vs Local time mode", source },
  env,
  scenario: {
    state: [{ action: "goto", url: "/" }],
    focus: {
      subjects: [{ text: "Hoffman Roof Inspection" }, { text: "Donnelly Roof Inspection" }],
      blur: [{ css: ".job-block__customer" }],
    },
  },
  compare: {
    label: "Time zone mode",
    setting: {
      key: "timezoneMode",
      states: [
        {
          value: "local",
          label: "Local",
          apply: { localStorage: { timezoneMode: "local" }, reload: true },
          expect: [{ subject: "Donnelly Roof Inspection", text: "11:00am - 12:30pm" }],
          capture: { shot: "mode-local" },
        },
        {
          value: "universal",
          label: "Universal",
          apply: { localStorage: { timezoneMode: "universal" }, reload: true },
          expect: [{ subject: "Donnelly Roof Inspection", text: "10:00am - 11:30am CDT" }],
          assert: {
            alignedLeft: [
              { text: "Hoffman Roof Inspection" },
              { text: "Donnelly Roof Inspection" },
            ],
          },
          capture: { shot: "mode-universal" },
        },
      ],
    },
    showToggle: {
      open: [
        { action: "click", target: { role: "button", name: "Account menu" } },
        { action: "click", target: { role: "menuitem", name: "Settings" } },
      ],
      control: { role: "radiogroup", name: "Time zone mode" },
      capture: { gif: "toggle", seconds: 3 },
    },
  },
  narration: { voice: "default", script: "Same two roof inspections..." },
};

// Concept 1 — same scenario, varied axis is the build.
const beforeAfter = {
  kind: "before-after",
  story: { slug: "timezone-of-record", title: "Board positioning fix", source },
  env,
  scenario: { state: [{ action: "goto", url: "/" }] },
  compare: {
    states: [
      { ref: "main", label: "Before", capture: { shot: "before" } },
      { ref: "feat/261-universal-local-tz", label: "After", capture: { shot: "after" } },
    ],
  },
};

// Concept 3 — a sequence, no compare block.
const walkthrough = {
  kind: "walkthrough",
  story: { slug: "read-a-job-in-site-time", title: "Read a job in the customer's timezone", source },
  env,
  steps: [
    { action: "goto", url: "/", say: "Start on the board." },
    { action: "click", target: { role: "button", name: "Account menu" } },
    { action: "click", target: { role: "menuitem", name: "Settings" } },
    {
      action: "click",
      target: { role: "radio", name: "Universal" },
      say: "Turn on Universal.",
      capture: { gif: "toggle", seconds: 3 },
    },
    {
      action: "hover",
      target: { text: "Donnelly Roof Inspection" },
      effects: { blur: [{ css: ".job-block__customer" }] },
      capture: { shot: "tooltip" },
    },
  ],
};

describe("validateDemo — the three concepts", () => {
  it("accepts a settings-demo (Concept 2) and defaults auth/dpr/voice", () => {
    const r = validateDemo(settingsDemo);
    expect(r.ok).toBe(true);
    if (r.ok && r.demo.kind === "settings-demo") {
      expect(r.demo.compare.setting.states).toHaveLength(2);
      expect(r.demo.narration?.voice).toBe("default");
    }
  });

  it("accepts a before-after (Concept 1)", () => {
    const r = validateDemo(beforeAfter);
    expect(r.ok).toBe(true);
    if (r.ok && r.demo.kind === "before-after") {
      expect(r.demo.compare.states.map((s) => s.label)).toEqual(["Before", "After"]);
    }
  });

  it("accepts a walkthrough (Concept 3)", () => {
    const r = validateDemo(walkthrough);
    expect(r.ok).toBe(true);
    if (r.ok && r.demo.kind === "walkthrough") {
      expect(r.demo.steps).toHaveLength(5);
    }
  });
});

describe("validateDemo — rejections", () => {
  it("rejects an unknown kind", () => {
    expect(validateDemo({ ...walkthrough, kind: "screencast" }).ok).toBe(false);
  });

  it("rejects a before-after with only one build state", () => {
    const bad = { ...beforeAfter, compare: { states: [beforeAfter.compare.states[0]] } };
    expect(validateDemo(bad).ok).toBe(false);
  });

  it("rejects a settings-demo with a single state (needs a comparison)", () => {
    const one = settingsDemo.compare.setting.states[0];
    const bad = {
      ...settingsDemo,
      compare: { setting: { key: "timezoneMode", states: [one] } },
    };
    expect(validateDemo(bad).ok).toBe(false);
  });

  it("rejects a walkthrough with no steps", () => {
    expect(validateDemo({ ...walkthrough, steps: [] }).ok).toBe(false);
  });

  it("rejects a gif capture missing seconds", () => {
    const bad = {
      ...walkthrough,
      steps: [{ action: "goto", url: "/", capture: { gif: "x" } }],
    };
    expect(validateDemo(bad).ok).toBe(false);
  });

  it("rejects a capture that is both shot and gif", () => {
    const bad = {
      ...walkthrough,
      steps: [{ action: "goto", url: "/", capture: { shot: "a", gif: "b", seconds: 2 } }],
    };
    expect(validateDemo(bad).ok).toBe(false);
  });

  it("rejects a selector with a name but no role", () => {
    const bad = {
      ...walkthrough,
      steps: [{ action: "click", target: { name: "Settings" } }],
    };
    expect(validateDemo(bad).ok).toBe(false);
  });

  it("rejects a selector with no locator at all", () => {
    const bad = {
      ...walkthrough,
      steps: [{ action: "click", target: { nearText: "somewhere" } }],
    };
    expect(validateDemo(bad).ok).toBe(false);
  });

  it("rejects an unknown step action", () => {
    const bad = { ...walkthrough, steps: [{ action: "scroll", target: { text: "x" } }] };
    expect(validateDemo(bad).ok).toBe(false);
  });

  it("rejects a setting state whose apply has no mechanism", () => {
    const bad = {
      ...settingsDemo,
      compare: {
        setting: {
          key: "timezoneMode",
          states: [
            { value: "local", label: "Local", apply: { reload: true } },
            settingsDemo.compare.setting.states[1],
          ],
        },
      },
    };
    expect(validateDemo(bad).ok).toBe(false);
  });

  it("rejects a non-kebab slug", () => {
    const bad = { ...walkthrough, story: { ...walkthrough.story, slug: "Not Kebab" } };
    expect(validateDemo(bad).ok).toBe(false);
  });

  it("rejects a title past the budget", () => {
    const bad = {
      ...walkthrough,
      story: { ...walkthrough.story, title: "x".repeat(DEMO_BUDGETS.titleMaxChars + 1) },
    };
    expect(validateDemo(bad).ok).toBe(false);
  });
});
