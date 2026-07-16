// Deterministic type sizing — fonts step down as content grows so that any
// schema-valid manifest fits the safe area by construction. The render-time
// SafeAreaGuard is the backstop that catches anything these rules miss.

export function contentTitleSize(title: string): number {
  if (title.length <= 22) return 150;
  if (title.length <= 34) return 120;
  return 96;
}

export function contentBodySize(body: string): { fontSize: number; lineHeight: number } {
  if (body.length <= 220) return { fontSize: 44, lineHeight: 1.6 };
  if (body.length <= 280) return { fontSize: 40, lineHeight: 1.5 };
  return { fontSize: 36, lineHeight: 1.45 };
}

export function outroHeadlineSize(headline: string): number {
  if (headline.length <= 16) return 150;
  if (headline.length <= 24) return 110;
  return 84;
}
