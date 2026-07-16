import React from "react";
import { Audio, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Layout } from "./Layout";
import type { Manifest } from "./types";
import { fonts, theme } from "./theme";

export const OutroSlide: React.FC<{ manifest: Manifest }> = ({ manifest }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Layout
      topLeft={`${manifest.product} · ${manifest.version}`}
      topRight="END"
      bottomLeft={manifest.domain}
      bottomRight={manifest.brand}
    >
      <Audio src={staticFile("audio/outro.wav")} />
      <div style={{ position: "absolute", left: 96, top: 280, right: 96, opacity }}>
        <div style={{ fontFamily: fonts.serif, fontStyle: "italic", fontSize: 48, color: theme.muted }}>
          Thanks for watching
        </div>
        <div
          style={{
            fontFamily: fonts.serif,
            fontSize: 150,
            fontWeight: 600,
            color: theme.ink,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            marginTop: 12,
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
            padding: "28px 56px",
            marginTop: 72,
          }}
        >
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: theme.accent }} />
          <span style={{ fontFamily: fonts.sans, fontSize: 40, fontWeight: 600, color: "#FFFFFF" }}>
            {manifest.outro.cta}
          </span>
        </div>
        <div
          style={{
            fontFamily: fonts.serif,
            fontStyle: "italic",
            fontSize: 38,
            color: theme.muted,
            marginTop: 64,
          }}
        >
          {manifest.outro.subline}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginTop: 56,
            fontFamily: fonts.sans,
            fontSize: 28,
            letterSpacing: "0.18em",
            color: theme.muted,
          }}
        >
          <div style={{ width: 48, height: 2, background: theme.muted }} />
          {manifest.domain}
        </div>
      </div>
    </Layout>
  );
};
