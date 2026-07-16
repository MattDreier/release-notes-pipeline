import { z } from "zod";
import { BUDGETS } from "./budgets";

export const CATEGORIES = ["FEATURE", "IMPROVEMENT", "FIX", "BREAKING CHANGE"] as const;
export const LAYOUTS = ["standard", "metrics", "code", "comparison", "grid"] as const;

export const SlideSchema = z
  .object({
    type: z.enum(CATEGORIES),
    layout: z.enum(LAYOUTS).default("standard"),
    title: z.string().min(1).max(BUDGETS.titleMaxChars),
    script: z.string().min(1),
    // Layout payloads — exactly one is required, matching `layout`.
    body: z.string().min(1).max(BUDGETS.bodyMaxChars).optional(),
    metrics: z
      .array(z.object({ value: z.string().min(1).max(10), label: z.string().min(1).max(30) }))
      .min(1)
      .max(3)
      .optional(),
    code: z
      .object({
        label: z.string().min(1).max(20).default("COMMAND"),
        lines: z.array(z.string().min(1).max(64)).min(1).max(6),
      })
      .optional(),
    beforeAfter: z
      .object({
        before: z.string().min(1), // URL (agent output) or public-relative path (post-download)
        after: z.string().min(1),
        beforeLabel: z.string().max(24).default("BEFORE"),
        afterLabel: z.string().max(24).default("AFTER"),
      })
      .optional(),
    gridItems: z
      .array(z.object({ tag: z.string().min(1).max(14), description: z.string().min(1).max(110) }))
      .min(2)
      .max(6)
      .optional(),
  })
  .superRefine((slide, ctx) => {
    const required: Record<(typeof LAYOUTS)[number], keyof typeof slide> = {
      standard: "body",
      metrics: "metrics",
      code: "code",
      comparison: "beforeAfter",
      grid: "gridItems",
    };
    const need = required[slide.layout];
    if (slide[need] === undefined) {
      ctx.addIssue({
        code: "custom",
        path: [need],
        message: `layout "${slide.layout}" requires the "${need}" payload`,
      });
    }
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
    cta: z.string().min(1).optional(), // legacy — the outro no longer renders a button
    subline: z.string().min(1),
    // GitHub repo URL shown on the outro's link line (falls back to `domain`).
    link: z.string().min(1).optional(),
    script: z.string().min(1),
  }),
});

export type Slide = z.infer<typeof SlideSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

export function validateManifest(
  data: unknown,
): { ok: true; manifest: Manifest } | { ok: false; error: string } {
  const r = ManifestSchema.safeParse(data);
  if (r.success) return { ok: true, manifest: r.data };
  return {
    ok: false,
    error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}
