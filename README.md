# release-notes-pipeline

Merged PR → three audience-matched artifacts, committed straight back to the
target repo. You merge; your clients stay informed.

| Audience | Artifact | Where it lands |
|---|---|---|
| Developers | commits / PRs | GitHub (already yours) |
| Technical readers | `CHANGELOG.md` — terse, Keep-a-Changelog style, PR-linked | target repo root |
| Clients | `RELEASE-NOTES.md` + a 30–60s editorial **release notes video** | target repo `release-notes/` |

The video replicates the visual language of the Claude Code release-notes
videos (reference frames in `docs/reference/`).

```
gh PR data ──▶ editorial agent workflow ──▶ Gemini TTS ──▶ Remotion render
              (editor → copywriter →        (per-slide      (slide duration =
               voiceover → critic gate)      WAVs)           audio + padding)
                     │
                     └──▶ technical bullets ──▶ CHANGELOG.md (deterministic)
                          approved manifest ──▶ RELEASE-NOTES.md (deterministic)
```

One editorial source of truth, three renderings: the critic-approved manifest
drives both the video and the written release notes, and the same diff-grounded
editor pass emits the changelog bullets — the artifacts cannot disagree.

## How it works

1. **Gather** (`pipeline/gather.ts`) — `gh pr view/diff` + the target repo's
   `.release-notes.json`. Lockfiles/generated files are stubbed out of the diff.
2. **Editorial workflow** (`pipeline/generate.ts`) — Claude Agent SDK (rides your
   Claude Code subscription login; no API key). Four structured-output passes:
   *editor* (what's newsworthy, slide plan, runtime allocation, plus the
   dev-facing changelog bullets), *copywriter* (titles ≤48 chars, bodies ≤320),
   *voiceover* (scripts written for the ear at 150 wpm targets), *critic*
   (comprehension first, budgets, tone, diff-grounding — hallucinated claims
   bounce back, max 2 revision cycles).
3. **TTS** (`pipeline/tts.ts`) — Gemini TTS (`gemini-3.1-flash-tts-preview` by
   default), raw PCM wrapped into WAVs.
4. **Render** (`video/`) — Remotion. `calculateMetadata` reads each WAV's real
   duration and sizes every slide to its narration + 15 frames of padding, so
   pacing is driven by the voiceover.
5. **Write** (`pipeline/notes.ts`) — deterministic (no LLM) upserts into the
   target repo's `CHANGELOG.md` and `release-notes/RELEASE-NOTES.md`, newest
   first, idempotent per PR.

## Local usage

```bash
bun install
cp .env.example .env   # set GEMINI_API_KEY
bun run generate --repo owner/name --pr 123
# → out/YYYY-MM-DD-pr123.mp4 (video only)

bun run generate --repo owner/name --pr 123 --target ../that-repo
# → that-repo/release-notes/YYYY-MM-DD-pr123.mp4
#   that-repo/release-notes/RELEASE-NOTES.md
#   that-repo/CHANGELOG.md
```

Useful flags: `--skip-agent` (reuse `video/public/manifest.json` — cheap prompt
iteration), `--skip-tts` (reuse existing audio), `--out <dir>`.

Other scripts: `bun test`, `bun run video:studio` (live-edit the composition),
`bun run video:still` (single-frame renders).

## Event-driven usage (GitHub Action)

See [action/README.md](action/README.md) — a ~15-line stub workflow in the
target repo calls the reusable workflow here on every merged PR. Finished
videos are optionally mirrored into [`showcase/`](showcase/) in this repo.

## Design

Spec: [docs/specs/2026-07-15-changelog-video-design.md](docs/specs/2026-07-15-changelog-video-design.md)
Plan: [docs/plans/2026-07-15-changelog-video-plan.md](docs/plans/2026-07-15-changelog-video-plan.md)
(Both predate the rename from `changelog-video` — kept verbatim as historical rationale.)

Palette `#FAF9F6 / #D05A3F / #191919 / #8A8A8A`, Lora + Inter, four-corner
metadata grid, terracotta circle pop at 1s, staggered TOC, Lora-italic body
text. 1920×1080 @ 30fps.
