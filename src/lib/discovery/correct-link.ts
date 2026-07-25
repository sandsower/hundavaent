import { resolve } from '$app/paths';

import type { Locale } from '$i18n';

/**
 * The deep links out of the card and into the legacy contribution forms.
 *
 * The deep link into the Correction form, prefilled with the Access Condition it is about.
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

/**
 * The deep link into the legacy Report form, carrying no target at all.
 *
 * The card offers the three claims that are about the whole Place. Everything else a Member might
 * report is form-shaped -- a wrong opening hour, a claim that needs the successor Place named -- and
 * goes to the form that already asks those questions. With no target in the URL the form opens on
 * the whole Place, which is the honest starting point for "something else is wrong".
 */
export function reportPlaceHref(lang: Locale, placeId: string): string {
  return resolve('/[lang=lang]/places/[id]/report', { lang, id: placeId });
}
