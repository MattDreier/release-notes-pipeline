# changelog-video — PR-merge → editorial release video

**Date:** 2026-07-15
**Status:** Approved (Matt, 2026-07-15)

## Purpose

When a PR merges in an opted-in GitHub repo, automatically produce a 30–60 second
editorial "release notes" video summarizing the change — matching the minimalist
Claude Code Release Notes aesthetic (reference screenshots in `docs/reference/`) —
and commit it to a `changelog/` folder in that repo.

Two delivery phases:

1. **CLI phase (first):** iron out generation quality locally against real merged
   PRs from dispatch-schedule-ui.
2. **Event-driven phase:** a reusable GitHub Actions workflow any repo opts into
   with a ~12-line stub.

## Architecture

Standalone repo at `/opt/Projects/changelog-video` with three layers:

```
changelog-video/
├── pipeline/          # Agent SDK orchestrator + TTS client (TypeScript, bun)
│   ├── gather.ts      # gh pr view/diff + linked issues → context bundle (no LLM)
│   ├── generate.ts    # multi-pass editorial agent workflow → manifest.json
│   ├── tts.ts         # Gemini TTS → WAV files in video/public/audio/
│   ├── budgets.ts     # pure: char budgets, spoken-duration estimation
│   ├── manifest.ts    # zod schema + validation
│   └── wav.ts         # pure: PCM → WAV wrapping
├── video/             # Remotion project (React/TS)
│   ├── src/
│   │   ├── Root.tsx           # composition + calculateMetadata (dynamic duration)
│   │   ├── Layout.tsx         # four-corner metadata grid wrapper
│   │   ├── CoverSlide.tsx
│   │   ├── ContentSlide.tsx
│   │   ├── OutroSlide.tsx
│   │   └── theme.ts           # palette + typography tokens
│   └── public/        # generated manifest.json + audio/*.wav land here
├── action/            # reusable workflow (workflow_call) + docs for the stub
└── docs/
    ├── specs/         # this file
    └── reference/     # the four reference screenshots
```

### Auth model — no metered API key

- **Claude:** the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) rides the
  local Claude Code login (Max subscription). In CI, a long-lived OAuth token from
  `claude setup-token` is stored as the `CLAUDE_CODE_OAUTH_TOKEN` secret.
- **Gemini TTS:** `GEMINI_API_KEY` in a gitignored `.env` locally; repo secret in CI.
  Key was shared in chat — rotate it after the pipeline is proven.

## Per-repo config: `.changelog-video.json`

Lives in each target repo's root. All fields optional; defaults reproduce the
reference look.

```jsonc
{
  "product": "Dispatch",              // top-left slug: "DISPATCH · v2026.7.15"
  "domain": "dispatch.solarinbound.com",  // bottom-left corner
  "brand": "MPOWR",                   // bottom-right corner
  "version": "date",                  // "date" (v2026.7.15) | "git-tag"
  "ttsModel": "gemini-3.1-flash-tts-preview",
  "voice": "<gemini voice name>",     // default chosen during build
  "palette": { }                      // optional overrides of the 4 tokens
}
```

The PR number rides in the top-right corner metadata (e.g. `PR 207 · § 01`).

## Content generation — multi-pass agent workflow

One-shotting slides + scripts produces inferior output; the orchestrator runs an
editorial workflow instead. Passes 2–5 are Agent SDK turns; 1 is plain code.

1. **Gather** — `gh pr view` (title, body, labels, linked issues) + `gh pr diff`.
   Diff is truncated intelligently: full hunks for source files, name-only for
   lockfiles/generated/snapshot files, byte cap ~80KB.
2. **Editor pass** — decides what is *newsworthy to a user of the product*:
   slide count (1–3), categories (`FEATURE` | `FIX` | `IMPROVEMENT`), story
   angles, and the **runtime allocation** per slide within the 30–60s budget.
   Can rule a PR a non-story (pure chore) → single modest slide.
3. **Copywriter pass** — slide titles + bodies against hard character budgets
   (title ≤ 2 lines × ~24 chars; body ≤ ~320 chars), plus cover TOC labels.
4. **Voiceover pass** — rewrites for the ear (short sentences, no parentheticals,
   numbers spelled out) to **per-slide word targets** at ~150 spoken wpm:
   cover intro + one script per slide + outro line.
5. **Critic gate** — enforces: char budgets; total estimated narration within
   **28–55s** (padding brings final video to 30–60s); no jargon; tone; and
   **claims must be grounded in the diff** (no hallucinated features).
   Failures loop to pass 3 with notes; max 2 revision cycles, then hard fail.

Output: `manifest.json`, zod-validated. On schema failure: one retry with the
validation error injected, then hard fail. Never render garbage.

```jsonc
{
  "product": "Dispatch", "version": "v2026.7.15", "pr": 207,
  "domain": "DISPATCH.SOLARINBOUND.COM", "brand": "MPOWR",
  "cover":  { "script": "..." },
  "slides": [
    { "type": "FEATURE", "title": "...", "body": "...", "script": "..." }
  ],
  "outro":  { "headline": "Dispatch News", "cta": "Subscribe",
              "subline": "...", "script": "..." }
}
```

## Audio + dynamic timing

`tts.ts` sends each script to Gemini TTS (`ttsModel` from config), wraps returned
PCM into WAV (`wav.ts`, pure) as `video/public/audio/cover.wav`, `slide1.wav`, …,
`outro.wav`. Remotion `calculateMetadata` reads real durations via
`@remotion/media-utils` `getAudioDurationInSeconds`; each slide gets
`audioFrames + 15` frames. `<Series>` sequences the slides; each renders its own
`<Audio>`.

## Visual system (from reference screenshots)

- **Palette:** bg `#FAF9F6`, accent `#D05A3F`, ink `#191919`, muted `#8A8A8A`.
- **Type:** Lora (serif) + Inter (sans) via `@remotion/google-fonts`.
  - Serif: "Release Notes" label (italic), giant version number, slide titles,
    outro headline. **Content-slide body is Lora *italic* in muted gray** — not
    sans (correction from studying the frames; sans is only corner metadata,
    category pills, TOC index numbers, button text).
- **Layout:** 1920×1080 @ 30fps. `<Layout>` enforces the four-corner grid with
  hairline rules under the header and above the footer:
  - Top-left: `PRODUCT · VERSION` (letterspaced sans caps)
  - Top-right: `COVER` / `§ 01` / `END`
  - Bottom-left: domain — Bottom-right: brand
- **Cover:** "Release Notes" small serif italic; version huge serif starting
  light gray; at ~1s the terracotta circle springs in next to it and the version
  snaps to ink; TOC (index + title per slide) staggers in lower-left.
- **Content slide:** `● CATEGORY` pill top-left of content area (terracotta dot),
  huge serif title, muted italic serif body with generous line-height.
- **Outro:** "Thanks for watching" muted serif italic, big serif headline
  (`<Product> News`), charcoal pill button with terracotta dot + "Subscribe",
  muted subline, `— DOMAIN` link line. Holds ~3s after narration ends.
- **Motion restraint:** springs only for circle pop + TOC stagger; fast opacity
  fades between slides; nothing else moves.

## Delivery

**CLI:** `bun run generate --repo owner/name --pr 207 [--out path]`
→ gather → agent workflow → TTS → `npx remotion render` →
`changelog/YYYY-MM-DD-pr<N>.mp4` in the target repo.

**Event-driven:** target repo stub workflow on `pull_request: types [closed]`
with `if: github.event.pull_request.merged == true`, calling the reusable
workflow in this repo (`workflow_call`). The Action renders and **commits the
MP4 directly to the default branch** (automation artifact — exempt from the
human-PR rule; can be switched to open-a-PR mode later). Videos ~5–15 MB; if
`changelog/` grows large, migrate to Git LFS (documented, not built).

## Testing

- **vitest (pure):** budgets.ts (char + duration estimation), wav.ts round-trip,
  manifest.ts validation, gather.ts diff-truncation rules.
- **Golden-PR harness:** run the full generate step against 2–3 real merged
  dispatch-schedule-ui PRs (e.g. #189, #205), commit the manifests as fixtures,
  eyeball quality; re-run after prompt changes to diff drift.
- **Remotion stills:** `npx remotion still` per slide type for fast visual
  iteration against the reference screenshots before full renders.

## Out of scope (explicitly)

- Background music, multi-language narration, YouTube upload, semver inference
  from commits, Git LFS setup, batching multiple PRs into one video.
