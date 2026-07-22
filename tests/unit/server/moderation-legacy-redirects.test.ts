import { describe, expect, it } from 'vitest';

import { load as loadSuggestionQueue } from '../../../src/routes/[lang=lang]/moderation/suggestions/+page.server';
import { load as loadCorrectionQueue } from '../../../src/routes/[lang=lang]/moderation/corrections-and-reports/+page.server';

describe('legacy moderation queue routes', () => {
  it.each([
    [
      loadSuggestionQueue,
      'en',
      '/en/moderation?queue=suggestions&filter=actionable'
    ],
    [
      loadCorrectionQueue,
      'is',
      '/is/moderation?queue=corrections-and-reports&filter=actionable'
    ]
  ] as const)('redirects a legacy list to its unified queue', async (load, lang, location) => {
    await expect(
      Promise.resolve().then(() =>
        load({
          params: { lang },
          url: new URL(`http://localhost/${lang}/moderation/legacy?cursorId=discarded`)
        } as never)
      )
    ).rejects.toMatchObject({ status: 308, location });
  });
});
