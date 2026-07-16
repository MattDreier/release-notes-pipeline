import React from "react";
import { Series } from "remotion";
import { CoverSlide } from "./CoverSlide";
import { ContentSlide } from "./ContentSlide";
import { OutroSlide } from "./OutroSlide";
import type { Manifest } from "./types";
import type { Timing } from "./theme";

export const Main: React.FC<{ manifest: Manifest; timing: Timing }> = ({ manifest, timing }) => {
  if (!manifest || !timing) return null; // placeholder props before calculateMetadata runs
  return (
    <Series>
      <Series.Sequence durationInFrames={timing.coverFrames}>
        <CoverSlide manifest={manifest} />
      </Series.Sequence>
      {manifest.slides.map((_, i) => (
        <Series.Sequence key={i} durationInFrames={timing.slideFrames[i]}>
          <ContentSlide manifest={manifest} index={i} />
        </Series.Sequence>
      ))}
      <Series.Sequence durationInFrames={timing.outroFrames}>
        <OutroSlide manifest={manifest} />
      </Series.Sequence>
    </Series>
  );
};
