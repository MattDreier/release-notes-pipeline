# changelog-video

Merged PR → 30–60 second editorial release-notes video, in the visual language
of the Claude Code release-notes videos (reference frames in `docs/reference/`).
The video lands in the target repo's `changelog/` folder.

```
gh PR data ──▶ editorial agent workflow ──▶ Gemini TTS ──▶ Remotion render
              (editor → copywriter →        (per-slide      (slide duration =
               voiceover → critic gate)      WAVs)           audio + padding)
```

## How it works

1. **Gather** (`pipeline/gather.ts`) — `gh pr view/diff` + the target repo's
   `.changelog-video.json`. Lockfiles/generated files are stubbed out of the diff.
2. **Editorial workflow** (`pipeline/generate.ts`) — Claude Agent SDK (rides your
   Claude Code subscription login; no API key). Four structured-output passes:
   *editor* (what's newsworthy, 1–3 slides, runtime allocation), *copywriter*
   (titles ≤48 chars, bodies ≤320), *voiceover* (scripts written for the ear at
   150 wpm targets), *critic* (budgets, tone, and diff-grounding — hallucinated
   claims bounce back to the copywriter, max 2 revision cycles).
3. **TTS** (`pipeline/tts.ts`) — Gemini TTS (`gemini-3.1-flash-tts-preview` by
   default), raw PCM wrapped into WAVs.
4. **Render** (`video/`) — Remotion. `calculateMetadata` reads each WAV's real
   duration and sizes every slide to its narration + 15 frames of padding, so
   pacing is driven by the voiceover.

## Local usage

```bash
bun install
cp .env.example .env   # set GEMINI_API_KEY
bun run generate --repo owner/name --pr 123
# → out/YYYY-MM-DD-pr123.mp4
```

Useful flags: `--skip-agent` (reuse `video/public/manifest.json` — cheap prompt
iteration), `--skip-tts` (reuse existing audio), `--out <dir>`.

Other scripts: `bun test`, `bun run video:studio` (live-edit the composition),
`bun run video:still` (single-frame renders).

## Event-driven usage (GitHub Action)

See [action/README.md](action/README.md) — a ~15-line stub workflow in the
target repo calls the reusable workflow here on every merged PR.

## Design

Spec: [docs/specs/2026-07-15-changelog-video-design.md](docs/specs/2026-07-15-changelog-video-design.md)
Plan: [docs/plans/2026-07-15-changelog-video-plan.md](docs/plans/2026-07-15-changelog-video-plan.md)

Palette `#FAF9F6 / #D05A3F / #191919 / #8A8A8A`, Lora + Inter, four-corner
metadata grid, terracotta circle pop at 1s, staggered TOC, Lora-italic body
text. 1920×1080 @ 30fps.
