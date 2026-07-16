export const BUDGETS = {
  titleMaxChars: 48, // 2 lines × ~24 chars in the huge serif
  bodyMaxChars: 320,
  wordsPerSecond: 2.5, // ~150 spoken wpm
  // 30-60s is the AIM for a typical PR. There is NO enforced minimum — a small
  // infra/docs PR fully told in 15s ships at 15s; padding to a floor is
  // anti-communication. Only the ceiling is hard (attention + cost guard).
  narration: { aimMinSeconds: 28, maxSeconds: 55 },
  maxSlides: 6,
  slideTargetSeconds: 6, // the AIM: one digestible idea per slide
  slideMaxSeconds: 12, // outlier guard only — clarity may stretch a slide well past the 6s target
} as const;

/**
 * Per-slide pacing check — an OUTLIER guard, not the pacing enforcer.
 * ~6s is the target, but effective communication outranks pacing; a slide is
 * only bounced locally when it's so long that splitting is clearly warranted.
 * The judgment call between 6 and 12 seconds belongs to the critic agent.
 */
export function slidePacingCheck(scripts: string[]): { ok: boolean; reason?: string } {
  const over = scripts
    .map((s, i) => ({ i, seconds: estimateSpokenSeconds(s) }))
    .filter((x) => x.seconds > BUDGETS.slideMaxSeconds);
  if (over.length === 0) return { ok: true };
  return {
    ok: false,
    reason: over
      .map(
        (x) =>
          `slide ${x.i + 1} narration ~${x.seconds.toFixed(1)}s is far past the ~${BUDGETS.slideTargetSeconds}s target — split it into two slides (do NOT compress the wording at the cost of clarity)`,
      )
      .join("; "),
  };
}

export const fitsTitle = (s: string) => s.length <= BUDGETS.titleMaxChars;
export const fitsBody = (s: string) => s.length <= BUDGETS.bodyMaxChars;

export function estimateSpokenSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return words / BUDGETS.wordsPerSecond;
}

/**
 * Only the CEILING is a hard local check. Shortness is never failed here —
 * whether a brief draft is "clear and complete" vs "missing context" is the
 * critic's judgment call, and padding to a floor is anti-communication.
 */
export function narrationBudgetCheck(scripts: string[]): {
  seconds: number;
  ok: boolean;
  reason?: string;
} {
  const seconds = scripts.reduce((t, s) => t + estimateSpokenSeconds(s), 0);
  const { maxSeconds } = BUDGETS.narration;
  if (seconds > maxSeconds) {
    return {
      seconds,
      ok: false,
      reason: `narration ~${seconds.toFixed(0)}s exceeds the ${maxSeconds}s ceiling — bundle minor items into a grid slide or trim the least newsworthy slide (do NOT compress wording at the cost of clarity)`,
    };
  }
  return { seconds, ok: true };
}
