<!--
  GENERATED ARTIFACT — the changelog-replacement in the demo pipeline.
  Rendered deterministically (no LLM) from story.scenario.yaml + captures +
  the approved manifest, so this guide and the video cannot disagree.
  In a real run the [capture: …] slots are the exact frames the video used.
  Lands in the TARGET repo as docs/features/universal-local-timezone.md
-->

# Universal & Local timezone modes

> **For:** a dispatcher covering sites in another timezone.
> **You'll be able to:** drop a work order at the customer's local time — "10am
> at the site" — with no dropdown and no mental math.
>
> _Feature #261 · [PR #266](https://github.com/MattDreier/dispatch-schedule-ui/pull/266) · 90-second walkthrough ▸ [video](./universal-local-timezone.mp4)_

The board now speaks the **customer's** local time by default, and tags a time
whenever it isn't yours — so a cross-zone drop can't quietly land an hour off.

---

### 1. Every job already reads in its own local time

![The board, viewed on a Central-time laptop](./captures/suffix-rule.png)

You're in Kansas City — Central time. The job at the **St. Petersburg, FL** site
reads **`10:00am EDT`**: the customer's local time, tagged `EDT` so you know it
isn't your zone. The Central-time job beside it stays clean — **`9:00am`**, no
tag. That's the whole rule: **a zone suffix appears only when the time isn't the
one your axis is in.**

### 2. Hover to see both clocks

![Tooltip showing site time and your time](./captures/tooltip-dual.gif)

Hovering a block spells it out in full: **`10:00–11:00am EDT (site) · 9:00–10:00am
CDT (you)`**. If a site's zone had to be assumed (missing coordinates), the
tooltip says so.

### 3. Drag, and the job keeps speaking site time

![Dragging the Florida job; the ghost reads EDT](./captures/drag-ghost.gif)

Pick up the St. Petersburg job and the drag ghost stays in **site** time — still
`EDT`. You're aiming at the customer's clock the whole way.

### 4. The drop confirmation leads with the customer's time

![Confirm dialog: Arrive 10:00am EDT · 9:00am CDT your time](./captures/confirm-lead.png)

> **Arrive 10:00am EDT** · 9:00am CDT your time

The confirmation puts the customer's time first and yours in the small print —
the last check against a wrong-hour drop.

---

## Optional: pin the whole board to one zone (Local mode)

By default you're in **Universal** mode — every block shows its own site time.
If you'd rather read the entire board in one fixed zone:

### 5. Open settings → Configure timeline → Time zone

![The Configure timeline dialog, Time zone section](./captures/settings-open.png)

Open the **account menu**, choose **Settings**, and find the **Time zone**
section of _Configure timeline_.

### 6. Switch to Local and pick a zone

![Switching to Local mode and choosing Eastern](./captures/switch-to-local.gif)

Choose **Local (pick a zone)** and select **Eastern**. Now the whole board reads
in Eastern regardless of where each site is.

### 7. The board tells you it isn't in your zone

![The 'Viewing in EDT' indicator in the toolbar](./captures/viewing-indicator.png)

The hour axis relabels to Eastern, and a persistent **`Viewing in EDT`** badge
stays in the toolbar — so you never forget the board isn't in your device's zone.

---

<sub>Not yet wired (shipping next): the dominant drag-lens ruler, and editing the
confirm time directly in site zone. The suffix, dual tooltip, and site-led
confirm cover the cross-zone case today.</sub>
