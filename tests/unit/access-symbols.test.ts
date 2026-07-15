import { describe, expect, it } from 'vitest';

import { buildAccessSymbolPresentation, type AccessSymbolCondition } from '$domain/access-symbols';

const base: AccessSymbolCondition = {
  accessArea: 'indoors',
  restraintCondition: 'leash_required',
  permissionRequirement: 'standing_permission',
  dogEligibility: { scope: 'all_dogs' },
  availabilityState: 'whenever_open',
  availabilityWindow: {}
};

describe('access symbol presentation', () => {
  it('always returns the five fixed dimensions for a simple condition', () => {
    expect(buildAccessSymbolPresentation([base])).toEqual({
      kind: 'simple',
      symbols: [
        expect.objectContaining({ dimension: 'area', state: 'indoors' }),
        expect.objectContaining({ dimension: 'restraint', state: 'leash_required' }),
        expect.objectContaining({ dimension: 'permission', state: 'unrestricted' }),
        expect.objectContaining({ dimension: 'dogs', state: 'unrestricted' }),
        expect.objectContaining({ dimension: 'timing', state: 'unrestricted' })
      ]
    });
  });

  it('does not infer welcome whenever open from an empty availability window', () => {
    const presentation = buildAccessSymbolPresentation([
      { ...base, availabilityState: 'not_stated' }
    ]);

    expect(presentation).toMatchObject({
      kind: 'simple',
      symbols: [{}, {}, {}, {}, { dimension: 'timing', state: 'not_stated' }]
    });
  });

  it('uses explicit states for off-leash, carrier, and small dogs', () => {
    const offLeash = buildAccessSymbolPresentation([
      {
        ...base,
        restraintCondition: 'off_leash_permitted',
        dogEligibility: { scope: 'restricted', maximumWeightKg: 10 },
        availabilityState: 'limited',
        availabilityWindow: { endsAt: '17:00' }
      }
    ]);
    const carrier = buildAccessSymbolPresentation([
      { ...base, restraintCondition: 'carrier_required' }
    ]);

    expect(offLeash).toMatchObject({
      kind: 'simple',
      symbols: [
        {},
        { state: 'off_leash_permitted' },
        {},
        { state: 'small_dogs_only' },
        { state: 'limited' }
      ]
    });
    expect(carrier).toMatchObject({
      kind: 'simple',
      symbols: [{}, { state: 'carrier_required' }, {}, {}, {}]
    });
  });

  it('maps outdoor-only and custom rules to special conditions', () => {
    const presentation = buildAccessSymbolPresentation([
      {
        ...base,
        accessArea: 'outdoors',
        restraintCondition: 'other_sourced',
        permissionRequirement: 'advance_approval'
      }
    ]);

    expect(presentation).toMatchObject({
      kind: 'simple',
      symbols: [{ state: 'special' }, { state: 'special' }, { state: 'special' }, {}, {}]
    });
  });

  it('collapses multiple conditions into one complete-details control', () => {
    expect(
      buildAccessSymbolPresentation([
        base,
        { ...base, accessArea: 'outdoors', availabilityState: 'not_stated' }
      ])
    ).toEqual({ kind: 'complex', conditionCount: 2 });
  });
});
