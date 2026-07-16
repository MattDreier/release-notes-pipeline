import { BUDGETS } from "./budgets";
import type { RepoConfig } from "./config";
import type { PrBundle } from "./gather";

const prContext = (bundle: PrBundle) => `## PR #${bundle.number}: ${bundle.title}

Labels: ${bundle.labels.join(", ") || "(none)"}

### PR description
${bundle.body || "(empty)"}

### Diff (noise files omitted)
\`\`\`diff
${bundle.diff}
\`\`\``;

export function editorPrompt(bundle: PrBundle, config: RepoConfig): string {
  return `You are the release-notes editor for "${config.product}". A pull request just merged. Your job is to decide what in it is newsworthy to a USER of the product — not to a developer reading the code.

${prContext(bundle)}

## Your task

Plan a short release-notes video. Decide:

1. Is this PR newsworthy to a user at all? (A pure chore/refactor/infra PR is not — but it still gets one modest IMPROVEMENT slide framed around what quietly got better, e.g. reliability or speed.)
2. How many slides: 1-3. One clear story beats three thin ones. A small fix PR = 1 slide with fuller narration; a big feature PR = 2-3 tighter slides.
3. For each slide: a category (FEATURE for new capability, FIX for a repaired defect, IMPROVEMENT for everything else), a one-sentence story angle written from the user's point of view, and a narration time allocation in seconds.

## Runtime budget (hard constraint)

Total narration across the whole video must land between 28 and 55 seconds, allocated as:
- Cover intro: ~6-9 seconds (you don't plan this, but leave room for it)
- Your slides: the middle ~18-42 seconds, split across slide targetSeconds
- Outro: ~4-6 seconds (also leave room)

So the SUM of your slide targetSeconds values should be roughly 18-40 seconds.

Ground every angle in what the diff actually changes. Do not invent capabilities the code does not show.`;
}

export function copyPrompt(plan: unknown, bundle: PrBundle): string {
  return `You are a copywriter for a minimalist, high-end editorial release-notes video (think Apple-adjacent restraint: confident, concrete, zero hype-words).

An editor has planned the slides:
${JSON.stringify(plan, null, 2)}

Source PR for grounding:
${prContext(bundle)}

## Write, for each planned slide (same order):

- "title": the big serif headline. HARD LIMIT ${BUDGETS.titleMaxChars} characters (renders as up to 2 lines of ~24). Editorial noun-phrase, Title Case, no trailing period. Like "Nested Sub-Agents" or "1M Context Unstuck".
- "body": the supporting paragraph. HARD LIMIT ${BUDGETS.bodyMaxChars} characters. 2-4 plain sentences a user understands, present tense, concrete about what changed and why it matters. No markdown, no code identifiers unless a user would type them, no exclamation marks.

Also write:
- "subline": one quiet outro sentence (e.g. "Full release notes at the link below.").

Every claim must be true to the diff. If the editor's angle overstates, tone it down.`;
}

export function voicePrompt(copy: unknown, plan: { slides: { targetSeconds: number }[] }): string {
  const targets = plan.slides
    .map((s, i) => `- slide ${i + 1}: ~${s.targetSeconds}s ≈ ${Math.round(s.targetSeconds * BUDGETS.wordsPerSecond)} words`)
    .join("\n");
  return `You are a voiceover writer. Rewrite the following slide copy as narration scripts — written for the EAR, not the eye. Speech runs at ~150 words per minute (${BUDGETS.wordsPerSecond} words/second).

Slide copy:
${JSON.stringify(copy, null, 2)}

## Word targets (hit these within ±15%)

- "cover": ~7 seconds ≈ 17 words. Introduce the release: product name, that these are the release notes, and tee up what's inside.
- slides:
${targets}
- "outro": ~5 seconds ≈ 12 words. One warm closing line inviting the viewer to subscribe or read the full notes.

## Style rules

- Short sentences. No parentheticals, no colons mid-sentence.
- Numbers and versions spelled the way a narrator says them ("version twenty twenty-six dot seven").
- Don't read the title verbatim and then repeat it — narrate the story of the slide.
- No "in this update we..." filler; get to the substance.

Return one script string per slide, in order, plus cover and outro.`;
}

export function criticPrompt(draft: unknown, bundle: PrBundle): string {
  return `You are a skeptical release-notes editor doing the final quality gate on a video manifest before it renders. Fail anything that would embarrass us.

Draft manifest:
${JSON.stringify(draft, null, 2)}

Source PR (ground truth):
${prContext(bundle)}

## Checks (fail with a specific note if any miss)

1. Character budgets: every slide title ≤ ${BUDGETS.titleMaxChars} chars, every body ≤ ${BUDGETS.bodyMaxChars} chars.
2. Runtime: total narration (cover + slides + outro) at ${BUDGETS.wordsPerSecond} words/second must be between ${BUDGETS.narration.minSeconds} and ${BUDGETS.narration.maxSeconds} seconds. Show your word count arithmetic in a note if it fails.
3. Grounding: every claim in titles, bodies, and scripts must be supported by the diff or PR description. List any hallucinated or overstated claim verbatim.
4. Tone: no jargon a user wouldn't know, no internal codenames, no hype-words ("revolutionary", "game-changing"), no exclamation marks.
5. Scripts read naturally aloud (no markdown artifacts, no parentheticals).

Return pass=true only if ALL checks pass. Notes must be actionable instructions for the copywriter (e.g. "slide 2 body is 380 chars — cut the last sentence"), not observations.`;
}
