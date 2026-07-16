import { z } from "zod";
import { BUDGETS } from "./budgets";

export const SlideSchema = z.object({
  type: z.enum(["FEATURE", "FIX", "IMPROVEMENT"]),
  title: z.string().min(1).max(BUDGETS.titleMaxChars),
  body: z.string().min(1).max(BUDGETS.bodyMaxChars),
  script: z.string().min(1),
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
    cta: z.string().min(1),
    subline: z.string().min(1),
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
