import React from "react";
import { AbsoluteFill } from "remotion";
import { fonts, theme } from "./theme";

const corner: React.CSSProperties = {
  position: "absolute",
  fontSize: 22,
  letterSpacing: "0.18em",
  color: theme.muted,
  textTransform: "uppercase",
  fontWeight: 500,
};

export const Layout: React.FC<{
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  children: React.ReactNode;
}> = ({ topLeft, topRight, bottomLeft, bottomRight, children }) => (
  <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: fonts.sans }}>
    <div style={{ position: "absolute", top: 110, left: 96, right: 96, height: 1, background: theme.hairline }} />
    <div style={{ position: "absolute", bottom: 96, left: 96, right: 96, height: 1, background: theme.hairline }} />
    <div style={{ ...corner, top: 62, left: 96, color: theme.ink, fontWeight: 600 }}>{topLeft}</div>
    <div style={{ ...corner, top: 62, right: 96 }}>{topRight}</div>
    <div style={{ ...corner, bottom: 52, left: 96 }}>{bottomLeft}</div>
    <div style={{ ...corner, bottom: 52, right: 96 }}>{bottomRight}</div>
    {children}
  </AbsoluteFill>
);
