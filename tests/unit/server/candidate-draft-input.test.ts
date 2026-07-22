import { describe, expect, it } from 'vitest';

import {
  candidateDraftSectionIds,
  parseCandidateDraftSectionPatch
} from '$server/moderation/candidate-draft-input';

const conditionId = '70000000-0000-4000-8000-000000000002';
const evidenceId = '70000000-0000-4000-8000-000000000003';

function sectionForm(payload: unknown): FormData {
  const formData = new FormData();
  formData.set('sectionPayload', JSON.stringify(payload));
  return formData;
}

describe('Candidate draft section input', () => {
  it('defines the six supported editable sections', () => {
    expect(candidateDraftSectionIds).toEqual([
      'identity',
      'location',
      'translations',
      'details',
      'access_conditions',
      'evidence_records'
    ]);
  });

  it('normalizes a complete identity patch', () => {
    expect(
      parseCandidateDraftSectionPatch(
        'identity',
        sectionForm({ operator: { name: '  Candidate operator  ' }, category: 'cafe' })
      )
    ).toEqual({ operator: { name: 'Candidate operator' }, category: 'cafe' });
  });

  it('normalizes explicit Location fields into the canonical patch', () => {
    const formData = new FormData();
    formData.set('addressLine', ' Corrected street 2 ');
    formData.set('locality', ' Reykjavík ');
    formData.set('postalCode', '101');
    formData.set('municipality', 'reykjavik');
    formData.set('latitude', '64.1466');
    formData.set('longitude', '-21.9426');
    formData.set('geometryPrecision', 'moderator_confirmed_point');
    formData.set('geometrySource', ' Moderator verification ');

    expect(parseCandidateDraftSectionPatch('location', formData)).toEqual({
      location: {
        address_line: 'Corrected street 2',
        locality: 'Reykjavík',
        postal_code: '101',
        municipality: 'reykjavik',
        latitude: 64.1466,
        longitude: -21.9426,
        geometry_precision: 'moderator_confirmed_point',
        geometry_source: 'Moderator verification'
      }
    });
  });

  it('normalizes bilingual translations', () => {
    expect(
      parseCandidateDraftSectionPatch(
        'translations',
        sectionForm({
          translations: {
            is: { name: ' Tillögustaður ', description: ' Íslensk lýsing. ' },
            en: { name: ' Candidate Place ', description: ' English description. ' }
          }
        })
      )
    ).toEqual({
      translations: {
        is: { name: 'Tillögustaður', description: 'Íslensk lýsing.' },
        en: { name: 'Candidate Place', description: 'English description.' }
      }
    });
  });

  it('normalizes nullable details and structured JSON', () => {
    expect(
      parseCandidateDraftSectionPatch(
        'details',
        sectionForm({
          website_url: '',
          phone: ' +354 555 0100 ',
          opening_hours: { monday: ['09:00', '17:00'] },
          dog_amenities: [' water_bowl ', 'treats']
        })
      )
    ).toEqual({
      website_url: null,
      phone: '+354 555 0100',
      opening_hours: { monday: ['09:00', '17:00'] },
      dog_amenities: ['water_bowl', 'treats']
    });
  });

  it('validates and preserves existing Access Condition ids', () => {
    expect(
      parseCandidateDraftSectionPatch(
        'access_conditions',
        sectionForm({
          access_conditions: [
            {
              id: conditionId,
              access_area: 'outdoors',
              access_area_note: null,
              restraint_condition: 'leash_required',
              restraint_note: ' Patio only ',
              dog_eligibility: { scope: 'all_dogs' },
              availability_state: 'whenever_open',
              availability_window: {},
              permission_requirement: 'standing_permission'
            }
          ]
        })
      )
    ).toEqual({
      access_conditions: [
        {
          id: conditionId,
          access_area: 'outdoors',
          access_area_note: null,
          restraint_condition: 'leash_required',
          restraint_note: 'Patio only',
          dog_eligibility: { scope: 'all_dogs' },
          availability_state: 'whenever_open',
          availability_window: {},
          permission_requirement: 'standing_permission'
        }
      ]
    });
  });

  it('allows new Evidence without an id and preserves source metadata', () => {
    expect(
      parseCandidateDraftSectionPatch(
        'evidence_records',
        sectionForm({
          evidence_records: [
            {
              kind: 'official_website',
              source_url: 'https://example.invalid/source',
              source_citation: null,
              source_label: ' Official website ',
              observed_at: '2026-07-21T20:00:00Z',
              source_metadata: { section: 'dogs' }
            }
          ]
        })
      )
    ).toEqual({
      evidence_records: [
        {
          kind: 'official_website',
          source_url: 'https://example.invalid/source',
          source_citation: null,
          source_label: 'Official website',
          observed_at: '2026-07-21T20:00:00Z',
          source_metadata: { section: 'dogs' }
        }
      ]
    });
  });

  it.each([
    ['identity', { operator: { name: 'Venue' }, category: 'cafe', phone: 'overpost' }],
    ['identity', { operator: { name: 'Venue' }, category: 'invalid-category' }],
    ['access_conditions', { access_conditions: [{ id: 'not-a-uuid' }] }],
    [
      'evidence_records',
      {
        evidence_records: [
          {
            id: evidenceId,
            kind: 'official_website',
            source_url: 'not-a-url',
            source_citation: null,
            source_label: 'Source',
            observed_at: 'not-a-date',
            source_metadata: {}
          }
        ]
      }
    ]
  ] as const)('rejects malformed or overposted %s patches', (sectionId, payload) => {
    expect(parseCandidateDraftSectionPatch(sectionId, sectionForm(payload))).toBeNull();
  });
});
