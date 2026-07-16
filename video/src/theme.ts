import { loadFont as loadLora } from "@remotion/google-fonts/Lora";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const lora = loadLora();
const inter = loadInter();
const mono = loadMono();

export const theme = {
  bg: "#FAF9F6",
  accent: "#D05A3F",
  ink: "#191919",
  muted: "#8A8A8A",
  hairline: "#E5E2DC",
  versionGhost: "#C9C5BD",
} as const;

export const fonts = {
  serif: lora.fontFamily,
  sans: inter.fontFamily,
  mono: mono.fontFamily,
} as const;

// Category dot colors — strict design-system mapping.
export const categoryColors: Record<string, string> = {
  FEATURE: "#D05A3F", // terracotta
  IMPROVEMENT: "#5C768D", // slate blue
  FIX: "#D49B8D", // rose gold
  "BREAKING CHANGE": "#2E2E2E", // deep charcoal
};

// Card chrome shared by code/comparison/grid templates.
export const card = {
  background: "#FFFFFF",
  borderRadius: 18,
  boxShadow: "0 12px 40px rgba(25, 25, 25, 0.07)",
} as const;

// Grid pill tint (rose family, per the reference frames).
export const pill = { background: "#F6DDD5", color: "#C25E43" } as const;

export type Timing = {
  coverFrames: number;
  slideFrames: number[];
  outroFrames: number;
};
