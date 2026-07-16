export const BUDGETS = {
  titleMaxChars: 48, // 2 lines × ~24 chars in the huge serif
  bodyMaxChars: 320,
  wordsPerSecond: 2.5, // ~150 spoken wpm
  narration: { minSeconds: 28, maxSeconds: 55 }, // + padding ⇒ 30–60s video
  maxSlides: 3,
} as const;

export const fitsTitle = (s: string) => s.length <= BUDGETS.titleMaxChars;
export const fitsBody = (s: string) => s.length <= BUDGETS.bodyMaxChars;

export function estimateSpokenSeconds(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return words / BUDGETS.wordsPerSecond;
}

export function narrationBudgetCheck(scripts: string[]): {
  seconds: number;
  ok: boolean;
  reason?: string;
} {
  const seconds = scripts.reduce((t, s) => t + estimateSpokenSeconds(s), 0);
  const { minSeconds, maxSeconds } = BUDGETS.narration;
  if (seconds < minSeconds) {
    return {
      seconds,
      ok: false,
      reason: `narration ~${seconds.toFixed(0)}s is under the ${minSeconds}s floor — expand scripts`,
    };
  }
  if (seconds > maxSeconds) {
    return {
      seconds,
      ok: false,
      reason: `narration ~${seconds.toFixed(0)}s exceeds the ${maxSeconds}s ceiling — tighten scripts`,
    };
  }
  return { seconds, ok: true };
}
