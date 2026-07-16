import React from "react";
import { Composition, staticFile } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { Main } from "./Main";
import type { Manifest } from "./types";
import type { Timing } from "./theme";

const FPS = 30;
const PAD = 15; // breathing room after each narration ends

export const RemotionRoot: React.FC = () => (
  <Composition
    id="ReleaseNotes"
    component={Main}
    fps={FPS}
    width={1920}
    height={1080}
    durationInFrames={300} // placeholder; calculateMetadata overrides
    defaultProps={{ manifest: null as unknown as Manifest, timing: null as unknown as Timing }}
    calculateMetadata={async () => {
      const manifest: Manifest = await fetch(staticFile("manifest.json")).then((r) => r.json());
      const frames = async (name: string) =>
        Math.ceil((await getAudioDurationInSeconds(staticFile(`audio/${name}`))) * FPS) + PAD;
      const coverFrames = await frames("cover.wav");
      const slideFrames = await Promise.all(manifest.slides.map((_, i) => frames(`slide${i + 1}.wav`)));
      const outroFrames = (await frames("outro.wav")) + 45; // hold ~1.5s extra on the outro
      const timing: Timing = { coverFrames, slideFrames, outroFrames };
      return {
        durationInFrames: coverFrames + slideFrames.reduce((a, b) => a + b, 0) + outroFrames,
        props: { manifest, timing },
      };
    }}
  />
);
