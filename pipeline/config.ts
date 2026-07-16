import { z } from "zod";

const RepoConfigSchema = z.object({
  product: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  version: z.literal("date").optional(),
  ttsModel: z.string().min(1).optional(),
  voice: z.string().min(1).optional(),
});

export type RepoConfig = {
  product: string;
  domain: string;
  brand: string;
  version: "date";
  ttsModel: string;
  voice: string;
};

export function loadRepoConfig(json: unknown, repoName: string): RepoConfig {
  const overrides = json === undefined ? {} : RepoConfigSchema.parse(json);
  return {
    product: overrides.product ?? repoName,
    domain: overrides.domain ?? `github.com/${repoName}`,
    brand: overrides.brand ?? repoName.toUpperCase(),
    version: "date",
    ttsModel: overrides.ttsModel ?? "gemini-3.1-flash-tts-preview",
    voice: overrides.voice ?? "Charon",
  };
}

export const dateVersion = (d: Date) =>
  `v${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
