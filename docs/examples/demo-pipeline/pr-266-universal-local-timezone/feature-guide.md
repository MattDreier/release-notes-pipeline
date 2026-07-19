<!--
  GENERATED ARTIFACT — the changelog-replacement in the demo pipeline.
  Rendered deterministically (no LLM) from story.scenario.yaml + captures.
  This guide and the video render from the same source, so they can't disagree.
  Captures here == the two real board frames (single-zone vs Universal).
  Lands in the target repo as docs/features/universal-local-timezone.md
-->

# Universal & Local timezone modes

> **For:** a dispatcher covering technicians in more than one timezone.
> **You'll be able to:** read and drop every job at the customer's local time —
> "10am at the site" — with no dropdown and no mental math.
>
> _Feature #261 · [PR #266](https://github.com/MattDreier/dispatch-schedule-ui/pull/266) · 60-second walkthrough ▸ [video](./universal-local-timezone.mp4)_

## The problem, in one board

![Board in a single timezone: Hoffman at 10am, Donnelly at 11am](./captures/before-single-zone.png)

Two roof inspections. **Hoffman** (Marcus Chen) reads **10:00am**; **Donnelly**
(Priya Patel) reads **11:00am** and sits an hour to the right. Except both were
booked for **10am — the customer's local time**. Hoffman's site is Eastern,
Donnelly's is Central. On a single-zone board, that hour of difference is
invisible until someone does the math.

## Turn on Universal mode

Open the **account menu → Settings**, and in _Configure timeline → Time zone_
choose **Universal**. (It's the default for new boards.)

## The same board, now in everyone's local time

![Universal mode: both jobs at 10am, tagged EDT and CDT, stacked](./captures/after-universal.png)

Donnelly jumps to **`10:00am – 11:30am CDT`** and lines up **directly under**
Hoffman's **`10:00am – 11:30am EDT`**. Both customers are getting a 10am visit,
so both blocks sit at 10am — and each block **tags its own zone** so you can see,
at a glance, that they're actually an hour apart in real time.

That's the whole rule: **in Universal mode every job shows its own site-local
time, zone-tagged.** Jobs that share a local hour share a column.

> **Hover any block** for both clocks at once: `10:00–11:30am CDT (site) ·
> 11:00am–12:30pm EDT (you)`.

## Prefer one fixed zone? Use Local

In the same **Time zone** setting, choose **Local** and pick a zone. The whole
board reads in that single zone, the hour axis relabels to it, and a persistent
**`Viewing in <ZONE>`** badge appears in the toolbar so you never forget the
board isn't in your device's zone.

---

<sub>Shipping next: the dominant drag-lens ruler, and editing the drop-confirm
time directly in the site's zone. Today the always-on suffix, the dual-time
tooltip, and a site-led drop confirmation carry the cross-zone case.</sub>
