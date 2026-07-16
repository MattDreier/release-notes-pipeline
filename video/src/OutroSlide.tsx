import React from "react";
import { Audio, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp } from "./anim";
import { Layout } from "./Layout";
import { SafeAreaGuard } from "./SafeAreaGuard";
import { outroHeadlineSize } from "./sizing";
import type { Manifest } from "./types";
import { fonts, theme } from "./theme";

export const OutroSlide: React.FC<{ manifest: Manifest }> = ({ manifest }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headlineSize = outroHeadlineSize(manifest.outro.headline);
  // The button pops with a soft spring after the headline lands.
  const buttonScale =
    frame < 26 ? 0 : spring({ frame: frame - 26, fps, config: { damping: 14, mass: 0.8 } });

  return (
    <Layout
      topLeft={`${manifest.product} · ${manifest.version}`}
      topRight="END"
      bottomLeft={manifest.domain}
      bottomRight={manifest.brand}
    >
      <Audio src={staticFile("audio/outro.wav")} />
      <SafeAreaGuard slide="outro" />
      <div data-safe style={{ position: "absolute", left: 96, top: 220, right: 96 }}>
        <div
          style={{
            fontFamily: fonts.serif,
            fontStyle: "italic",
            fontSize: 48,
            color: theme.muted,
            ...fadeUp(frame, 4, 14, 18),
          }}
        >
          Thanks for watching
        </div>
        <div
          style={{
            fontFamily: fonts.serif,
            fontSize: headlineSize,
            fontWeight: 600,
            color: theme.ink,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            marginTop: 12,
            ...fadeUp(frame, 10),
          }}
        >
          {manifest.outro.headline}
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 20,
            background: theme.ink,
            borderRadius: 999,
            padding: "26px 52px",
            marginTop: 56,
            transform: `scale(${buttonScale})`,
            transformOrigin: "left center",
          }}
        >
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: theme.accent }} />
          <span style={{ fontFamily: fonts.sans, fontSize: 38, fontWeight: 600, color: "#FFFFFF" }}>
            {manifest.outro.cta}
          </span>
        </div>
        <div
          style={{
            fontFamily: fonts.serif,
            fontStyle: "italic",
            fontSize: 38,
            color: theme.muted,
            marginTop: 48,
            ...fadeUp(frame, 36, 14, 18),
          }}
        >
          {manifest.outro.subline}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginTop: 40,
            fontFamily: fonts.sans,
            fontSize: 28,
            letterSpacing: "0.18em",
            color: theme.muted,
            ...fadeUp(frame, 44, 14, 16),
          }}
        >
          <div style={{ width: 48, height: 2, background: theme.muted, flexShrink: 0 }} />
          {manifest.domain}
        </div>
      </div>
    </Layout>
  );
};
