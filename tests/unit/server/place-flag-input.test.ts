import { describe, expect, it } from 'vitest';

import { parseCorrectionFormData, parseReportFormData } from '$server/place-flags/place-flag-input';

function evidenceValues(): Record<string, string> {
  return {
    evidenceKind: 'direct_observation',
    evidenceUrl: 'https://example.invalid/proof',
    evidenceSourceLabel: 'Called the venue',
    evidenceObservedAt: '2026-07-11T09:00'
  };
}

function placeFieldForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    placeId: '76300000-0000-4000-8000-000000000001',
    explanation: 'The phone number changed.',
    targetKind: 'place_field',
    targetField: 'phone',
    fieldValueText: '+354 555 0199',
    ...evidenceValues(),
    ...overrides
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function accessConditionForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    placeId: '76300000-0000-4000-8000-000000000001',
    explanation: 'The posted policy no longer matches what staff say.',
    targetKind: 'access_condition',
    accessConditionId: '76400000-0000-4000-8000-000000000001',
    accessArea: 'outdoors',
    restraintCondition: 'leash_required',
    permissionRequirement: 'standing_permission',
    ...evidenceValues(),
    ...overrides
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe('Correction input', () => {
  it('parses a Place-field phone Correction', () => {
    const result = parseCorrectionFormData(placeFieldForm());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      target_kind: 'place_field',
      target_field: 'phone',
      access_condition_id: null,
      proposed_value: { value: '+354 555 0199' }
    });
  });

  it('parses bilingual name and description values together', () => {
    const form = placeFieldForm({ targetField: 'name' });
    form.set('fieldValueIs', 'Nýtt heiti');
    form.set('fieldValueEn', 'New name');

    const result = parseCorrectionFormData(form);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.proposed_value).toEqual({ is: 'Nýtt heiti', en: 'New name' });
  });

  it('rejects a name Correction missing one locale', () => {
    const form = placeFieldForm({ targetField: 'name' });
    form.set('fieldValueIs', 'Nýtt heiti');

    expect(parseCorrectionFormData(form)).toEqual({ ok: false, error: 'invalid' });
  });

  it('parses an Access Condition Correction', () => {
    const result = parseCorrectionFormData(accessConditionForm());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      target_kind: 'access_condition',
      target_field: null,
      access_condition_id: '76400000-0000-4000-8000-000000000001',
      proposed_value: {
        access_area: 'outdoors',
        restraint_condition: 'leash_required',
        permission_requirement: 'standing_permission',
        dog_eligibility: { scope: 'all_dogs' }
      }
    });
  });

  it('requires a note when the Access Area is other_bounded', () => {
    const form = accessConditionForm({ accessArea: 'other_bounded' });

    expect(parseCorrectionFormData(form)).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects an incomplete submission missing the private explanation', () => {
    const form = placeFieldForm();
    form.delete('explanation');

    expect(parseCorrectionFormData(form)).toEqual({ ok: false, error: 'incomplete' });
  });

  it('rejects Evidence with neither a source URL nor a citation', () => {
    const form = placeFieldForm();
    form.delete('evidenceUrl');

    expect(parseCorrectionFormData(form)).toEqual({ ok: false, error: 'incomplete' });
  });

  it('parses dog-amenities and opening-hours structured values', () => {
    const amenitiesForm = placeFieldForm({ targetField: 'dog_amenities' });
    amenitiesForm.set('fieldValueList', 'water_bowl, treats');
    const amenitiesResult = parseCorrectionFormData(amenitiesForm);
    expect(amenitiesResult.ok).toBe(true);
    if (amenitiesResult.ok) {
      expect(amenitiesResult.payload.proposed_value).toEqual({ value: ['water_bowl', 'treats'] });
    }

    const hoursForm = placeFieldForm({ targetField: 'opening_hours' });
    hoursForm.set('fieldValueJson', '{"mon":"09:00-17:00"}');
    const hoursResult = parseCorrectionFormData(hoursForm);
    expect(hoursResult.ok).toBe(true);
    if (hoursResult.ok) {
      expect(hoursResult.payload.proposed_value).toEqual({ value: { mon: '09:00-17:00' } });
    }
  });

  it('rejects malformed opening-hours JSON', () => {
    const form = placeFieldForm({ targetField: 'opening_hours' });
    form.set('fieldValueJson', '{not json');

    expect(parseCorrectionFormData(form)).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('Report input', () => {
  function reportForm(overrides: Record<string, string> = {}): FormData {
    const form = accessConditionForm(overrides);
    form.delete('accessArea');
    form.delete('restraintCondition');
    form.delete('permissionRequirement');
    form.set('reportReason', overrides.reportReason ?? 'unsafe');
    return form;
  }

  it('parses a Safety Concern Report', () => {
    const form = reportForm();
    form.set('isSafetyConcern', 'on');

    const result = parseReportFormData(form);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      target_kind: 'access_condition',
      report_reason: 'unsafe',
      is_safety_concern: true,
      successor_place_id: null
    });
  });

  it('defaults is_safety_concern to false when the checkbox is absent', () => {
    const result = parseReportFormData(reportForm());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.is_safety_concern).toBe(false);
  });

  it('accepts a successor Place reference only for the successor_place reason', () => {
    const form = reportForm({ reportReason: 'successor_place' });
    form.set('successorPlaceId', '76300000-0000-4000-8000-000000000002');

    const result = parseReportFormData(form);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.successor_place_id).toBe('76300000-0000-4000-8000-000000000002');
  });

  it('rejects a successor Place reference paired with an unrelated reason', () => {
    const form = reportForm({ reportReason: 'closed' });
    form.set('successorPlaceId', '76300000-0000-4000-8000-000000000002');

    expect(parseReportFormData(form)).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects an unrecognized report reason', () => {
    const form = reportForm({ reportReason: 'not_a_reason' });

    expect(parseReportFormData(form)).toEqual({ ok: false, error: 'invalid' });
  });
});
