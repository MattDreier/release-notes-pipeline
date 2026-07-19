import { z } from "zod";

/**
 * Schema for demo-pipeline source-of-truth files — the sibling of manifest.ts
 * (which serves the release/changelog pipeline). A demo is one of THREE kinds:
 *
 *   before-after  — Concept 1. A comparison whose varied axis is the BUILD
 *                   (base ref vs head ref). Illustrates a UI change / bug fix.
 *   settings-demo — Concept 2. A comparison whose varied axis is a SETTING in
 *                   ONE build (e.g. timezoneMode local vs universal, colorblind
 *                   mode off vs on).
 *   walkthrough   — Concept 3. A SEQUENCE of steps demonstrating how to do
 *                   something (Guideflow-style how-to / non-interactive training).
 *
 * before-after and settings-demo share the comparison shape: a fixed `scenario`
 * state plus a `compare` block naming the states (the scenario is the constant,
 * `compare` is the one independent variable). Both pair into the beforeAfter
 * layout — only labels and capture strategy differ. walkthrough instead carries
 * an ordered `steps` array.
 *
 * This camelCase form is the canonical contract (what the scenario-author agent
 * emits as structured output). The *.scenario.yaml surface files are a friendlier
 * rendering of the same shape.
 */

export const DEMO_KINDS = ["before-after", "settings-demo", "walkthrough"] as const;

export const DEMO_BUDGETS = {
  titleMaxChars: 64,
  labelMaxChars: 24, // state captions (Before/After, Local/Universal)
  narrationMaxChars: 700,
  calloutMaxChars: 80,
  maxSteps: 24, // walkthrough guard
  minCompareStates: 2, // a comparison needs at least two states
} as const;

/* ---------- selectors: semantic-first (target repos ship no data-testid) ----- */

export const SelectorSchema = z
  .object({
    role: z.string().min(1).optional(), // ARIA role
    name: z.string().min(1).optional(), // accessible name; pairs with role
    text: z.string().min(1).optional(), // visible text
    css: z.string().min(1).optional(), // fallback only
    nearText: z.string().min(1).optional(), // disambiguator when text/role repeats
  })
  .refine((s) => Boolean(s.role || s.text || s.css), {
    message: "a selector needs at least one of: role, text, css",
  })
  .refine((s) => !s.name || Boolean(s.role), {
    message: "selector `name` must be paired with `role`",
  });
export type Selector = z.infer<typeof SelectorSchema>;

/* ---------- captures --------------------------------------------------------- */

export const CaptureSchema = z
  .object({
    shot: z.string().min(1).optional(), // still-frame id
    gif: z.string().min(1).optional(), // clip id
    seconds: z.number().positive().max(20).optional(),
  })
  .refine((c) => Boolean(c.shot) !== Boolean(c.gif), {
    message: "a capture is exactly one of: shot | gif",
  })
  .refine((c) => !c.gif || c.seconds !== undefined, {
    message: "a gif capture needs `seconds`",
  });
export type Capture = z.infer<typeof CaptureSchema>;

/* ---------- authored effects: intent the event log can't infer --------------- */
/* (cursor/zoom/settle are DERIVED automatically; these are the authored belt.) */

export const EffectsSchema = z.object({
  spotlight: z.array(SelectorSchema).min(1).optional(),
  blur: z.array(SelectorSchema).min(1).optional(),
  callout: z
    .array(
      z.object({
        target: SelectorSchema,
        note: z.string().min(1).max(DEMO_BUDGETS.calloutMaxChars),
      }),
    )
    .min(1)
    .optional(),
});
export type Effects = z.infer<typeof EffectsSchema>;

/* ---------- steps: the action vocabulary ------------------------------------- */
/* NOTE: discriminatedUnion members must be plain objects (no .refine), so each
 * action stays a bare z.object; cross-field checks live in the runner. */

const stepAnnotations = {
  say: z.string().min(1).optional(), // per-step narration
  effects: EffectsSchema.optional(),
  capture: CaptureSchema.optional(),
  note: z.string().min(1).optional(), // human label for the step
};

export const StepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("goto"), url: z.string().min(1), ...stepAnnotations }),
  z.object({ action: z.literal("click"), target: SelectorSchema, ...stepAnnotations }),
  z.object({ action: z.literal("hover"), target: SelectorSchema, ...stepAnnotations }),
  z.object({
    action: z.literal("type"),
    target: SelectorSchema,
    text: z.string(),
    ...stepAnnotations,
  }),
  z.object({
    action: z.literal("select"),
    target: SelectorSchema, // the control (e.g. combobox)
    option: SelectorSchema, // the option to pick
    ...stepAnnotations,
  }),
  z.object({
    action: z.literal("drag"),
    from: SelectorSchema,
    to: SelectorSchema,
    ...stepAnnotations,
  }),
  z.object({
    action: z.literal("expect"), // an assertion mid-scenario
    target: SelectorSchema.optional(),
    role: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    ...stepAnnotations,
  }),
  z.object({
    action: z.literal("wait"),
    ms: z.number().int().positive().max(60000),
    ...stepAnnotations,
  }),
]);
export type Step = z.infer<typeof StepSchema>;

/* ---------- shared metadata -------------------------------------------------- */

export const StorySchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be kebab-case"),
  title: z.string().min(1).max(DEMO_BUDGETS.titleMaxChars),
  source: z.object({
    repo: z.string().min(1),
    pr: z.number().int().positive().optional(),
    issue: z.number().int().positive().optional(),
  }),
  persona: z.string().min(1).optional(),
  value: z.string().min(1).optional(),
});

const EmulateSchema = z
  .object({
    timezone: z.string().min(1).optional(), // IANA zone, e.g. America/Chicago
    colorScheme: z.enum(["light", "dark"]).optional(),
    locale: z.string().min(1).optional(),
  })
  .optional();

export const EnvSchema = z.object({
  baseUrl: z.string().min(1), // may hold a ${VAR} placeholder resolved at run time
  auth: z.enum(["none", "storageState"]).default("none"),
  viewport: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      dpr: z.number().positive().max(4).default(1),
    })
    .optional(),
  emulate: EmulateSchema,
  seed: z.record(z.string(), z.unknown()).optional(), // app-specific seed payload
});

export const NarrationSchema = z.object({
  voice: z.string().min(1).default("default"),
  script: z.string().min(1).max(DEMO_BUDGETS.narrationMaxChars).optional(),
});

/* ---------- comparison: the fixed scenario + the varied axis ----------------- */

export const ScenarioSchema = z.object({
  state: z.array(StepSchema).min(1), // the constant every frame is shot from
  focus: z
    .object({
      subjects: z.array(SelectorSchema).min(1).optional(),
      blur: z.array(SelectorSchema).min(1).optional(),
    })
    .optional(),
});

const ExpectationSchema = z
  .object({
    subject: z.string().min(1).optional(), // shorthand: match by visible text
    target: SelectorSchema.optional(),
    text: z.string().min(1),
  })
  .refine((e) => Boolean(e.subject || e.target), {
    message: "an expectation needs `subject` or `target`",
  });

const AssertSchema = z.object({
  alignedLeft: z.array(SelectorSchema).min(2).optional(), // left edges align (event-log targetBox.x)
  alignedTop: z.array(SelectorSchema).min(2).optional(),
});

const ApplySchema = z
  .object({
    localStorage: z.record(z.string(), z.string()).optional(),
    url: z.string().min(1).optional(),
    emulate: EmulateSchema,
    reload: z.boolean().default(false),
  })
  .refine((a) => Boolean(a.localStorage || a.url || a.emulate), {
    message: "apply needs a mechanism: localStorage | url | emulate",
  });

export const VersionStateSchema = z.object({
  ref: z.string().min(1), // git ref to deploy & shoot
  label: z.string().min(1).max(DEMO_BUDGETS.labelMaxChars),
  capture: CaptureSchema.optional(),
});

export const SettingStateSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1).max(DEMO_BUDGETS.labelMaxChars),
  apply: ApplySchema,
  expect: z.array(ExpectationSchema).optional(),
  assert: AssertSchema.optional(),
  capture: CaptureSchema.optional(),
});

export const CompareVersionSchema = z.object({
  label: z.string().min(1).optional(),
  states: z.array(VersionStateSchema).length(2), // base vs head
});

export const CompareSettingSchema = z.object({
  label: z.string().min(1).optional(),
  setting: z.object({
    key: z.string().min(1),
    states: z.array(SettingStateSchema).min(DEMO_BUDGETS.minCompareStates),
  }),
  showToggle: z
    .object({
      open: z.array(StepSchema).min(1), // how to reach the control on screen
      control: SelectorSchema,
      capture: CaptureSchema.optional(),
    })
    .optional(),
});

/* ---------- the three demo kinds --------------------------------------------- */

const demoBase = {
  story: StorySchema,
  env: EnvSchema,
  narration: NarrationSchema.optional(),
};

export const BeforeAfterDemoSchema = z.object({
  kind: z.literal("before-after"),
  ...demoBase,
  scenario: ScenarioSchema,
  compare: CompareVersionSchema,
});

export const SettingsDemoSchema = z.object({
  kind: z.literal("settings-demo"),
  ...demoBase,
  scenario: ScenarioSchema,
  compare: CompareSettingSchema,
});

export const WalkthroughDemoSchema = z.object({
  kind: z.literal("walkthrough"),
  ...demoBase,
  steps: z.array(StepSchema).min(1).max(DEMO_BUDGETS.maxSteps),
});

export const DemoSchema = z.discriminatedUnion("kind", [
  BeforeAfterDemoSchema,
  SettingsDemoSchema,
  WalkthroughDemoSchema,
]);

export type Demo = z.infer<typeof DemoSchema>;
export type BeforeAfterDemo = z.infer<typeof BeforeAfterDemoSchema>;
export type SettingsDemo = z.infer<typeof SettingsDemoSchema>;
export type WalkthroughDemo = z.infer<typeof WalkthroughDemoSchema>;

export function validateDemo(
  data: unknown,
): { ok: true; demo: Demo } | { ok: false; error: string } {
  const r = DemoSchema.safeParse(data);
  if (r.success) return { ok: true, demo: r.data };
  return {
    ok: false,
    error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}
