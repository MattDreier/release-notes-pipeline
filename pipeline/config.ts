import { z } from "zod";

const RepoConfigSchema = z.object({
  product: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  version: z.enum(["semver", "date"]).optional(),
  ttsModel: z.string().min(1).optional(),
  voice: z.string().min(1).optional(),
});

export type RepoConfig = {
  product: string;
  domain: string;
  brand: string;
  version: "semver" | "date";
  ttsModel: string;
  voice: string;
};

export function loadRepoConfig(json: unknown, repoName: string): RepoConfig {
  const overrides = json === undefined ? {} : RepoConfigSchema.parse(json);
  return {
    product: overrides.product ?? repoName,
    domain: overrides.domain ?? `github.com/${repoName}`,
    brand: overrides.brand ?? "Matt Dreier",
    // Semver (bumped from each release's own classified contents) is the
    // default; "date" is the legacy scheme and collides when two PRs merge
    // the same day — that collision once silently replaced a RELEASE-NOTES
    // section, since the upsert keys on the heading line.
    version: overrides.version ?? "semver",
    ttsModel: overrides.ttsModel ?? "gemini-3.1-flash-tts-preview",
    voice: overrides.voice ?? "Iapetus",
  };
}

export const dateVersion = (d: Date) =>
  `v${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
