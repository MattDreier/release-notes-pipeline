# Worked example — demo-pipeline output for `dispatch-schedule-ui#266`

**This is a hand-built preview, not a pipeline run.** The demo pipeline (browser
capture agent → motion-graphics agent → Remotion demo compositions) does not
exist yet. These files are the *text artifacts* it is designed to emit,
authored by hand from a real PR (Universal/Local timezone modes) to pressure-test
the schema against a real feature before we build the stages.

## Two demo concepts (both are one-axis comparisons)

A comparison demo holds the scenario state fixed and varies **exactly one axis**:

| Concept | `compare.dimension` | What varies | State B is realized by | Frame labels |
|---|---|---|---|---|
| 1 · before/after | `version` | the **build** (base vs head ref) | checkout + redeploy, re-run scenario | Before / After |
| 2 · settings demo | `setting` | a **setting** in one build (e.g. `timezoneMode`, colorblind on/off) | flip the setting programmatically (localStorage/URL), re-shoot | the mode names |

Both pair into the SAME `beforeAfter` layout (`pipeline/manifest.ts`) — only the
labels and the capture strategy differ. **This example is Concept 2** (a settings
demo of `timezoneMode`); it is NOT a before/after, even though the two frames
resemble one.

## What's here (the text layer — fully producible today)

| File | Role | Analog in the release pipeline |
|---|---|---|
| `story.scenario.yaml` | **source of truth.** Durable `story:` intent + regenerable `scenarios:` mechanics. | the critic-approved manifest |
| `feature-guide.md` | **the changelog replacement** — deterministic render for humans | `CHANGELOG.md` / `RELEASE-NOTES.md` |
| `captures/` | the screenshots/gifs both outputs point at | `video/public/images/` |

Plus two artifacts shown as shape only (not written as files here):

- **`FEATURES.md` index** (target-repo root) — the catalog, newest first:
  ```md
  ## Universal & Local timezone modes — 2026-07-17
  Drop a WO at the customer's local time, no dropdown.
  [guide](docs/features/universal-local-timezone.md) · [video](docs/features/universal-local-timezone.mp4)
  ```
- **`manifest.json`** — the release manifest gains a discriminated `kind`:
  ```jsonc
  { "kind": "demo",              // vs "release" — a union, not an overload of SlideSchema
    "story": "universal-local-timezone",
    "steps": [ /* one per captured scenario step, with narration + effect timeline */ ] }
  ```
- **capture event log** (per step, emitted by the browser agent):
  ```jsonc
  { "action": "click", "selector": "role=radio[name='Local (pick a zone)']",
    "targetBox": {"x":812,"y":344,"w":190,"h":36},   // resolved from the LIVE DOM
    "blurBoxes": [], "screenshotRef": "captures/switch-to-local.gif", "tMs": 8200 }
  ```
  The cursor spline, zoom-before-click, spotlight, and the guide's step numbering
  all hang off this one record.

## What's a GAP (needs the unbuilt stages)

- **`mode-local` / `mode-universal` are real frames** the user captured by hand
  (the same board under each `timezoneMode`); the rest of `captures/` are still
  placeholders needing the browser capture agent on a seeded preview deploy.
  (PR #266's own body: *"Screenshots could not be captured here (no authenticated
  session / preview)"* — the gap.)
- **`universal-local-timezone.mp4`** needs the demo Remotion compositions
  (synthetic cursor / zoom / spotlight / blur over stills+gifs) — none built yet.
  Note the two frames are a settings A/B → they drop straight into the EXISTING
  `comparison` / `beforeAfter` layout (`pipeline/manifest.ts`), labels Local/Universal.

## What hitting a REAL PR taught us (design deltas)

1. **No `data-testid` anywhere in the repo** → scenarios must be semantic
   (role + accessible name / visible text), css only as fallback. The schema
   should make semantic selectors the default shape.
2. **Some preconditions aren't steps.** The device-zone (`America/Chicago`) and
   auth are *environment emulation*, so the schema needs an `env:` block distinct
   from `steps:` — see the yaml.
3. **PR prose lies (harmlessly).** The body's "gear → Configure timeline" is not
   the real path (it's avatar → Settings). Proof that the scenario must be
   *resolved and self-healed against the live DOM*, not lifted from the PR text —
   which is exactly why `story` (durable) and `scenario` (regenerable) are split.
4. **Blur has real stakes here.** Blocks carry customer PII; `blur:` by selector
   is authored intent, and if the data is genuinely sensitive it should be
   redacted at capture, not just in Remotion.
5. **The real frames corrected the feature model.** In Universal mode the suffix
   is *always on* (the axis is a wall-clock, so every block self-identifies), not
   only cross-zone — and the standout behavior is *positional*: two same-local-hour
   jobs STACK at one column. So the scenario needs a **layout assertion**
   (`aligned_left`), and the capture event-log's `targetBox.x` is exactly what
   verifies it — the telemetry doubles as visual-regression truth.
6. **The best demo was in the data, not the prose.** The compelling beat (the
   stack) came from looking at two seeded jobs, not from the PR description. The
   scenario-author agent should reason over *seeded app state*, not just PR text.
7. **"Before/after" and "settings demo" are distinct — don't conflate.** Both are
   one-axis comparisons, but Concept 1 varies the *build* and Concept 2 varies a
   *setting*. The timezone frames look like a before/after and aren't one — the
   difference lives in `compare.dimension`, which also picks the capture strategy
   (two deploys vs one). Scenario = the constant; `compare` = the variable.
