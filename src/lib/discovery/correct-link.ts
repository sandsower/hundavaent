import { resolve } from '$app/paths';

import type { Locale } from '$i18n';

/**
 * The deep link into the legacy Correction form, prefilled with the Access Condition it is about.
 *
 * Two facts have no inline editor and are not going to get one: opening hours are a loosely typed
 * record with no schema an editor could be built over, and a multi-condition Place has no single
 * Condition a chip could address. Both hand the Member to the form that already handles them, with
 * the Condition chosen for them, rather than leaving the fact uncorrectable.
 */
export function correctConditionHref(lang: Locale, placeId: string, conditionId: string): string {
  const base = resolve('/[lang=lang]/places/[id]/correct', { lang, id: placeId });
  return `${base}?conditionId=${encodeURIComponent(conditionId)}`;
}
