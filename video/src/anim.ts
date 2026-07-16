import { Easing, interpolate } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// One easing family for the entire piece — a swift, settled out-quint for
// entrances, a gentle in-quad for exits. Every animated element uses these;
// cohesion comes from a single motion vocabulary, not identical timings.
const EASE_ENTER = Easing.bezier(0.22, 1, 0.36, 1);
const EASE_EXIT = Easing.in(Easing.quad);

// Rhythm grid: stagger offsets land on multiples of this.
export const STEP = 6;

/**
 * The standard entrance: eased fade with a rise. Mass-proportional motion —
 * big display type should travel further and settle slower than small labels,
 * so callers pass duration/rise scaled to the element (defaults suit body-
 * sized text). Elements enter at their FINAL color; never animate hue/greys.
 */
export const fadeUp = (frame: number, start: number, duration = 16, rise = 26) => ({
  opacity: interpolate(frame, [start, start + duration], [0, 1], { ...clamp, easing: EASE_ENTER }),
  transform: `translateY(${interpolate(frame, [start, start + duration], [rise, 0], {
    ...clamp,
    easing: EASE_ENTER,
  })}px)`,
});

/** Opacity-only variant for elements that should appear in place (rules, dots). */
export const fadeIn = (frame: number, start: number, duration = 14) =>
  interpolate(frame, [start, start + duration], [0, 1], { ...clamp, easing: EASE_ENTER });

/** Whole-slide exit: fade with a slight upward drift, mirroring the entrances. */
export const exitStyle = (frame: number, durationInFrames: number, fade = 14) => {
  const t = interpolate(frame, [durationInFrames - fade - 2, durationInFrames - 2], [0, 1], {
    ...clamp,
    easing: EASE_EXIT,
  });
  return { opacity: 1 - t, transform: `translateY(${-10 * t}px)` };
};

/** @deprecated kept for reference — prefer exitStyle so exits carry motion. */
export const fadeOutAtEnd = (frame: number, durationInFrames: number, fade = 12) =>
  interpolate(frame, [durationInFrames - fade - 2, durationInFrames - 2], [1, 0], {
    ...clamp,
    easing: EASE_EXIT,
  });
