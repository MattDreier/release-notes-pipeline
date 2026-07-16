# Opting a repo into changelog videos

When a PR merges, a 30–60s editorial release-notes video is generated and
committed to that repo's `changelog/` folder.

## 1. One-time secrets (org- or repo-level)

| Secret | How to get it |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Run `claude setup-token` on a machine logged into your Claude Max subscription; paste the token. No metered API key involved. |
| `GEMINI_API_KEY` | Google AI Studio key (used for text-to-speech only). |

## 2. Add the stub workflow to the target repo

```yaml
# .github/workflows/changelog-video.yml
name: Changelog video
on:
  pull_request:
    types: [closed]
jobs:
  video:
    if: github.event.pull_request.merged == true
    uses: MattDreier/changelog-video/.github/workflows/render-changelog.yml@main
    with:
      pr_number: ${{ github.event.pull_request.number }}
    secrets:
      CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

## 3. Optional per-repo config

Add `.changelog-video.json` at the repo root. All fields optional — defaults
derive from the repo name.

```jsonc
{
  "product": "Dispatch",                      // top-left slug + outro headline ("Dispatch News")
  "domain": "dispatch.solarinbound.com",      // bottom-left corner + outro link line
  "brand": "MPOWR",                           // bottom-right corner
  "ttsModel": "gemini-3.1-flash-tts-preview", // bump TTS models without code changes
  "voice": "Charon"                           // any Gemini prebuilt voice
}
```

## Notes

- The reusable workflow renders on `ubuntu-latest`; `remotion browser ensure`
  downloads headless Chrome before the render step.
- The bot commits the MP4 directly to the default branch with `[skip ci]`.
  Each video is ~3–15 MB; if `changelog/` grows large, migrate the folder to
  Git LFS.
- The video generation is judgment-gated: an editorial agent workflow decides
  what's newsworthy, writes copy under hard character budgets, and a critic
  pass rejects any claim not grounded in the PR diff.
