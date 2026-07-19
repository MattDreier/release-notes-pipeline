# Worked example — demo-pipeline output for `dispatch-schedule-ui#266`

**This is a hand-built preview, not a pipeline run.** The demo pipeline (browser
capture agent → motion-graphics agent → Remotion demo compositions) does not
exist yet. These files are the *text artifacts* it is designed to emit,
authored by hand from a real PR (Universal/Local timezone modes) to pressure-test
the schema against a real feature before we build the stages.

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

- **`captures/*` are placeholders.** Real frames need the browser capture agent
  driving a seeded preview deploy. Fitting, since PR #266's own body says
  *"Screenshots could not be captured here (no authenticated session / preview)"* —
  that's precisely the gap this pipeline closes.
- **`universal-local-timezone.mp4`** needs the demo Remotion compositions
  (synthetic cursor / zoom / spotlight / blur over stills+gifs) — none built yet.

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
