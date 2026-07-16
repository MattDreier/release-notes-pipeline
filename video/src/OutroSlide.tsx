import React from "react";
import { Audio, staticFile, useCurrentFrame } from "remotion";
import { fadeUp, STEP } from "./anim";
import { Layout } from "./Layout";
import { SafeAreaGuard } from "./SafeAreaGuard";
import { outroHeadlineSize } from "./sizing";
import type { Manifest } from "./types";
import { fonts, theme } from "./theme";

export const OutroSlide: React.FC<{ manifest: Manifest }> = ({ manifest }) => {
  const frame = useCurrentFrame();
  const headlineSize = outroHeadlineSize(manifest.outro.headline);
  const link = manifest.outro.link ?? manifest.domain;

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
            ...fadeUp(frame, STEP, 14, 18),
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
            // Display type: longer travel, slower settle.
            ...fadeUp(frame, STEP * 2, 24, 38),
          }}
        >
          {manifest.outro.headline}
        </div>
        {/* Deliberate quiet — the space the CTA button used to occupy. */}
        <div style={{ height: 130 }} />
        <div
          style={{
            fontFamily: fonts.serif,
            fontStyle: "italic",
            fontSize: 38,
            color: theme.muted,
            ...fadeUp(frame, STEP * 5, 16, 18),
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
            color: theme.ink,
            ...fadeUp(frame, STEP * 7, 16, 14),
          }}
        >
          <div style={{ width: 48, height: 2, background: theme.accent, flexShrink: 0 }} />
          {link}
        </div>
      </div>
    </Layout>
  );
};
