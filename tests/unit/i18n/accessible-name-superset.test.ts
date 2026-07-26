import { describe, expect, it } from 'vitest';

import { catalogues, supportedLocales, type MessageKey } from '$i18n';

/**
 * WCAG 2.5.3 Label in Name: an accessible name has to contain the words a sighted user reads, so a
 * speech-input user saying what they see reaches the control they meant.
 *
 * Every quiet affordance on the place card is a short visible phrase with a longer aria-label that
 * names the Place, and the two are separate catalogue entries. Nothing in the component stops those
 * two entries from drifting apart in one locale, so the contract lives here, in both locales at
 * once.
 */
const labelPairs: ReadonlyArray<{ visible: MessageKey; accessible: MessageKey }> = [
  { visible: 'placeReport.closed', accessible: 'placeReport.closedLabel' },
  { visible: 'placeReport.moved', accessible: 'placeReport.movedLabel' },
  { visible: 'placeReport.unsafe', accessible: 'placeReport.unsafeLabel' },
  { visible: 'placeReport.somethingElse', accessible: 'placeReport.somethingElseLabel' },
  { visible: 'inlineCorrection.reveal', accessible: 'inlineCorrection.revealLabel' },
  { visible: 'inlineCorrection.start', accessible: 'inlineCorrection.startLabelName' },
  { visible: 'inlineCorrection.start', accessible: 'inlineCorrection.startLabelWebsite' },
  { visible: 'inlineCorrection.start', accessible: 'inlineCorrection.startLabelPhone' },
  { visible: 'inlineCorrection.start', accessible: 'inlineCorrection.startLabelAmenities' },
  { visible: 'inlineCorrection.start', accessible: 'inlineCorrection.startLabelRestraint' },
  { visible: 'inlineCorrection.start', accessible: 'inlineCorrection.startLabelArea' },
  { visible: 'inlineCorrection.start', accessible: 'inlineCorrection.startLabelPermission' },
  { visible: 'inlineCorrection.start', accessible: 'inlineCorrection.startLabelEligibility' },
  { visible: 'inlineCorrection.start', accessible: 'inlineCorrection.conditionLinkLabel' },
  { visible: 'inlineCorrection.timingLink', accessible: 'inlineCorrection.timingLinkLabel' },
  { visible: 'place.photos.add', accessible: 'place.photos.addLabel' }
];

describe('accessible names on the contribution affordances', () => {
  for (const locale of supportedLocales) {
    it.each(labelPairs)(
      `keeps the ${locale} accessible name a superset of $visible`,
      ({ visible, accessible }) => {
        expect(catalogues[locale][accessible], `${locale} ${accessible}`).toContain(
          catalogues[locale][visible]
        );
      }
    );
  }
});
