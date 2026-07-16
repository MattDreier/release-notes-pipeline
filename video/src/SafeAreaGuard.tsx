import React, { useEffect, useMemo, useRef } from "react";
import { cancelRender, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";

// Content must live inside the hairline-bounded editorial frame, with a small
// breathing margin so text never *touches* a rule. Corner metadata lives
// outside these bounds by design and is not measured.
export const SAFE_AREA = { top: 130, bottom: 964, left: 90, right: 1830 } as const;

// Slide content settles (staggered entrances complete) well before this frame.
const SETTLE_FRAME = 95;

/**
 * Render-time layout gate. Place once per slide, and mark each content root
 * with `data-safe`. On settled frames it measures every marked element's real
 * pixel bounds (normalized for preview scaling) and hard-fails the render if
 * anything crosses the safe area — an overflowing video can never finish
 * rendering.
 *
 * Implementation note: the check runs between delayRender/continueRender so
 * Remotion cannot screenshot the frame before the measurement happened, and a
 * cancelRender here reliably aborts the render.
 */
export const SafeAreaGuard: React.FC<{ slide: string }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const ref = useRef<HTMLDivElement>(null);
  // One handle per frame render — Remotion waits for it before capturing.
  const handle = useMemo(
    () => (frame >= SETTLE_FRAME ? delayRender(`safe-area-guard ${slide} f${frame}`) : null),
    [frame, slide],
  );

  useEffect(() => {
    if (handle === null) return;
    const root = ref.current?.closest("[data-layout-root]") as HTMLElement | null;
    if (!root) {
      cancelRender(new Error(`SafeAreaGuard on ${slide}: no [data-layout-root] ancestor found`));
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const scale = rootRect.width / width; // Studio preview renders scaled; renders are 1:1
    if (scale === 0) {
      continueRender(handle);
      return;
    }

    for (const el of Array.from(root.querySelectorAll("[data-safe]"))) {
      const r = el.getBoundingClientRect();
      const box = {
        top: (r.top - rootRect.top) / scale,
        bottom: (r.bottom - rootRect.top) / scale,
        left: (r.left - rootRect.left) / scale,
        right: (r.right - rootRect.left) / scale,
      };
      const violations: string[] = [];
      if (box.top < SAFE_AREA.top) violations.push(`top ${box.top.toFixed(0)} < ${SAFE_AREA.top}`);
      if (box.bottom > SAFE_AREA.bottom) violations.push(`bottom ${box.bottom.toFixed(0)} > ${SAFE_AREA.bottom}`);
      if (box.left < SAFE_AREA.left) violations.push(`left ${box.left.toFixed(0)} < ${SAFE_AREA.left}`);
      if (box.right > SAFE_AREA.right) violations.push(`right ${box.right.toFixed(0)} > ${SAFE_AREA.right}`);
      if (violations.length > 0) {
        cancelRender(
          new Error(
            `Layout overflow on ${slide} slide: content escapes the safe area (${violations.join(", ")}). ` +
              `Offending text starts: "${(el.textContent ?? "").trim().slice(0, 60)}…"`,
          ),
        );
        return;
      }
    }
    continueRender(handle);
  }, [handle, width, slide]);

  return <div ref={ref} style={{ display: "none" }} />;
};
