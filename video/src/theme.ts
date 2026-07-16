import { loadFont as loadLora } from "@remotion/google-fonts/Lora";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const lora = loadLora();
const inter = loadInter();

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
} as const;

export type Timing = {
  coverFrames: number;
  slideFrames: number[];
  outroFrames: number;
};
