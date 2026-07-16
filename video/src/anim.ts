import { Easing, interpolate } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const easeOut = Easing.out(Easing.cubic);

/** Eased fade-in with a gentle rise — the standard entrance for text blocks. */
export const fadeUp = (frame: number, start: number, duration = 16, rise = 26) => ({
  opacity: interpolate(frame, [start, start + duration], [0, 1], { ...clamp, easing: easeOut }),
  transform: `translateY(${interpolate(frame, [start, start + duration], [rise, 0], {
    ...clamp,
    easing: easeOut,
  })}px)`,
});

/** Whole-slide fade during the final frames of a sequence — the exit. */
export const fadeOutAtEnd = (frame: number, durationInFrames: number, fade = 12) =>
  interpolate(frame, [durationInFrames - fade - 2, durationInFrames - 2], [1, 0], {
    ...clamp,
    easing: Easing.in(Easing.quad),
  });
