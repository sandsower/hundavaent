import { describe, expect, it } from 'vitest';

import {
  createStandingAccessCondition,
  isAccessAvailableAt,
  isCurrentVerification,
  isDogEligible,
  type Verification
} from '$domain/access';
import { explainAccessCondition } from '$domain/access-explanation';
import { parseAvailabilityWindow, parseDogEligibility } from '$domain/access-schema';
import { hasEvidenceSource, type Evidence } from '$domain/evidence';

describe('Evidence', () => {
  it('records a source claim without becoming a Verification decision', () => {
    const evidence: Evidence = {
      id: 'evidence-1',
      kind: 'official_website',
      sourceUrl: 'https://example.com/dog-access',
      sourceCitation: null,
      sourceLabel: 'Official Place website',
      observedAt: '2026-07-09T10:00:00.000Z',
      recordedBy: 'moderator-1',
      sourceMetadata: {}
    };

    expect(hasEvidenceSource(evidence)).toBe(true);
    expect(evidence).not.toHaveProperty('status');
    expect(evidence).not.toHaveProperty('verifiedAt');
  });
});

describe('Access Condition', () => {
  it('represents the standing access rule without discarding future structured fields', () => {
    const condition = createStandingAccessCondition({
      id: 'condition-1',
      placeId: 'place-1',
      accessArea: 'outdoors',
      restraintCondition: 'leash_required'
    });

    expect(condition).toEqual({
      id: 'condition-1',
      placeId: 'place-1',
      revision: 1,
      accessArea: 'outdoors',
      restraintCondition: 'leash_required',
      permissionRequirement: 'standing_permission',
      dogEligibility: { scope: 'all_dogs' },
      availabilityWindow: {},
      availabilityState: 'not_stated',
      supersededAt: null
    });
  });

  it('explains the canonical inclusive size, carrier, indoor, before-17:00 condition bilingually', () => {
    const condition = {
      id: 'condition-complex',
      placeId: 'place-1',
      revision: 1,
      accessArea: 'indoors' as const,
      restraintCondition: 'carrier_required' as const,
      permissionRequirement: 'standing_permission' as const,
      dogEligibility: { scope: 'restricted' as const, maximumWeightKg: 10 },
      availabilityWindow: { endsAt: '17:00' },
      availabilityState: 'limited' as const,
      supersededAt: null
    };

    expect(explainAccessCondition(condition, 'en')).toBe(
      'Dogs weighing up to and including 10 kg are allowed indoors before 17:00 when carried.'
    );
    expect(explainAccessCondition(condition, 'is')).toBe(
      'Hundar sem eru allt að og með 10 kg mega vera innandyra fyrir kl. 17:00 í burðartösku.'
    );
    expect(isDogEligible(condition.dogEligibility, { weightKg: 10 })).toBe(true);
    expect(isDogEligible(condition.dogEligibility, { weightKg: 10.01 })).toBe(false);
  });

  it('evaluates regular and overnight availability boundaries without treating them as opening hours', () => {
    expect(isAccessAvailableAt({ days: [1], startsAt: '09:00', endsAt: '17:00' }, 1, '09:00')).toBe(
      true
    );
    expect(isAccessAvailableAt({ days: [1], startsAt: '09:00', endsAt: '17:00' }, 1, '17:00')).toBe(
      false
    );
    expect(isAccessAvailableAt({ days: [5], startsAt: '22:00', endsAt: '02:00' }, 5, '23:30')).toBe(
      true
    );
    expect(isAccessAvailableAt({ days: [5], startsAt: '22:00', endsAt: '02:00' }, 6, '01:59')).toBe(
      true
    );
    expect(isAccessAvailableAt({ days: [5], startsAt: '22:00', endsAt: '02:00' }, 6, '02:00')).toBe(
      false
    );
    expect(
      isAccessAvailableAt(
        {
          days: [1],
          startsAt: '09:00',
          endsAt: '17:00',
          startsOn: '2026-06-01',
          endsOn: '2026-08-31'
        },
        1,
        '10:00',
        '2026-06-01'
      )
    ).toBe(true);
    expect(
      isAccessAvailableAt(
        { startsOn: '2026-06-01', endsOn: '2026-08-31' },
        1,
        '10:00',
        '2026-09-01'
      )
    ).toBe(false);
    expect(isAccessAvailableAt({ startsOn: '2026-06-01' }, 1, '10:00')).toBeNull();
    expect(isAccessAvailableAt({ startsAt: '22:00', endsAt: '02:00' }, 3, '22:00')).toBe(true);
    expect(isAccessAvailableAt({ startsAt: '22:00', endsAt: '02:00' }, 4, '01:59')).toBe(true);
    expect(isAccessAvailableAt({ startsAt: '22:00', endsAt: '02:00' }, 4, '02:00')).toBe(false);
    expect(
      isAccessAvailableAt(
        {
          startsAt: '22:00',
          endsAt: '02:00',
          startsOn: '2026-06-01',
          endsOn: '2026-08-31'
        },
        1,
        '01:00',
        '2026-06-01'
      )
    ).toBe(false);
    expect(
      isAccessAvailableAt(
        {
          startsAt: '22:00',
          endsAt: '02:00',
          startsOn: '2026-06-01',
          endsOn: '2026-08-31'
        },
        2,
        '01:00',
        '2026-09-01'
      )
    ).toBe(true);
  });

  it('composes every populated restriction and note bilingually', () => {
    const condition = {
      ...createStandingAccessCondition({
        id: 'condition-complete',
        placeId: 'place-1',
        accessArea: 'indoors',
        restraintCondition: 'leash_required'
      }),
      accessAreaNote: 'rear dining room only',
      restraintNote: 'short lead under one metre',
      dogEligibility: {
        scope: 'restricted' as const,
        maximumWeightKg: 10.5,
        maximumDogs: 2,
        notes: 'calm dogs only'
      },
      availabilityWindow: {
        startsAt: '22:00',
        endsAt: '02:00',
        startsOn: '2026-06-01',
        endsOn: '2026-08-31',
        notes: 'staff confirms the room is available'
      },
      availabilityState: 'limited' as const
    };

    expect(explainAccessCondition(condition, 'en')).toBe(
      'Dogs weighing up to and including 10.5 kg, limited to 2 dogs and matching this restriction: calm dogs only are allowed indoors (rear dining room only) from 22:00 to 02:00 when staff confirms the room is available from 1 June 2026 through 31 August 2026 on a leash (short lead under one metre).'
    );
    expect(explainAccessCondition(condition, 'is')).toBe(
      'Hundar sem eru allt að og með 10,5 kg, að hámarki 2 hundar og sem uppfylla skilyrðið: calm dogs only mega vera innandyra (rear dining room only) frá kl. 22:00 til 02:00 þegar staff confirms the room is available frá 1. júní 2026 til og með 31. ágúst 2026 í taumi (short lead under one metre).'
    );
  });

  it('includes weekday and seasonal bounds in public explanations', () => {
    const condition = {
      ...createStandingAccessCondition({
        id: 'condition-seasonal',
        placeId: 'place-1',
        accessArea: 'outdoors',
        restraintCondition: 'leash_required'
      }),
      availabilityWindow: {
        days: [1],
        startsAt: '10:00',
        endsAt: '16:00',
        startsOn: '2026-06-01',
        endsOn: '2026-08-31'
      },
      availabilityState: 'limited' as const
    };
    expect(explainAccessCondition(condition, 'en')).toContain(
      'on Monday from 10:00 to 16:00 from 1 June 2026 through 31 August 2026'
    );
    expect(explainAccessCondition(condition, 'is')).toContain(
      'á mánudögum frá kl. 10:00 til 16:00 frá 1. júní 2026 til og með 31. ágúst 2026'
    );
  });

  it('rejects unknown or contradictory structured access shapes', () => {
    expect(parseDogEligibility({ scope: 'all_dogs', maximumDogs: 1 })).toBeNull();
    expect(parseDogEligibility({ scope: 'restricted' })).toBeNull();
    expect(
      parseDogEligibility({ scope: 'restricted', notes: 'small breeds', secret: true })
    ).toBeNull();
    expect(parseAvailabilityWindow({ startsOn: '2026-09-01', endsOn: '2026-06-01' })).toBeNull();
    expect(parseAvailabilityWindow({ days: [] })).toBeNull();
    expect(parseAvailabilityWindow({ days: [1, 1] })).toBeNull();
    expect(parseAvailabilityWindow({ startsAt: '10:00', internal: 'private' })).toBeNull();
  });

  it('keeps genuinely missing dimensions unknown in the explanation', () => {
    const condition = createStandingAccessCondition({
      id: 'condition-unknown',
      placeId: 'place-1',
      accessArea: 'designated_area',
      restraintCondition: 'leash_required'
    });

    expect(explainAccessCondition(condition, 'en')).toBe(
      'All dogs are allowed in the designated area on a leash. Access times are unknown.'
    );
    expect(explainAccessCondition(condition, 'is')).toBe(
      'Allir hundar mega vera á afmörkuðu svæði í taumi. Aðgangstímar eru óþekktir.'
    );
  });

  it('describes open-ended control conditions without exposing source terminology', () => {
    const condition = {
      ...createStandingAccessCondition({
        id: 'condition-stated-control',
        placeId: 'place-1',
        accessArea: 'outdoors',
        restraintCondition: 'other_sourced'
      }),
      restraintNote: 'Keep the dog beside you'
    };

    expect(explainAccessCondition(condition, 'en')).toContain(
      'under the stated control rule (Keep the dog beside you)'
    );
    expect(explainAccessCondition(condition, 'en')).not.toContain('source');
    expect(explainAccessCondition(condition, 'is')).toContain(
      'samkvæmt tilgreindri aðhaldsreglu (Keep the dog beside you)'
    );
  });
});

describe('Verification', () => {
  const currentVerification: Verification = {
    id: 'verification-1',
    accessConditionId: 'condition-1',
    status: 'verified',
    verifiedAt: '2026-07-09T11:00:00.000Z',
    freshnessUntil: '2027-01-09T11:00:00.000Z',
    supersededAt: null,
    evidenceIds: ['evidence-1']
  };

  it('is a determination linked to Evidence identifiers rather than an embedded source claim', () => {
    expect(currentVerification.accessConditionId).toBe('condition-1');
    expect(currentVerification.evidenceIds).toEqual(['evidence-1']);
    expect(currentVerification).not.toHaveProperty('sourceUrl');
    expect(currentVerification).not.toHaveProperty('sourceLabel');
  });

  it('is current while verified, fresh, and not superseded even without structured Evidence', () => {
    const evaluatedAt = new Date('2026-12-01T00:00:00.000Z');

    expect(isCurrentVerification(currentVerification, evaluatedAt)).toBe(true);
    expect(isCurrentVerification({ ...currentVerification, status: 'disputed' }, evaluatedAt)).toBe(
      false
    );
    expect(
      isCurrentVerification(
        { ...currentVerification, freshnessUntil: '2026-11-30T23:59:59.000Z' },
        evaluatedAt
      )
    ).toBe(false);
    expect(
      isCurrentVerification(
        { ...currentVerification, supersededAt: '2026-11-01T00:00:00.000Z' },
        evaluatedAt
      )
    ).toBe(false);
    expect(isCurrentVerification({ ...currentVerification, evidenceIds: [] }, evaluatedAt)).toBe(
      true
    );
  });
});
