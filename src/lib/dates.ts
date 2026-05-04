export function nowIso(): string {
  return new Date().toISOString();
}

/** Short date for UI in a locale (e.g. en-US vs ja-JP). */
export function formatDateShort(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}
