import type { Manifest } from "./manifest";

/**
 * Deterministic renderers for the two written artifacts. No LLM calls here —
 * both documents are projections of content that already passed the critic
 * gate (the manifest) or the editor pass (the technical summary), so the
 * video and the written record can never disagree.
 */

export type Category = "FEATURE" | "IMPROVEMENT" | "FIX" | "BREAKING CHANGE";
export type TechnicalItem = { category: Category; bullet: string };

const CHANGELOG_HEADER = `# Changelog

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
    if (slide.layout === "comparison") lines.push(slide.script, "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** Insert `section` newest-first under the document header, replacing any
 * existing section whose `## ` heading line matches the new one's (so re-runs
 * for the same PR are idempotent). */
function upsert(existing: string | null, section: string, header: string): string {
  const doc = existing && existing.trim().length > 0 ? existing : header;
  const headingLine = section.slice(0, section.indexOf("\n"));
  // Drop an existing section with the same heading (match up to next "## " or EOF).
  const escaped = headingLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withoutDup = doc.replace(new RegExp(`${escaped}[\\s\\S]*?(?=\\n## |$)`, ""), "").trimEnd();
  const firstEntry = withoutDup.search(/\n## /);
  if (firstEntry === -1) return `${withoutDup}\n\n${section.trimEnd()}\n`;
  return `${withoutDup.slice(0, firstEntry)}\n\n${section.trimEnd()}\n${withoutDup.slice(firstEntry)}\n`;
}

export const upsertChangelog = (existing: string | null, section: string) =>
  upsert(existing, section, CHANGELOG_HEADER);

export const upsertReleaseNotes = (existing: string | null, section: string) =>
  upsert(existing, section, RELEASE_NOTES_HEADER);
