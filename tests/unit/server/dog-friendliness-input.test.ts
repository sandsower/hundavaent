import { describe, expect, it } from 'vitest';

import {
  parseRatingExclusionFormData,
  parseRatingFormData,
  parseRatingReinstatementFormData
} from '$server/dog-friendliness/dog-friendliness-input';

function ratingForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    welcomeScore: '4',
    clarityScore: '3',
    comfortScore: '5',
    thoughtfulnessScore: '2',
    ...overrides
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe('Rating input', () => {
  it('parses all four Dimensions scored', () => {
    const result = parseRatingFormData(ratingForm());

    expect(result).toEqual({
      ok: true,
      payload: { welcome: 4, clarity: 3, comfort: 5, thoughtfulness: 2 }
    });
  });

  it('treats an empty field as not applicable', () => {
    const result = parseRatingFormData(ratingForm({ clarityScore: '' }));

    expect(result).toEqual({
      ok: true,
      payload: { welcome: 4, clarity: null, comfort: 5, thoughtfulness: 2 }
    });
  });

  it('treats an explicit "na" value as not applicable', () => {
    const result = parseRatingFormData(ratingForm({ comfortScore: 'na' }));

    expect(result).toEqual({
      ok: true,
      payload: { welcome: 4, clarity: 3, comfort: null, thoughtfulness: 2 }
    });
  });

  it('accepts a Rating where every Dimension but one is not applicable', () => {
    const result = parseRatingFormData(
      ratingForm({ welcomeScore: '', clarityScore: '', comfortScore: '' })
    );

    expect(result).toEqual({
      ok: true,
      payload: { welcome: null, clarity: null, comfort: null, thoughtfulness: 2 }
    });
  });

  it('rejects a Rating where every Dimension is not applicable', () => {
    const result = parseRatingFormData(
      ratingForm({
        welcomeScore: '',
        clarityScore: 'na',
        comfortScore: '',
        thoughtfulnessScore: ''
      })
    );

    expect(result).toEqual({ ok: false, error: 'incomplete' });
  });

  it.each(['0', '6', '3.5', 'five', '-1'])('rejects an out-of-range score %s', (value) => {
    const result = parseRatingFormData(ratingForm({ welcomeScore: value }));

    expect(result).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('Rating exclusion input', () => {
  it('parses a valid exclusion', () => {
    const form = new FormData();
    form.set('exclusionKind', 'fraud');
    form.set('reason', 'Duplicate account signal');

    expect(parseRatingExclusionFormData(form)).toEqual({
      ok: true,
      payload: { exclusionKind: 'fraud', reason: 'Duplicate account signal' }
    });
  });

  it.each(['bogus', ''])('rejects an invalid exclusion kind %s', (kind) => {
    const form = new FormData();
    form.set('exclusionKind', kind);
    form.set('reason', 'Reason');

    expect(parseRatingExclusionFormData(form)).toEqual({ ok: false, error: 'incomplete' });
  });

  it('requires a non-empty reason', () => {
    const form = new FormData();
    form.set('exclusionKind', 'abuse');
    form.set('reason', '   ');

    expect(parseRatingExclusionFormData(form)).toEqual({ ok: false, error: 'incomplete' });
  });
});

describe('Rating reinstatement input', () => {
  it('parses a valid reinstatement', () => {
    const form = new FormData();
    form.set('reason', 'Investigation cleared the account');

    expect(parseRatingReinstatementFormData(form)).toEqual({
      ok: true,
      payload: { reason: 'Investigation cleared the account' }
    });
  });

  it('requires a non-empty reason', () => {
    const form = new FormData();
    form.set('reason', '');

    expect(parseRatingReinstatementFormData(form)).toEqual({ ok: false, error: 'incomplete' });
  });
});
