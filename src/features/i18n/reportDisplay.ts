import type { TFunction } from "i18next";

/** Resolves stored i18n keys; unknown strings pass through via defaultValue. */
export function reportDisplayText(t: TFunction, value: string): string {
  return String(t(value, { defaultValue: value }));
}
