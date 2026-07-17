import { stripDeliveryTags } from "./budgets";
import type { Manifest } from "./manifest";

/**
 * Deterministic renderers for the two written artifacts. No LLM calls here —
 * both documents are projections of content that already passed the critic
 * gate (the manifest) or the editor pass (the technical summary), so the
 * video and the written record can never disagree.
 */

export type Category = "FEATURE" | "IMPROVEMENT" | "FIX" | "BREAKING CHANGE";
export type TechnicalItem = { category: Category; bullet: string };

export const CHANGELOG_HEADER = `# Changelog

All notable changes to this project are documented here, newest first.
Entries are generated automatically from merged pull requests by
[release-notes-pipeline](https://github.com/MattDreier/release-notes-pipeline).
Client-facing release notes (with videos) live in [release-notes/](release-notes/RELEASE-NOTES.md).
`;

const RELEASE_NOTES_HEADER = `# Release Notes

Plain-language updates, newest first — each release comes with a short video.
For the technical changelog, see [CHANGELOG.md](../CHANGELOG.md).
`;

/** Keep-a-Changelog heading per category; breaking changes land under Changed with a prefix. */
const HEADING: Record<Category, "Added" | "Changed" | "Fixed"> = {
  FEATURE: "Added",
  IMPROVEMENT: "Changed",
  "BREAKING CHANGE": "Changed",
  FIX: "Fixed",
};

export function changelogSection(entry: {
  version: string;
  date: string;
  pr: number;
  repo: string;
  items: TechnicalItem[];
}): string {
  const groups: Record<"Added" | "Changed" | "Fixed", string[]> = { Added: [], Changed: [], Fixed: [] };
  for (const item of entry.items) {
    const prefix = item.category === "BREAKING CHANGE" ? "**BREAKING:** " : "";
    groups[HEADING[item.category]].push(`- ${prefix}${item.bullet}`);
  }
  const body = (["Added", "Changed", "Fixed"] as const)
    .filter((h) => groups[h].length > 0)
    .map((h) => `### ${h}\n\n${groups[h].join("\n")}`)
    .join("\n\n");
  const prLink = `[#${entry.pr}](https://github.com/${entry.repo}/pull/${entry.pr})`;
  return `## ${entry.version} — ${entry.date} (PR ${prLink})\n\n${body}\n`;
}

export function releaseNotesSection(
  manifest: Manifest,
  opts: { date: string; videoFile: string },
): string {
  const lines: string[] = [
    `## ${manifest.version} — ${opts.date}`,
    "",
    `📺 **[Watch the update](./${opts.videoFile})**`,
    "",
  ];
  for (const slide of manifest.slides) {
    lines.push(`**${slide.title}** \`${slide.type}\``, "");
    if (slide.body) lines.push(slide.body, "");
    if (slide.metrics) {
      for (const m of slide.metrics) lines.push(`- **${m.value}** — ${m.label}`);
      lines.push("");
    }
    if (slide.code) {
      lines.push("```", ...slide.code.lines, "```", "");
    }
    if (slide.gridItems) {
      for (const g of slide.gridItems) lines.push(`- **${g.tag}** — ${g.description}`);
      lines.push("");
    }
    // Comparison slides carry screenshots, not text — the narration script is
    // the only prose that exists for them.
    if (slide.layout === "comparison") lines.push(stripDeliveryTags(slide.script), "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** Identity of a `## ` heading line, for matching a regenerated section to the
 * one it replaces. The changelog keys on the PR number (stable across re-runs
 * even if the computed version or date were to differ); release notes key on
 * the version token. Falls back to the whole heading line. */
const changelogKey = (heading: string) => heading.match(/\(PR \[#(\d+)\]/)?.[1] ?? heading;
const releaseNotesKey = (heading: string) => heading.match(/^## (\S+)/)?.[1] ?? heading;

/** Upsert `section` into the document. A section with the same identity is
 * replaced IN PLACE — regenerating an older version (backfill) must not move
 * it above newer ones (live failure: a regenerated v1.13.0 landed above
 * v1.14.4 and needed hand-reordering). Only a genuinely new section is
 * inserted at the top, since in the normal flow each new PR is the newest. */
function upsert(
  existing: string | null,
  section: string,
  header: string,
  keyOf: (heading: string) => string,
): string {
  const doc = existing && existing.trim().length > 0 ? existing : header;
  const sec = section.trimEnd();
  const nl = sec.indexOf("\n");
  const key = keyOf(nl === -1 ? sec : sec.slice(0, nl));
  const headings = [...doc.matchAll(/^## .*$/gm)];
  const idx = headings.findIndex((m) => keyOf(m[0]) === key);
  if (idx >= 0) {
    // Replace in place: the old section spans from its heading to the next one.
    const start = headings[idx].index!;
    const end = idx + 1 < headings.length ? headings[idx + 1].index! : doc.length;
    const tail = doc.slice(end).trimEnd();
    return `${doc.slice(0, start).trimEnd()}\n\n${sec}\n${tail ? `\n${tail}\n` : ""}`;
  }
  // New section: newest-first, above the first existing entry.
  const first = headings.length > 0 ? headings[0].index! : doc.length;
  const tail = doc.slice(first).trimEnd();
  return `${doc.slice(0, first).trimEnd()}\n\n${sec}\n${tail ? `\n${tail}\n` : ""}`;
}

export const upsertChangelog = (existing: string | null, section: string) =>
  upsert(existing, section, CHANGELOG_HEADER, changelogKey);

export const upsertReleaseNotes = (existing: string | null, section: string) =>
  upsert(existing, section, RELEASE_NOTES_HEADER, releaseNotesKey);
