import { describe, expect, it } from "vitest";
import { validateManifest } from "./manifest";

const good = {
  product: "Dispatch",
  version: "v2026.7.15",
  pr: 207,
  domain: "DISPATCH.SOLARINBOUND.COM",
  brand: "MPOWR",
  cover: { script: "Dispatch release notes for July fifteenth." },
  slides: [
    {
      type: "FEATURE",
      title: "Map Routing",
      body: "Routes now render on the map.",
      script: "Routes now render directly on the dispatch map.",
    },
  ],
  outro: {
    headline: "Dispatch News",
    cta: "Subscribe",
    subline: "Full changelog at the link below.",
    script: "Thanks for watching.",
  },
};

describe("validateManifest", () => {
  it("accepts a valid manifest", () => {
    expect(validateManifest(good)).toEqual({ ok: true, manifest: good });
  });

  it("rejects unknown slide types", () => {
    const bad = { ...good, slides: [{ ...good.slides[0], type: "CHORE" }] };
    const r = validateManifest(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("slides");
  });

  it("rejects zero slides and more than three slides", () => {
    expect(validateManifest({ ...good, slides: [] }).ok).toBe(false);
    expect(validateManifest({ ...good, slides: Array(4).fill(good.slides[0]) }).ok).toBe(false);
  });

  it("rejects over-budget title/body", () => {
    expect(validateManifest({ ...good, slides: [{ ...good.slides[0], title: "x".repeat(49) }] }).ok).toBe(false);
    expect(validateManifest({ ...good, slides: [{ ...good.slides[0], body: "x".repeat(321) }] }).ok).toBe(false);
  });
});
