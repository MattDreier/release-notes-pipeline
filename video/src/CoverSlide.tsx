import React from "react";
import { Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeOutAtEnd, fadeUp } from "./anim";
import { Layout } from "./Layout";
import { SafeAreaGuard } from "./SafeAreaGuard";
import type { Manifest } from "./types";
import { fonts, theme } from "./theme";

// Choreography: frame 1 shows only the chrome (header/footer). "Release Notes"
// rises in first, then the ghost version number, then the circle pops as the
// version snaps to ink, then the TOC staggers in.
const LABEL_IN = 8;
const VERSION_IN = 18;
const POP_FRAME = 40;
const TOC_START = 56;
const TOC_STAGGER = 9;

export const CoverSlide: React.FC<{ manifest: Manifest; durationInFrames: number }> = ({
  manifest,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const circleScale =
    frame < POP_FRAME ? 0 : spring({ frame: frame - POP_FRAME, fps, config: { damping: 12 } });
  const versionColor = frame < POP_FRAME ? theme.versionGhost : theme.ink;
  const exit = fadeOutAtEnd(frame, durationInFrames);

  return (
    <Layout
      topLeft={`${manifest.product} · ${manifest.version}`}
      topRight="COVER"
      bottomLeft={manifest.domain}
      bottomRight={manifest.brand}
    >
      <Audio src={staticFile("audio/cover.wav")} />
      <SafeAreaGuard slide="cover" />
      <div data-safe style={{ position: "absolute", left: 96, top: 300, opacity: exit }}>
        <div
          style={{
            fontFamily: fonts.serif,
            fontStyle: "italic",
            fontSize: 54,
            color: theme.muted,
            ...fadeUp(frame, LABEL_IN),
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
            ...fadeUp(frame, VERSION_IN),
          }}
        >
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
      <div data-safe style={{ position: "absolute", left: 96, bottom: 200, opacity: exit }}>
        {manifest.slides.map((slide, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 36,
              marginTop: i === 0 ? 0 : 22,
              ...fadeUp(frame, TOC_START + i * TOC_STAGGER, 14, 20),
            }}
          >
            <span style={{ fontFamily: fonts.sans, fontSize: 24, color: theme.muted }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ fontFamily: fonts.serif, fontSize: 42, color: theme.ink }}>{slide.title}</span>
          </div>
        ))}
      </div>
    </Layout>
  );
};
