import React from "react";
import { Audio, staticFile, useCurrentFrame } from "remotion";
import { fadeOutAtEnd, fadeUp } from "./anim";
import { Layout } from "./Layout";
import { SafeAreaGuard } from "./SafeAreaGuard";
import { contentTitleSize } from "./sizing";
import { CodeBody, ComparisonBody, GridBody, MetricsBody, StandardBody } from "./templates";
import type { Manifest } from "./types";
import { categoryColors, fonts, theme } from "./theme";

const BODIES = {
  standard: StandardBody,
  metrics: MetricsBody,
  code: CodeBody,
  comparison: ComparisonBody,
  grid: GridBody,
} as const;

export const ContentSlide: React.FC<{
  manifest: Manifest;
  index: number;
  durationInFrames: number;
}> = ({ manifest, index, durationInFrames }) => {
  const frame = useCurrentFrame();
  const slide = manifest.slides[index];
  const exit = fadeOutAtEnd(frame, durationInFrames);
  // Card-based layouts need vertical room — cap their title size.
  const titleSize =
    slide.layout === "standard" ? contentTitleSize(slide.title) : Math.min(contentTitleSize(slide.title), 110);
  const Body = BODIES[slide.layout];

  return (
    <Layout
      topLeft={`${manifest.product} · ${manifest.version}`}
      topRight={`§ ${String(index + 1).padStart(2, "0")}`}
      bottomLeft={manifest.domain}
      bottomRight={manifest.brand}
    >
      <Audio src={staticFile(`audio/slide${index + 1}.wav`)} />
      <SafeAreaGuard slide={`content ${index + 1}`} />
      <div data-safe style={{ position: "absolute", left: 96, top: 180, right: 96, opacity: exit }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, ...fadeUp(frame, 4, 14, 18) }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: categoryColors[slide.type] ?? theme.accent,
            }}
          />
          <span
            style={{
              fontFamily: fonts.sans,
              fontSize: 26,
              letterSpacing: "0.22em",
              color: theme.ink,
              fontWeight: 600,
            }}
          >
            {slide.type}
          </span>
        </div>
        <div
          style={{
            fontFamily: fonts.serif,
            fontSize: titleSize,
            fontWeight: 600,
            color: theme.ink,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            marginTop: 44,
            maxWidth: 1500,
            ...fadeUp(frame, 12),
          }}
        >
          {slide.title}
        </div>
        <Body slide={slide} />
      </div>
    </Layout>
  );
};
