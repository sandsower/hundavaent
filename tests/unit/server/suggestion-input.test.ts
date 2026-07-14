import { describe, expect, it } from 'vitest';

import { parseSuggestionFormData } from '$server/suggestions/suggestion-input';

function completeForm(): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    purpose: 'dog_access_destination',
    operatorName: 'Hundavænt test operator',
    category: 'cafe',
    addressLine: 'Tillögugata 7',
    locality: 'Reykjavík',
    postalCode: '101',
    municipality: 'reykjavik',
    latitude: '64.1466',
    longitude: '-21.9426',
    nameIs: 'Tillögukaffi',
    descriptionIs: 'Hundvæn tillaga.',
    nameEn: 'Suggestion cafe',
    descriptionEn: 'A dog-friendly suggestion.',
    accessArea: 'outdoors',
    restraintCondition: 'leash_required',
    permissionRequirement: 'standing_permission',
    availabilityDays: '1,2,3,4,5',
    evidenceKind: 'member_report',
    evidenceUrl: 'https://example.invalid/source',
    evidenceSourceLabel: 'Member source',
    evidenceObservedAt: '2026-07-11T09:00',
    evidenceExplanation: 'The source explicitly permits dogs outdoors.'
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function simpleForm(): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    purpose: 'dog_access_destination',
    submissionProfile: 'simple-v1',
    name: 'Kaffi Kátur',
    category: 'cafe',
    locationNote: 'Laugavegur, Reykjavík',
    latitude: '64.1466',
    longitude: '-21.9426',
    accessArea: 'outdoors',
    restraintCondition: 'leash_required',
    allDogsWelcome: 'confirmed',
    permissionRequirement: 'ask_on_arrival',
    evidenceKind: 'direct_observation',
    evidenceObservedDate: '2026-07-12',
    evidenceExplanation: 'I visited today and dogs were welcome on the terrace.'
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe('Suggestion input', () => {
  it('adapts the friendly short form into the existing structured proposal', () => {
    const result = parseSuggestionFormData(simpleForm(), {
      locale: 'is',
      now: () => new Date('2026-07-13T12:30:00Z')
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.operator_name).toBe('Kaffi Kátur');
    expect(result.proposal.location).toEqual({
      address_line: 'Laugavegur, Reykjavík',
      locality: 'Reykjavík',
      postal_code: '000',
      municipality: 'reykjavik',
      latitude: 64.1466,
      longitude: -21.9426
    });
    expect(result.proposal.translations).toEqual({
      is: {
        name: 'Kaffi Kátur',
        description: 'I visited today and dogs were welcome on the terrace.'
      },
      en: {
        name: 'Kaffi Kátur',
        description: 'I visited today and dogs were welcome on the terrace.',
        needs_review: true
      }
    });
    expect(result.proposal.access_condition.permission_requirement).toBe('ask_on_arrival');
    expect(result.proposal.evidence).toMatchObject({
      kind: 'direct_observation',
      source_url: null,
      source_citation: 'I visited today and dogs were welcome on the terrace.',
      observed_at: '2026-07-12T12:00:00.000Z',
      explanation: 'I visited today and dogs were welcome on the terrace.',
      source_metadata: { submissionProfile: 'simple-v1', contributorLocale: 'is' }
    });
  });

  it('does not invent a missing observation date, eligibility confirmation, or permission rule', () => {
    const form = simpleForm();
    form.delete('evidenceObservedDate');
    expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'incomplete' });

    form.set('evidenceObservedDate', '2026-07-12');
    form.delete('allDogsWelcome');
    expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'incomplete' });

    form.set('allDogsWelcome', 'confirmed');
    form.delete('permissionRequirement');
    expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'incomplete' });
  });

  it('rejects future and impossible observation dates', () => {
    const future = simpleForm();
    future.set('evidenceObservedDate', '2026-07-14');
    expect(
      parseSuggestionFormData(future, { now: () => new Date('2026-07-13T23:59:59Z') })
    ).toEqual({ ok: false, error: 'invalid' });

    const impossible = simpleForm();
    impossible.set('evidenceObservedDate', '2026-02-30');
    expect(parseSuggestionFormData(impossible)).toEqual({ ok: false, error: 'invalid' });
  });

  it('accepts today as the observation date before noon', () => {
    const today = simpleForm();
    today.set('evidenceObservedDate', '2026-07-13');
    const result = parseSuggestionFormData(today, {
      now: () => new Date('2026-07-13T08:00:00Z')
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.evidence.observed_at).toBe('2026-07-13T12:00:00.000Z');
  });

  it('keeps opening hours separate from Access Condition Availability Windows', () => {
    const form = completeForm();
    form.set('openingHoursNote', 'Weekdays 08:00-17:00');
    form.set('availabilityStartsAt', '10:00');
    form.set('availabilityEndsAt', '16:00');

    const result = parseSuggestionFormData(form);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.opening_hours).toEqual({ note: 'Weekdays 08:00-17:00' });
    expect(result.proposal.access_condition.availability_window).toEqual({
      days: [1, 2, 3, 4, 5],
      startsAt: '10:00',
      endsAt: '16:00'
    });
  });

  it('allows optional facts to remain unknown', () => {
    const result = parseSuggestionFormData(completeForm());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.website_url).toBeNull();
    expect(result.proposal.phone).toBeNull();
    expect(result.proposal.dog_amenities).toEqual([]);
  });

  it('rejects the excluded-purpose excluded pet-service purposes without approximation', () => {
    const form = completeForm();
    form.set('purpose', 'veterinary_clinic');

    expect(parseSuggestionFormData(form)).toEqual({
      ok: false,
      error: 'excluded_purpose'
    });
  });

  it('rejects evidence that has no source reference or explanation', () => {
    const form = completeForm();
    form.delete('evidenceUrl');
    form.delete('evidenceExplanation');

    expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'incomplete' });
  });

  it('rejects malformed map coordinates and availability days', () => {
    const form = completeForm();
    form.set('latitude', 'outside');
    form.set('availabilityDays', '1,8');

    expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'invalid' });
  });

  it('requires sourced notes for the two open-ended access vocabulary values', () => {
    const form = completeForm();
    form.set('accessArea', 'other_bounded');
    form.set('restraintCondition', 'other_sourced');

    expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'incomplete' });

    form.set('accessAreaNote', 'Only the marked rear garden');
    form.set('restraintNote', 'Harness required by the posted rule');
    const result = parseSuggestionFormData(form);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.access_condition.access_area_note).toBe('Only the marked rear garden');
    expect(result.proposal.access_condition.restraint_note).toBe(
      'Harness required by the posted rule'
    );
  });

  it('accepts Moderator corrections to structured opening hours and source metadata', () => {
    const form = completeForm();
    form.set('openingHoursJson', '{"monday":"09:00-17:00"}');
    form.set('sourceMetadataJson', '{"reviewedBy":"moderator"}');

    const result = parseSuggestionFormData(form);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.opening_hours).toEqual({ monday: '09:00-17:00' });
    expect(result.proposal.evidence.source_metadata).toEqual({ reviewedBy: 'moderator' });
  });

  it.each(['ftp://example.invalid/source', 'javascript:alert(1)', 'not a URL'])(
    'rejects a non-HTTP Evidence URL: %s',
    (url) => {
      const form = completeForm();
      form.set('evidenceUrl', url);
      expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'invalid' });
    }
  );

  it('rejects malformed structured correction JSON', () => {
    const form = completeForm();
    form.set('openingHoursJson', '[]');
    expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'invalid' });
  });
});
