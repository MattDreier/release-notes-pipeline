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

## 2. Add the workflow to the target repo (self-contained — recommended)

Checks this repo out as code and runs it in the target repo's own Actions
context. Permissions are declared once, in one file; no cross-repo tokens.

```yaml
# .github/workflows/release-notes.yml
name: Release notes
on:
  pull_request:
    types: [closed]

# NB: a permissions block zeroes every unlisted scope — name both.
permissions:
  contents: write # commit the video + notes back to this repo
  pull-requests: read # gather runs `gh pr view`/`gh pr diff`

jobs:
  release-notes:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          path: target
          # pull_request events default to a detached merge ref; we must be ON
          # the default branch to commit back and push.
          ref: ${{ github.event.repository.default_branch }}
          fetch-depth: 0

      - uses: actions/checkout@v4
        with:
          repository: MattDreier/release-notes-pipeline
          path: release-notes-pipeline

      - uses: oven-sh/setup-bun@v2
      - run: cd release-notes-pipeline && bun install --frozen-lockfile
      - run: cd release-notes-pipeline && bunx remotion browser ensure

      - name: Generate release notes
        env:
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          GH_TOKEN: ${{ github.token }}
        run: |
          cd release-notes-pipeline
          bun run generate --repo "${{ github.repository }}" --pr "${{ github.event.pull_request.number }}" --target ../target

      - name: Commit release notes
        run: |
          cd target
          git config user.name "release-notes-pipeline[bot]"
          git config user.email "noreply@github.com"
          git add CHANGELOG.md release-notes/
          git diff --cached --quiet && { echo "nothing to commit"; exit 0; }
          git commit -m "docs(release-notes): PR #${{ github.event.pull_request.number }} [skip ci]"
          git pull --rebase origin "$(git rev-parse --abbrev-ref HEAD)"
          git push
```

<details>
<summary>Alternative: reusable-workflow call (thinner stub, fiddlier permissions)</summary>

`.github/workflows/render-release-notes.yml` here is a `workflow_call` wrapper
around the same steps. The stub is ~15 lines, but the caller must grant a
permissions ceiling that exactly covers the callee's request (`contents: write`
+ `pull-requests: read`) — GitHub fails the run at startup or mid-gather if
either is missing, which is exactly how the first live runs failed. Prefer the
self-contained form unless you have many repos and want single-point updates.

```yaml
jobs:
  release-notes:
    if: github.event.pull_request.merged == true
    permissions:
      contents: write
      pull-requests: read
    uses: MattDreier/release-notes-pipeline/.github/workflows/render-release-notes.yml@main
    with:
      pr_number: ${{ github.event.pull_request.number }}
    secrets:
      CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```
</details>

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

- The workflow renders on `ubuntu-latest`; `remotion browser ensure` downloads
  headless Chrome before the render step.
- The bot commits directly to the default branch with `[skip ci]`, rebasing
  first in case another merge landed during the render. Each video is
  ~3–15 MB; if `release-notes/` grows large, migrate the folder to Git LFS.
- Written entries are idempotent per PR — a re-run replaces the entry rather
  than duplicating it, and a no-op run exits cleanly without an empty commit.
- The `showcase/` folder in this repo is curated by hand — favorite videos get
  copied in manually.
- Generation is judgment-gated: an editorial agent workflow decides what's
  newsworthy, writes copy under hard character budgets, and a critic pass
  rejects any claim not grounded in the PR diff. The changelog bullets come
  from the same diff-grounded editor pass.
