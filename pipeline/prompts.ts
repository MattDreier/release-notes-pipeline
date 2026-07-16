import { BUDGETS } from "./budgets";
import type { RepoConfig } from "./config";
import type { PrBundle } from "./gather";

const AUDIENCE = `## Audience (applies to every word you write)

The viewer is NON-TECHNICAL. They use the product; they have never seen the code, the issue tracker, or any internal discussion. Every sentence must make sense to someone with zero context: describe what they can now do or what stopped being annoying, never how it was implemented. No repo names, branch names, file names, framework names, or engineering vocabulary.`;

const prContext = (bundle: PrBundle) => `## PR #${bundle.number}: ${bundle.title}

Labels: ${bundle.labels.join(", ") || "(none)"}

### PR description
${bundle.body || "(empty)"}

### Screenshots found in the PR description
${bundle.images.length ? bundle.images.map((u, i) => `${i + 1}. ${u}`).join("\n") : "(none)"}

### Diff (noise files omitted)
\`\`\`diff
${bundle.diff}
\`\`\``;

export function editorPrompt(bundle: PrBundle, config: RepoConfig): string {
  const wordsPerSlide = Math.round(BUDGETS.slideTargetSeconds * BUDGETS.wordsPerSecond);
  return `You are the release-notes editor for "${config.product}". A pull request just merged. Decide what in it is newsworthy to a USER of the product.

${AUDIENCE}

${prContext(bundle)}

## Your task

Plan a short release-notes video as a sequence of 1-${BUDGETS.maxSlides} slides. AIM FOR ~${BUDGETS.slideTargetSeconds} SECONDS of narration per slide (~${wordsPerSlide} words) — one digestible idea per slide, for the audience's attention. This is a target, not a straitjacket: if an idea genuinely needs 8-9 seconds to land clearly, give it 8-9 seconds. Prefer splitting an oversized idea into two slides when a clean split exists; NEVER compress wording to the point of harming comprehension — effective communication outranks pacing, always.

For each slide choose:

1. "type": FEATURE (new capability) | IMPROVEMENT (faster/smoother/smaller) | FIX (repaired defect) | BREAKING CHANGE (existing behavior changed under users' feet).
2. "layout": pick the template that best carries the idea:
   - "standard" — the default: headline + short supporting paragraph.
   - "metrics" — ONLY for quantifiable wins (times, sizes, counts). 1-3 giant number+label pairs.
   - "code" — a "here is what you type" card. Use ONLY when showing the user literal text they would type into the product (a search query, a command, a formula). NOT for showing source code.
   - "comparison" — before/after SCREENSHOTS side by side. Available ONLY if the PR description contains usable before/after images (see the screenshots list above). If no images exist, this layout is forbidden.
   - "grid" — bundle 2-6 small fixes/improvements into one "Also fixed" style slide (tag + one plain-language line each) instead of wasting slides on minor items.
3. "angle": one sentence, user's point of view.
4. "targetSeconds": ~${BUDGETS.slideTargetSeconds} by default; up to ~10 when the idea needs the room.

## Runtime (guideline, with ONE hard ceiling)

AIM for roughly 30-60 seconds of finished video on a typical PR. There is NO minimum: a small PR whose story is fully told in 15 seconds ships at 15 seconds — never add a slide, stretch wording, or manufacture significance to fill time. The only HARD limit is the ceiling: total narration (cover + slides + outro) must stay under ${BUDGETS.narration.maxSeconds} seconds — and if the story presses against it, bundle minor items into one "grid" slide rather than cutting context from the items that matter.

Ground every angle in what the diff actually changes. Do not invent capabilities the code does not show. A pure chore/refactor PR still gets one modest IMPROVEMENT slide about what quietly got better.

## Also: the technical changelog ("technical")

Separately from the slides, write 1-8 terse bullets for the repo's CHANGELOG.md. This is the ONE output where the audience rule is inverted: these bullets are for DEVELOPERS and technical readers — precise, scannable, grounded in the diff. Name the actual behavior change; file/function/property names in backticks are welcome when they aid precision. One bullet per distinct change, each tagged with its category (FEATURE → Added, IMPROVEMENT → Changed, FIX → Fixed, BREAKING CHANGE → Changed with a breaking flag). No marketing language here.`;
}

export function copyPrompt(plan: unknown, bundle: PrBundle): string {
  return `You are a copywriter for a minimalist, high-end editorial release-notes video (confident, concrete, zero hype-words).

${AUDIENCE}

An editor has planned the slides (respect each slide's layout):
${JSON.stringify(plan, null, 2)}

Source PR for grounding:
${prContext(bundle)}

## Write, for each planned slide (same order)

- "title": the big serif headline. HARD LIMIT ${BUDGETS.titleMaxChars} characters. Editorial noun-phrase, Title Case, no trailing period. Like "Nested Sub-Agents" or "The Range Comes With You".
- The layout payload (exactly one, matching the slide's layout):
  - standard → "body": HARD LIMIT ${BUDGETS.bodyMaxChars} chars. 2-4 plain sentences. No markdown.
  - metrics → "metrics": 1-3 items of {"value": short big number like "-7 MB" or "2×" (max 10 chars), "label": what it measures in plain words (max 30 chars)}.
  - code → "code": {"label": what this input is, e.g. "SEARCH" or "COMMAND" (max 20 chars), "lines": 1-6 short strings of EXACTLY what the user types (max 64 chars each)}.
  - comparison → "beforeAfter": {"before": <URL chosen from the PR screenshots list>, "after": <URL>, "beforeLabel"?: short caption, "afterLabel"?: short caption}. Pick the URLs that clearly show old vs new.
  - grid → "gridItems": 2-6 items of {"tag": lowercase area word like "search" or "map" (max 14 chars), "description": one plain sentence a user understands (max 110 chars)}.

Every claim must be true to the diff. If the editor's angle overstates, tone it down.`;
}

export function voicePrompt(copy: unknown, plan: { slides: { targetSeconds: number }[] }): string {
  const targets = plan.slides
    .map(
      (s, i) =>
        `- slide ${i + 1}: ~${s.targetSeconds}s ≈ ${Math.round(s.targetSeconds * BUDGETS.wordsPerSecond)} words`,
    )
    .join("\n");
  return `You are a voiceover writer. Rewrite the following slide copy as narration scripts — written for the EAR of a NON-TECHNICAL viewer. Speech runs at ~150 words per minute (${BUDGETS.wordsPerSecond} words/second).

Slide copy:
${JSON.stringify(copy, null, 2)}

## Word targets (aim here — but clarity always wins)

- "cover": ~7 seconds ≈ 17 words. Introduce the release: product name, that these are the release notes, tee up what's inside.
- slides:
${targets}
- "outro": ~5 seconds ≈ 12 words. One warm closing line.

These targets keep slides digestible, but they are AIMS, not ceilings. If hitting a target would force telegraphic, hard-to-follow phrasing, use the extra words — a clear 9-second script always beats an incomprehensible 5-second one.

## Style rules

- Short sentences. No parentheticals. No jargon — a viewer with zero technical background must follow every word.
- Numbers and versions spelled the way a narrator says them.
- Don't read the title verbatim and then repeat it — narrate the story of the slide.
- For metrics slides, say the numbers plainly ("seven megabytes lighter"). For code slides, describe what typing it does, don't spell out syntax. For grid slides, summarize the theme and name one or two highlights — never read every card.
- Plain prose only — never include bracketed stage directions or delivery tags; the scripts are read verbatim by a text-to-speech voice whose consistent default delivery is the product.

Return one script string per slide, in order, plus cover and outro.`;
}

export function criticPrompt(draft: unknown, bundle: PrBundle): string {
  return `You are a skeptical release-notes editor doing the final quality gate on a video manifest before it renders. Fail anything that would embarrass us.

${AUDIENCE}

## THE PRIME DIRECTIVE: effective communication

Above every other check: would a first-time, non-technical viewer actually UNDERSTAND each slide on one hearing? Telegraphic, over-compressed, or ambiguous phrasing is a FAILURE even if it satisfies every budget. When any other check conflicts with comprehension, comprehension wins — never issue a note that would make the copy less clear (e.g. never say "cut to N words" if cutting would damage the message; say "split into two slides" or "allow this slide the extra seconds" instead).

Draft manifest:
${JSON.stringify(draft, null, 2)}

Source PR (ground truth):
${prContext(bundle)}

## Checks (fail with a specific, actionable note if any miss)

1. Comprehension (the prime directive): every script and payload is clear, natural, and self-contained for a viewer with zero context. Flag anything that requires prior knowledge, is packed too dense to follow aloud, or reads like a compressed telegram.
2. Pacing judgment: ~${BUDGETS.slideTargetSeconds}s per slide is the aim. A slide running 7-10s is acceptable IF the extra time is earning its keep in clarity. Fail pacing only when a slide is long AND could be split cleanly or tightened without losing meaning — and then prescribe the split, not blind cuts.
3. Character budgets: title ≤ ${BUDGETS.titleMaxChars} chars; standard body ≤ ${BUDGETS.bodyMaxChars} chars; grid descriptions ≤ 110 chars; code lines ≤ 64 chars.
4. Runtime: total narration must stay under ${BUDGETS.narration.maxSeconds} seconds (hard ceiling). There is NO minimum — never demand filler or padding. Fail a short draft ONLY when its brevity comes from missing context a first-time viewer needs, not because the change itself is small.
5. Grounding: every claim in titles, payloads, and scripts must be supported by the diff or PR description. List any hallucinated or overstated claim verbatim. Comparison slides must use image URLs that actually appear in the PR description.
6. Layout fit: metrics values are real quantities from the PR; code lines are text a user would literally type into the product (not source code); grid items are genuinely minor; comparison only used when before/after images exist.
7. Tone: no hype-words, no exclamation marks. Scripts read naturally aloud, in plain prose — fail any script containing bracketed stage directions or delivery tags.

Return pass=true only if ALL checks pass. Notes must be actionable instructions, not observations — and never instructions that trade clarity for brevity.`;
}
