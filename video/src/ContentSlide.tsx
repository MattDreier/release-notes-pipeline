import React from "react";
import { Audio, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Layout } from "./Layout";
import { SafeAreaGuard } from "./SafeAreaGuard";
import { contentBodySize, contentTitleSize } from "./sizing";
import type { Manifest } from "./types";
import { fonts, theme } from "./theme";

export const ContentSlide: React.FC<{ manifest: Manifest; index: number }> = ({ manifest, index }) => {
  const frame = useCurrentFrame();
  const slide = manifest.slides[index];
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleSize = contentTitleSize(slide.title);
  const body = contentBodySize(slide.body);

  return (
    <Layout
      topLeft={`${manifest.product} · ${manifest.version}`}
      topRight={`§ ${String(index + 1).padStart(2, "0")}`}
      bottomLeft={manifest.domain}
      bottomRight={manifest.brand}
    >
      <Audio src={staticFile(`audio/slide${index + 1}.wav`)} />
      <SafeAreaGuard slide={`content ${index + 1}`} />
      <div data-safe style={{ position: "absolute", left: 96, top: 180, right: 96, opacity }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: theme.accent }} />
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
          }}
        >
          {slide.title}
        </div>
        <div
          style={{
            fontFamily: fonts.serif,
            fontStyle: "italic",
            fontSize: body.fontSize,
            color: theme.muted,
            lineHeight: body.lineHeight,
            marginTop: 56,
            maxWidth: 1500,
          }}
        >
          {slide.body}
        </div>
      </div>
    </Layout>
  );
};
