import React from "react";
import { Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Layout } from "./Layout";
import type { Manifest } from "./types";
import { fonts, theme } from "./theme";

const POP_FRAME = 30;
const TOC_START = 45;
const TOC_STAGGER = 8;

export const CoverSlide: React.FC<{ manifest: Manifest }> = ({ manifest }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const circleScale = frame < POP_FRAME ? 0 : spring({ frame: frame - POP_FRAME, fps, config: { damping: 12 } });
  const versionColor = frame < POP_FRAME ? theme.versionGhost : theme.ink;

  return (
    <Layout
      topLeft={`${manifest.product} · ${manifest.version}`}
      topRight="COVER"
      bottomLeft={manifest.domain}
      bottomRight={manifest.brand}
    >
      <Audio src={staticFile("audio/cover.wav")} />
      <div style={{ position: "absolute", left: 96, top: 300 }}>
        <div style={{ fontFamily: fonts.serif, fontStyle: "italic", fontSize: 54, color: theme.muted }}>
          Release Notes
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 48, marginTop: 8 }}>
          <span
            style={{
              fontFamily: fonts.serif,
              fontSize: 230,
              fontWeight: 600,
              color: versionColor,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            {manifest.version}
          </span>
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: "50%",
              background: theme.accent,
              transform: `scale(${circleScale})`,
            }}
          />
        </div>
      </div>
      <div style={{ position: "absolute", left: 96, bottom: 200 }}>
        {manifest.slides.map((slide, i) => {
          const start = TOC_START + i * TOC_STAGGER;
          const opacity = interpolate(frame, [start, start + 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const y = interpolate(frame, [start, start + 10], [18, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 36,
                marginTop: i === 0 ? 0 : 22,
                opacity,
                transform: `translateY(${y}px)`,
              }}
            >
              <span style={{ fontFamily: fonts.sans, fontSize: 24, color: theme.muted }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ fontFamily: fonts.serif, fontSize: 42, color: theme.ink }}>{slide.title}</span>
            </div>
          );
        })}
      </div>
    </Layout>
  );
};
