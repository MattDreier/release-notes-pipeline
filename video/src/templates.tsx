import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp } from "./anim";
import { contentBodySize } from "./sizing";
import type { Slide } from "./types";
import { card, fonts, pill, theme } from "./theme";

// Each template renders the area BELOW the category+title header of a content
// slide. All entrances start around frame 22 (after the title has landed).
const BODY_IN = 22;

export const StandardBody: React.FC<{ slide: Slide }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const body = contentBodySize(slide.body ?? "");
  return (
    <div
      style={{
        fontFamily: fonts.serif,
        fontStyle: "italic",
        fontSize: body.fontSize,
        color: theme.muted,
        lineHeight: body.lineHeight,
        marginTop: 56,
        maxWidth: 1500,
        ...fadeUp(frame, BODY_IN),
      }}
    >
      {slide.body}
    </div>
  );
};

export const MetricsBody: React.FC<{ slide: Slide }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const metrics = slide.metrics ?? [];
  return (
    <div style={{ display: "flex", alignItems: "stretch", marginTop: 90, gap: 0 }}>
      {metrics.map((m, i) => (
        <React.Fragment key={i}>
          {i > 0 && <div style={{ width: 1, background: theme.hairline, margin: "0 96px" }} />}
          <div style={fadeUp(frame, BODY_IN + i * 10)}>
            <div style={{ display: "flex", alignItems: "flex-start" }}>
              <span
                style={{
                  fontFamily: fonts.serif,
                  fontSize: metrics.length > 2 ? 150 : 190,
                  fontWeight: 600,
                  color: theme.ink,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}
              >
                {m.value}
              </span>
              {i === 0 && (
                <div
                  style={{ width: 18, height: 18, borderRadius: "50%", background: theme.accent, marginLeft: 14, marginTop: 10 }}
                />
              )}
            </div>
            <div
              style={{
                fontFamily: fonts.serif,
                fontStyle: "italic",
                fontSize: 40,
                color: theme.muted,
                marginTop: 28,
              }}
            >
              {m.label}
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

export const CodeBody: React.FC<{ slide: Slide }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const code = slide.code;
  if (!code) return null;
  return (
    <div style={{ ...card, marginTop: 64, padding: "44px 56px", maxWidth: 1560, ...fadeUp(frame, BODY_IN) }}>
      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: 22,
          letterSpacing: "0.22em",
          color: "#6D9BC3",
          fontWeight: 600,
          textTransform: "uppercase",
          marginBottom: 28,
        }}
      >
        {code.label}
      </div>
      {code.lines.map((line, i) => (
        <div
          key={i}
          style={{
            fontFamily: fonts.mono,
            fontSize: 34,
            color: theme.ink,
            lineHeight: 1.7,
            whiteSpace: "pre",
            ...fadeUp(frame, BODY_IN + 6 + i * 5, 12, 10),
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
};

export const ComparisonBody: React.FC<{ slide: Slide }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ba = slide.beforeAfter;
  if (!ba) return null;
  const arrowX = interpolate(
    spring({ frame: frame - (BODY_IN + 14), fps, config: { damping: 16 } }),
    [0, 1],
    [-24, 0],
  );
  const label: React.CSSProperties = {
    fontFamily: fonts.sans,
    fontSize: 20,
    letterSpacing: "0.22em",
    fontWeight: 600,
    textTransform: "uppercase",
    marginBottom: 20,
  };
  const imgBox: React.CSSProperties = { width: "100%", borderRadius: 10, display: "block" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 44, marginTop: 56 }}>
      <div
        style={{
          flex: 1,
          border: `1px solid ${theme.hairline}`,
          borderRadius: card.borderRadius,
          padding: 32,
          ...fadeUp(frame, BODY_IN),
        }}
      >
        <div style={{ ...label, color: theme.muted }}>{ba.beforeLabel}</div>
        <Img src={staticFile(ba.before)} style={{ ...imgBox, opacity: 0.85 }} />
      </div>
      <div
        style={{
          fontFamily: fonts.serif,
          fontSize: 64,
          color: theme.accent,
          transform: `translateX(${arrowX}px)`,
          opacity: interpolate(frame, [BODY_IN + 14, BODY_IN + 26], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          flexShrink: 0,
        }}
      >
        →
      </div>
      <div style={{ flex: 1, ...card, padding: 32, ...fadeUp(frame, BODY_IN + 10) }}>
        <div style={{ ...label, color: theme.accent }}>{ba.afterLabel}</div>
        <Img src={staticFile(ba.after)} style={imgBox} />
      </div>
    </div>
  );
};

export const GridBody: React.FC<{ slide: Slide }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const items = slide.gridItems ?? [];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 28,
        marginTop: 56,
      }}
    >
      {items.map((item, i) => (
        <div key={i} style={{ ...card, padding: "30px 36px", ...fadeUp(frame, BODY_IN + i * 6, 12, 14) }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 20,
              background: pill.background,
              color: pill.color,
              borderRadius: 6,
              padding: "4px 14px",
            }}
          >
            {item.tag}
          </span>
          <div
            style={{
              fontFamily: fonts.serif,
              fontSize: 30,
              color: theme.ink,
              lineHeight: 1.4,
              marginTop: 18,
            }}
          >
            {item.description}
          </div>
        </div>
      ))}
    </div>
  );
};
