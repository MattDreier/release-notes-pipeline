import React from "react";
import { Audio, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { exitStyle, fadeUp, STEP } from "./anim";
import { Layout } from "./Layout";
import { SafeAreaGuard } from "./SafeAreaGuard";
import type { Manifest } from "./types";
import { fonts, theme } from "./theme";

// Choreography (rhythm grid of 6): frame 1 shows only the chrome. The label
// rises in, the version follows in its FINAL color (no ghost→ink snap — big
// type entering once, heavily, reads as intentional; a color change reads as
// a glitch), the circle pop is the slide's single spring accent, then the
// TOC staggers in.
const LABEL_IN = STEP; // 6
const VERSION_IN = STEP * 2; // 12
const POP_FRAME = STEP * 6; // 36
const TOC_START = STEP * 8; // 48
const TOC_STAGGER = STEP + 2; // 8

export const CoverSlide: React.FC<{ manifest: Manifest; durationInFrames: number }> = ({
  manifest,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const circleScale =
    frame < POP_FRAME ? 0 : spring({ frame: frame - POP_FRAME, fps, config: { damping: 12 } });
  const exit = exitStyle(frame, durationInFrames);

  return (
    <Layout
      topLeft={`${manifest.product} · ${manifest.version}`}
      topRight="COVER"
      bottomLeft={manifest.domain}
      bottomRight={manifest.brand}
    >
      <Audio src={staticFile("audio/cover.wav")} />
      <SafeAreaGuard slide="cover" />
      {/* One flex column between the hairlines: version block up top, TOC pinned
          to the bottom. space-between absorbs any slide count without overlap. */}
      <div
        data-safe
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          top: 190,
          bottom: 180,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          ...exit,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: fonts.serif,
              fontStyle: "italic",
              fontSize: 54,
              color: theme.muted,
              ...fadeUp(frame, LABEL_IN, 16, 22),
            }}
          >
            Release Notes
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 48,
              marginTop: 8,
              // Mass-proportional: display-size type travels further, settles slower.
              ...fadeUp(frame, VERSION_IN, 26, 44),
            }}
          >
            <span
              style={{
                fontFamily: fonts.serif,
                fontSize: manifest.slides.length > 3 ? 190 : 230,
                fontWeight: 600,
                color: theme.ink,
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
            >
              {manifest.version}
            </span>
            <div
              style={{
                width: manifest.slides.length > 3 ? 132 : 160,
                height: manifest.slides.length > 3 ? 132 : 160,
                borderRadius: "50%",
                background: theme.accent,
                transform: `scale(${circleScale})`,
              }}
            />
          </div>
        </div>
        <div>
          {manifest.slides.map((slide, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 36,
                marginTop: i === 0 ? 0 : manifest.slides.length > 3 ? 16 : 22,
                ...fadeUp(frame, TOC_START + i * TOC_STAGGER, 14, 16),
              }}
            >
              <span style={{ fontFamily: fonts.sans, fontSize: 24, color: theme.muted }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                style={{
                  fontFamily: fonts.serif,
                  fontSize: manifest.slides.length > 3 ? 36 : 42,
                  color: theme.ink,
                }}
              >
                {slide.title}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
};
