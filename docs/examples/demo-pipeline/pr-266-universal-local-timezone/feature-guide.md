<!--
  GENERATED ARTIFACT — the changelog-replacement in the demo pipeline.
  kind: settings-demo (Concept 2). Rendered deterministically from
  story.scenario.yaml + captures; guide and video share one source.
  The two captures are the same seeded board under two settings — only the
  `timezoneMode` differs. Lands as docs/features/universal-local-timezone.md
-->

# Universal vs Local time mode

> **Setting:** _Configure timeline → Time zone_ · **For:** dispatchers covering
> more than one timezone · 40-second walkthrough ▸ [video](./universal-local-timezone.mp4)
>
> _dispatch-schedule-ui · [PR #266](https://github.com/MattDreier/dispatch-schedule-ui/pull/266)_

Same board, same two jobs — the only thing that changes below is the **Time zone
mode** setting.

## Local — the board reads in one zone

![Local mode: Hoffman at 10am, Donnelly at 11am, no tags](./captures/mode-local.png)

Every job is shown in a single chosen zone. **Hoffman** reads `10:00am`,
**Donnelly** reads `11:00am` and sits an hour to the right. Clean, but both were
actually booked for **10am the customer's local time** — Donnelly's site is
Central — and that hour of difference is invisible.

## Universal — each job in the customer's local time

![Universal mode: both jobs at 10am, tagged EDT and CDT, stacked](./captures/mode-universal.png)

Donnelly now reads **`10:00am – 11:30am CDT`** and lines up **directly under**
Hoffman's **`10:00am – 11:30am EDT`**. Both customers get a 10am visit, so both
blocks sit at 10am — and each block **tags its own zone**, so you can see they're
an hour apart in real time. Jobs that share a local hour share a column.

> **Hover any block** in Universal for both clocks: `10:00–11:30am CDT (site) ·
> 11:00am–12:30pm EDT (you)`.

## Switching

Open the **account menu → Settings**, and under _Configure timeline → Time zone_
choose **Universal** or **Local**. Universal is the default. Choosing **Local**
also relabels the hour axis to the picked zone and shows a persistent
**`Viewing in <ZONE>`** badge in the toolbar.

---

<sub>The choice persists on this device. Shipping next: the dominant drag-lens
ruler, and editing a drop-confirm time directly in the site's zone.</sub>
