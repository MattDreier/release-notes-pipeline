import { loadFont as loadLora } from "@remotion/google-fonts/Lora";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const lora = loadLora();
const inter = loadInter();
const mono = loadMono();

// Dark editorial palette — derived from the product's OKLCH design tokens
// (.dark block), converted to sRGB hex. Warm dark greys, not pure black;
// the accent is the product's lime primary.
export const theme = {
  bg: "#262624", // --background
  accent: "#C6EEA9", // --primary (lime)
  ink: "#E5E5E2", // --popover-foreground — headline-bright, not stark white
  muted: "#B7B5A9", // --muted-foreground
  hairline: "#3E3E38", // --border
  cardSurface: "#30302E", // --popover — one step above bg for card layers
} as const;

export const fonts = {
  serif: lora.fontFamily,
  sans: inter.fontFamily,
  mono: mono.fontFamily,
} as const;

// Category dot colors — the product's chart/status hues, all legible on dark.
export const categoryColors: Record<string, string> = {
  FEATURE: "#C6EEA9", // primary lime
  IMPROVEMENT: "#BBEBEB", // cyan (chart-5)
  FIX: "#F7DC69", // amber (chart-4)
  "BREAKING CHANGE": "#BF4D43", // destructive red
};

// Card chrome shared by code/comparison/grid templates. On a dark ground the
// border carries the edge; the shadow is a whisper of depth, not the outline.
export const card = {
  background: theme.cardSurface,
  border: `1px solid ${theme.hairline}`,
  borderRadius: 18,
  boxShadow: "0 12px 40px rgba(0, 0, 0, 0.35)",
} as const;

// Grid pill tint — recessed dark chip with bright text (--accent tokens).
export const pill = { background: "#1A1915", color: "#F5F4EE" } as const;

// Code-card label — cyan reads as "terminal" against the dark card.
export const codeLabel = "#BBEBEB" as const;

export type Timing = {
  coverFrames: number;
  slideFrames: number[];
  outroFrames: number;
};
