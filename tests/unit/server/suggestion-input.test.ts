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

const minimalName = 'Minimal test cafe';

function minimalForm(): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    purpose: 'dog_access_destination',
    submissionProfile: 'minimal-v1',
    name: minimalName,
    latitude: '64.1466',
    longitude: '-21.9426',
    accessArea: 'outdoors'
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function minimalProposal(overrides: Record<string, string> = {}) {
  const form = minimalForm();
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  const result = parseSuggestionFormData(form, {
    locale: 'en',
    now: () => new Date('2026-07-25T10:30:00Z')
  });
  if (!result.ok) throw new Error(`The minimal Suggestion did not parse: ${result.error}`);
  return result.proposal;
}

describe('minimal Suggestion input', () => {
  it('accepts the three answers a Member gives and nothing else', () => {
    const proposal = minimalProposal();

    expect(proposal.operator_name).toBe(minimalName);
    expect(proposal.translations.is.name).toBe(minimalName);
    expect(proposal.translations.en.name).toBe(minimalName);
    expect(proposal.location.latitude).toBe(64.1466);
    expect(proposal.location.longitude).toBe(-21.9426);
    expect(proposal.access_condition.access_area).toBe('outdoors');
  });

  it.each(['indoors', 'outdoors', 'designated_area'] as const)(
    'carries the Member area vocabulary value %s through unchanged',
    (accessArea) => {
      expect(minimalProposal({ accessArea }).access_condition.access_area).toBe(accessArea);
    }
  );

  it('refuses other_bounded, which only means anything with the note this form never asks for', () => {
    const form = minimalForm();
    form.set('accessArea', 'other_bounded');

    expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'invalid' });
  });

  it.each(['name', 'accessArea', 'latitude', 'longitude'])(
    'treats a missing %s as an unanswered question rather than a bad one',
    (field) => {
      const form = minimalForm();
      form.delete(field);

      expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'incomplete' });
    }
  );

  // The form only emits coordinates once the pin has been placed, so a submission with no pin at
  // all is the shape this branch actually meets rather than a hand-built POST.
  it('refuses a submission whose pin was never placed', () => {
    const form = minimalForm();
    form.delete('latitude');
    form.delete('longitude');

    expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'incomplete' });
  });

  it.each(['latitude', 'longitude'])(
    'treats an empty %s as the unanswered pin it is, not a bad coordinate',
    (field) => {
      const form = minimalForm();
      form.set(field, '');

      expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'incomplete' });
    }
  );

  it.each([
    ['latitude', '91'],
    ['longitude', '-181'],
    ['latitude', 'outside']
  ])('rejects an impossible %s of %s', (field, value) => {
    const form = minimalForm();
    form.set(field, value);

    expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'invalid' });
  });

  it('records the category as other rather than guessing what kind of Place it is', () => {
    expect(minimalProposal().category).toBe('other');
  });

  it('states the restraint condition as sourced elsewhere, and says so in the note', () => {
    expect(minimalProposal().access_condition.restraint_condition).toBe('other_sourced');
    expect(minimalProposal().access_condition.restraint_note).toBe('Not stated by the member');
  });

  it('takes the weakest permission claim in the vocabulary', () => {
    expect(minimalProposal().access_condition.permission_requirement).toBe('ask_on_arrival');
  });

  it('claims no timing at all', () => {
    expect(minimalProposal().access_condition.availability_state).toBe('not_stated');
    expect(minimalProposal().access_condition.availability_window).toEqual({});
  });

  it('writes the eligibility shape the Suggestion contract accepts, and no area note', () => {
    expect(minimalProposal().access_condition.dog_eligibility).toEqual({ scope: 'all_dogs' });
    expect(minimalProposal().access_condition.access_area_note).toBeNull();
  });

  it('synthesizes the address line from the pin instead of inferring a place name', () => {
    expect(minimalProposal().location.address_line).toBe('Map pin at 64.1466, -21.9426');
  });

  it('falls back to the capital region rather than inferring a locality from nothing', () => {
    expect(minimalProposal().location).toMatchObject({
      locality: 'Capital region',
      municipality: 'reykjavik',
      postal_code: '000'
    });
  });

  it('localizes the fallback locality for an Icelandic contributor', () => {
    const result = parseSuggestionFormData(minimalForm(), { locale: 'is' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.location.locality).toBe('Höfuðborgarsvæðið');
    expect(result.proposal.location.municipality).toBe('reykjavik');
  });

  it('flags both translations for review, because neither description is Member text', () => {
    const proposal = minimalProposal();

    expect(proposal.translations.is.needs_review).toBe(true);
    expect(proposal.translations.en.needs_review).toBe(true);
    expect(proposal.translations.is.description).toBe('Not stated by the member');
    expect(proposal.translations.en.description).toBe('Not stated by the member');
  });

  it('leaves every optional contact fact unknown', () => {
    const proposal = minimalProposal();

    expect(proposal.website_url).toBeNull();
    expect(proposal.phone).toBeNull();
    expect(proposal.opening_hours).toEqual({});
    expect(proposal.dog_amenities).toEqual([]);
  });

  it('writes the whole Evidence record itself, truthfully labelled and timed', () => {
    expect(minimalProposal().evidence).toEqual({
      kind: 'member_report',
      source_url: null,
      source_citation: 'New place suggestion, reported from the suggestion form.',
      source_label: 'Member report from the suggestion form',
      observed_at: '2026-07-25T10:30:00.000Z',
      explanation: 'New place suggestion, reported from the suggestion form.',
      source_metadata: { submissionProfile: 'minimal-v1', surface: 'suggestion-form' }
    });
  });

  /**
   * The citation reaches anonymous callers through the published profile. The Place name is the
   * only Member text a minimal Suggestion carries, so it must never travel in one - not for an
   * ordinary name, and not for a name a Member wrote to be read by someone else.
   */
  it.each([minimalName, 'Call me on 555-0100', '<script>alert(1)</script>'])(
    'keeps the Member-typed name %s out of every server-written Evidence string',
    (name) => {
      const proposal = minimalProposal({ name });
      const { evidence } = proposal;
      const serverWritten = [
        evidence.source_citation ?? '',
        evidence.source_label,
        evidence.explanation,
        JSON.stringify(evidence.source_metadata),
        proposal.access_condition.restraint_note ?? '',
        proposal.location.address_line
      ];

      expect(proposal.operator_name).toBe(name);
      for (const value of serverWritten) expect(value).not.toContain(name);
    }
  );

  it('refuses an excluded purpose before it reads any answer', () => {
    const form = minimalForm();
    form.set('purpose', 'veterinary_clinic');

    expect(parseSuggestionFormData(form)).toEqual({ ok: false, error: 'excluded_purpose' });
  });
});

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
    form.set('availabilityState', 'limited');
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
    expect(result.proposal.access_condition.availability_state).toBe('limited');
  });

  it('preserves explicit whenever-open timing without manufacturing a window', () => {
    const form = completeForm();
    form.set('availabilityState', 'whenever_open');
    form.delete('availabilityDays');

    const result = parseSuggestionFormData(form);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposal.access_condition).toMatchObject({
      availability_state: 'whenever_open',
      availability_window: {}
    });
  });

  it.each([
    ['not_stated', null, {}],
    ['whenever_open', null, {}],
    ['limited', '1,2', { days: [1, 2] }]
  ] as const)(
    'preserves the named %s state submitted after the schedule disclosure closes',
    (state, days, expectedWindow) => {
      const form = simpleForm();
      form.set('availabilityState', state);
      if (days) form.set('availabilityDays', days);

      const result = parseSuggestionFormData(form);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.proposal.access_condition.availability_state).toBe(state);
      expect(result.proposal.access_condition.availability_window).toEqual(expectedWindow);
    }
  );

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
