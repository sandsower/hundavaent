import { describe, expect, it } from 'vitest';

import {
  buildCandidateCommand,
  parseLeadFile,
  validateLead
} from '../../../scripts/launch-inventory/lead-schema.ts';

function validLeadFixture(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  const leadId = (overrides.leadId as string | undefined) ?? 'fixture-cafe';
  return {
    municipality: 'reykjavik',
    category: 'cafe',
    operatorName: 'Fixture Cafe',
    nameIs: 'Fixture kaffihús',
    nameEn: 'Fixture Cafe',
    descriptionIs: 'Prófunarfærsla.',
    descriptionEn: 'Test fixture entry.',
    confidenceTier: 'reputation_backed',
    needsDirectContact: true,
    geometryNeeded: false,
    websiteUrl: 'https://fixture-cafe.example.invalid/',
    phone: null,
    location: {
      addressLine: 'Fixturegata 1',
      locality: 'Reykjavík',
      postalCode: '101',
      municipality: 'reykjavik',
      latitude: 64.1466,
      longitude: -21.9426,
      geometryPrecision: 'official_address_point',
      geometryNote: 'Fixture coordinates.'
    },
    accessConditions: [
      {
        access_area: 'indoors',
        access_area_note: null,
        restraint_condition: 'leash_required',
        restraint_note: null,
        dog_eligibility: { scope: 'all_dogs' },
        availability_window: {},
        permission_requirement: 'ask_on_arrival'
      }
    ],
    sourceRecords: [
      {
        kind: 'other',
        source_url: 'https://fixture-directory.example.invalid/roundup',
        source_citation: null,
        source_label: 'Fixture directory roundup',
        observed_at: '2026-07-12T00:00:00Z',
        language: 'is',
        verbatim_claim: 'Hundar eru velkomnir.',
        source_metadata: { leadId }
      }
    ],
    moderatorNotes: 'Fixture lead for unit tests.',
    ...overrides,
    leadId
  };
}

describe('launch-inventory lead schema validation', () => {
  it('accepts a well-formed lead', () => {
    const result = validateLead(validLeadFixture());
    expect(result.ok).toBe(true);
  });

  it('rejects a lead that mirrors the malformed geoservice feature (712717): no name, no evidence', () => {
    const malformed = {
      leadId: '',
      municipality: 'reykjavik',
      category: 'park',
      operatorName: '',
      nameIs: '',
      nameEn: '',
      descriptionIs: '',
      descriptionEn: '',
      confidenceTier: 'verified',
      needsDirectContact: false,
      geometryNeeded: false,
      websiteUrl: null,
      phone: null,
      location: {
        addressLine: '',
        locality: '',
        postalCode: '',
        municipality: 'reykjavik',
        latitude: 64.14,
        longitude: -21.9,
        geometryPrecision: 'unknown',
        geometryNote: 'unknown'
      },
      accessConditions: [],
      sourceRecords: [],
      moderatorNotes: 'Malformed record: geoservice feature had no STADUR/TEG/HEIMILD/GAGNAEIGANDI.'
    };

    const result = validateLead(malformed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.length).toBeGreaterThan(0);
    expect(result.rejection.reasons.some((reason) => reason.includes('leadId'))).toBe(true);
    expect(result.rejection.reasons.some((reason) => reason.includes('sourceRecords'))).toBe(true);
    expect(result.rejection.reasons.some((reason) => reason.includes('accessConditions'))).toBe(
      true
    );
  });

  it('rejects an evidence record with neither a source_url nor a source_citation', () => {
    const fixture = validLeadFixture({
      sourceRecords: [
        {
          kind: 'other',
          source_url: null,
          source_citation: null,
          source_label: 'No source at all',
          observed_at: '2026-07-12T00:00:00Z',
          language: 'is',
          verbatim_claim: null,
          source_metadata: { leadId: 'fixture-cafe' }
        }
      ]
    });

    const result = validateLead(fixture);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.rejection.reasons.some((reason) => reason.includes('source_url or a source_citation'))
    ).toBe(true);
  });

  it('rejects an access condition with an invalid municipality, category, or postal code', () => {
    const badMunicipality = validateLead(validLeadFixture({ municipality: 'reykjavik-city' }));
    expect(badMunicipality.ok).toBe(false);

    const badCategory = validateLead(validLeadFixture({ category: 'veterinary_clinic' }));
    expect(badCategory.ok).toBe(false);

    const badPostal = validateLead(
      validLeadFixture({
        location: { ...(validLeadFixture().location as object), postalCode: '10A' }
      })
    );
    expect(badPostal.ok).toBe(false);
  });

  it('requires an access_area_note when access_area is other_bounded', () => {
    const fixture = validLeadFixture({
      accessConditions: [
        {
          access_area: 'other_bounded',
          access_area_note: null,
          restraint_condition: 'leash_required',
          restraint_note: null,
          dog_eligibility: { scope: 'all_dogs' },
          availability_window: {},
          permission_requirement: 'ask_on_arrival'
        }
      ]
    });

    const result = validateLead(fixture);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.some((reason) => reason.includes('access_area_note'))).toBe(
      true
    );
  });

  it('requires a restraint_note when restraint_condition is other_sourced', () => {
    const fixture = validLeadFixture({
      accessConditions: [
        {
          access_area: 'indoors',
          access_area_note: null,
          restraint_condition: 'other_sourced',
          restraint_note: null,
          dog_eligibility: { scope: 'all_dogs' },
          availability_window: {},
          permission_requirement: 'ask_on_arrival'
        }
      ]
    });

    const result = validateLead(fixture);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.some((reason) => reason.includes('restraint_note'))).toBe(true);
  });

  it("requires each source record's source_metadata.leadId to match the lead's own leadId", () => {
    const fixture = validLeadFixture({
      sourceRecords: [
        {
          kind: 'other',
          source_url: 'https://fixture-directory.example.invalid/roundup',
          source_citation: null,
          source_label: 'Fixture directory roundup',
          observed_at: '2026-07-12T00:00:00Z',
          language: 'is',
          verbatim_claim: 'Hundar eru velkomnir.',
          source_metadata: { leadId: 'a-different-lead-id' }
        }
      ]
    });

    const result = validateLead(fixture);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reasons.some((reason) => reason.includes('idempotency key'))).toBe(
      true
    );
  });

  it('rejects a batch entry that is not an object, without throwing', () => {
    const result = validateLead('not an object');
    expect(result.ok).toBe(false);
  });
});

describe('launch-inventory lead file batch parsing', () => {
  it('reports a malformed lead without dropping its well-formed siblings', () => {
    const malformed = { leadId: 'broken' };
    const good1 = validLeadFixture({ leadId: 'fixture-one' });
    const good2 = validLeadFixture({ leadId: 'fixture-two' });

    const { valid, rejected } = parseLeadFile({ leads: [good1, malformed, good2] });

    expect(valid.map((lead) => lead.leadId).sort()).toEqual(['fixture-one', 'fixture-two']);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.leadId).toBe('broken');
    expect(rejected[0]?.reasons.length).toBeGreaterThan(0);
  });

  it('rejects a duplicate leadId as its own reported entry, keeping the first occurrence', () => {
    const first = validLeadFixture({ leadId: 'dup' });
    const second = validLeadFixture({ leadId: 'dup', nameIs: 'Second copy' });

    const { valid, rejected } = parseLeadFile({ leads: [first, second] });

    expect(valid).toHaveLength(1);
    expect(valid[0]?.nameIs).toBe('Fixture kaffihús');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reasons.some((reason) => reason.includes('Duplicate leadId'))).toBe(true);
  });

  it('returns a rejection instead of throwing when the top-level shape is invalid', () => {
    const { valid, rejected } = parseLeadFile({ notLeads: [] });
    expect(valid).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });
});

describe('launch-inventory candidate command mapping', () => {
  it('preserves full provenance (url/citation, observed date, verbatim claim, language) into evidence source_metadata', () => {
    const parsed = validateLead(validLeadFixture());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const command = buildCandidateCommand(parsed.lead);

    expect(command.location.geometry_precision).toBe('official_address_point');
    expect(command.location.geometry_source).toBe('Fixture coordinates.');
    expect(command.evidence_records).toHaveLength(1);
    const evidence = command.evidence_records[0]!;
    expect(evidence.source_url).toBe('https://fixture-directory.example.invalid/roundup');
    expect(evidence.source_citation).toBeNull();
    expect(evidence.observed_at).toBe('2026-07-12T00:00:00Z');
    expect(evidence.source_metadata.verbatimClaim).toBe('Hundar eru velkomnir.');
    expect(evidence.source_metadata.language).toBe('is');
    expect(evidence.source_metadata.leadId).toBe('fixture-cafe');
    expect(evidence.source_metadata.confidenceTier).toBe('reputation_backed');
    expect(evidence.source_metadata.needsDirectContact).toBe(true);
  });

  it('carries geometryNeeded through to evidence so a Moderator can see missing geometry', () => {
    const parsed = validateLead(
      validLeadFixture({
        geometryNeeded: true,
        location: {
          ...(validLeadFixture().location as object),
          geometryPrecision: 'municipality_anchor_pending_geocode',
          geometryNote: 'Placeholder anchor, not the real site.'
        }
      })
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const command = buildCandidateCommand(parsed.lead);
    expect(command.evidence_records[0]?.source_metadata.geometryNeeded).toBe(true);
    expect(command.evidence_records[0]?.source_metadata.geometryNote).toBe(
      'Placeholder anchor, not the real site.'
    );
  });

  it('never produces a shape usable for publication - only Candidate-creation fields exist', () => {
    const parsed = validateLead(validLeadFixture());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const command = buildCandidateCommand(parsed.lead) as unknown as Record<string, unknown>;
    const forbiddenPublicationKeys = [
      'place_id',
      'expected_version',
      'verification_id',
      'freshness_until',
      'published_at',
      'condition_verifications'
    ];
    for (const key of forbiddenPublicationKeys) {
      expect(Object.keys(command)).not.toContain(key);
    }
    expect(Object.keys(command).sort()).toEqual(
      [
        'access_conditions',
        'category',
        'dog_amenities',
        'evidence_records',
        'location',
        'opening_hours',
        'operator',
        'phone',
        'translations',
        'website_url'
      ].sort()
    );
  });
});
