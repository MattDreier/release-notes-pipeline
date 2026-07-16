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
  it("accepts a valid manifest, defaulting layout to standard", () => {
    const r = validateManifest(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.slides[0].layout).toBe("standard");
  });

  it("requires the payload matching each layout", () => {
    const base = { ...good.slides[0] };
    // standard without body fails
    expect(validateManifest({ ...good, slides: [{ ...base, body: undefined }] }).ok).toBe(false);
    // metrics layout without metrics payload fails
    expect(validateManifest({ ...good, slides: [{ ...base, layout: "metrics" }] }).ok).toBe(false);
    // metrics with payload passes (body not needed)
    const metrics = { ...base, body: undefined, layout: "metrics", metrics: [{ value: "-7 MB", label: "binary size" }] };
    expect(validateManifest({ ...good, slides: [metrics] }).ok).toBe(true);
    // grid needs 2-6 items
    const grid = { ...base, body: undefined, layout: "grid", gridItems: [{ tag: "search", description: "d" }] };
    expect(validateManifest({ ...good, slides: [grid] }).ok).toBe(false);
    // comparison needs beforeAfter
    const cmp = {
      ...base,
      body: undefined,
      layout: "comparison",
      beforeAfter: { before: "images/b.png", after: "images/a.png" },
    };
    const r = validateManifest({ ...good, slides: [cmp] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.slides[0].beforeAfter?.beforeLabel).toBe("BEFORE");
  });

  it("accepts BREAKING CHANGE as a category", () => {
    expect(validateManifest({ ...good, slides: [{ ...good.slides[0], type: "BREAKING CHANGE" }] }).ok).toBe(true);
  });

  it("rejects unknown slide types", () => {
    const bad = { ...good, slides: [{ ...good.slides[0], type: "CHORE" }] };
    const r = validateManifest(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("slides");
  });

  it("rejects zero slides and more than six slides", () => {
    expect(validateManifest({ ...good, slides: [] }).ok).toBe(false);
    expect(validateManifest({ ...good, slides: Array(7).fill(good.slides[0]) }).ok).toBe(false);
    expect(validateManifest({ ...good, slides: Array(6).fill(good.slides[0]) }).ok).toBe(true);
  });

  it("rejects over-budget title/body", () => {
    expect(validateManifest({ ...good, slides: [{ ...good.slides[0], title: "x".repeat(49) }] }).ok).toBe(false);
    expect(validateManifest({ ...good, slides: [{ ...good.slides[0], body: "x".repeat(321) }] }).ok).toBe(false);
  });
});
