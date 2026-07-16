# Opting a repo into automated release notes

When a PR merges, the pipeline commits three things back to the repo: a
technical entry in root `CHANGELOG.md`, a client-facing entry in
`release-notes/RELEASE-NOTES.md`, and a 30–60s editorial release notes video
alongside it.

## 1. One-time secrets (org- or repo-level)

| Secret | How to get it |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Run `claude setup-token` on a machine logged into your Claude Max subscription; paste the token. No metered API key involved. |
| `GEMINI_API_KEY` | Google AI Studio key (used for text-to-speech only). |
| `RELEASE_NOTES_TOKEN` *(optional)* | Fine-grained PAT scoped to `release-notes-pipeline` (contents read/write). Enables checkout while that repo is private, and mirrors finished videos into its `showcase/` folder. Omit it and both fall back gracefully. |

## 2. Add the stub workflow to the target repo

```yaml
# .github/workflows/release-notes.yml
name: Release notes
on:
  pull_request:
    types: [closed]
jobs:
  release-notes:
    if: github.event.pull_request.merged == true
    uses: MattDreier/release-notes-pipeline/.github/workflows/render-release-notes.yml@main
    with:
      pr_number: ${{ github.event.pull_request.number }}
    secrets:
      CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      RELEASE_NOTES_TOKEN: ${{ secrets.RELEASE_NOTES_TOKEN }}
```

## 3. Optional per-repo config

Add `.release-notes.json` at the repo root. All fields optional — defaults
derive from the repo name.

```jsonc
{
  "product": "Dispatch",                      // top-left slug + outro headline ("Dispatch News")
  "domain": "dispatch.solarinbound.com",      // bottom-left corner + outro link line
  "brand": "Matt Dreier",                     // bottom-right corner
  "ttsModel": "gemini-3.1-flash-tts-preview", // bump TTS models without code changes
  "voice": "Charon"                           // any Gemini prebuilt voice
}
```

## Notes

- The reusable workflow renders on `ubuntu-latest`; `remotion browser ensure`
  downloads headless Chrome before the render step.
- The bot commits directly to the default branch with `[skip ci]`, rebasing
  first in case another merge landed during the render. Each video is
  ~3–15 MB; if `release-notes/` grows large, migrate the folder to Git LFS.
- Written entries are idempotent per PR — a re-run replaces the entry rather
  than duplicating it.
- Generation is judgment-gated: an editorial agent workflow decides what's
  newsworthy, writes copy under hard character budgets, and a critic pass
  rejects any claim not grounded in the PR diff. The changelog bullets come
  from the same diff-grounded editor pass.
