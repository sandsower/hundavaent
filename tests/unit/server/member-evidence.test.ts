import { describe, expect, it } from 'vitest';

import {
  buildMemberExplanation,
  buildMemberReportEvidence,
  describePlaceFieldCorrection,
  describeRestraintChange
} from '../../../src/lib/server/contributions/member-evidence';

const observedAt = '2026-07-25T09:00:00.000Z';

describe('member report evidence synthesis', () => {
  it('labels a synthesized citation as the server wrote it', () => {
    const evidence = buildMemberReportEvidence({
      note: null,
      changeSummary: 'Restraint condition changed from leash required to off-leash allowed.',
      observedAt,
      surface: 'place-card'
    });

    expect(evidence).toEqual({
      kind: 'member_report',
      source_url: null,
      source_citation: 'Restraint condition changed from leash required to off-leash allowed.',
      source_label: 'Member report from the place page',
      observed_at: observedAt,
      source_metadata: {
        submissionProfile: 'inline-v1',
        surface: 'place-card',
        citationSource: 'synthesized'
      }
    });
  });

  it("labels a member's own words as the member's, and cites them", () => {
    const evidence = buildMemberReportEvidence({
      note: 'Staff told me dogs can be off leash on the terrace.',
      changeSummary: 'Restraint condition changed from leash required to off-leash allowed.',
      observedAt,
      surface: 'place-card'
    });

    expect(evidence.source_citation).toBe('Staff told me dogs can be off leash on the terrace.');
    expect(evidence.source_metadata.citationSource).toBe('member');
  });

  it('treats a blank note as no note rather than an empty citation', () => {
    const evidence = buildMemberReportEvidence({
      note: '   ',
      changeSummary: 'Restraint condition changed from leash required to carrier required.',
      observedAt,
      surface: 'place-card'
    });

    expect(evidence.source_citation).toBe(
      'Restraint condition changed from leash required to carrier required.'
    );
    expect(evidence.source_metadata.citationSource).toBe('synthesized');
  });

  it('names the surface the report came from', () => {
    const evidence = buildMemberReportEvidence({
      note: null,
      changeSummary: 'Correction to the place name.',
      observedAt,
      surface: 'correction-form'
    });

    expect(evidence.source_label).toBe('Member report from the correction form');
    expect(evidence.source_metadata.surface).toBe('correction-form');
  });

  it('never invents a source URL, because a member report has no link to cite', () => {
    expect(
      buildMemberReportEvidence({
        note: 'https://example.invalid/policy',
        changeSummary: 'Restraint condition changed.',
        observedAt,
        surface: 'place-card'
      }).source_url
    ).toBeNull();
  });
});

describe('member explanation synthesis', () => {
  it("prefers the member's own words", () => {
    expect(
      buildMemberExplanation({
        note: 'They now ask that dogs stay in a carrier.',
        changeSummary: 'Restraint condition changed from leash required to carrier required.'
      })
    ).toBe('They now ask that dogs stay in a carrier.');
  });

  it('falls back to the factual change summary when no note was given', () => {
    expect(
      buildMemberExplanation({
        note: null,
        changeSummary: 'Restraint condition changed from leash required to carrier required.'
      })
    ).toBe('Restraint condition changed from leash required to carrier required.');
  });

  it('trims the note so the not-blank database constraint cannot be tripped', () => {
    expect(
      buildMemberExplanation({ note: '  Dogs stay outside.  ', changeSummary: 'A summary.' })
    ).toBe('Dogs stay outside.');
  });
});

describe('change summaries', () => {
  it('names the before value, the after value, and the surface', () => {
    expect(describeRestraintChange('leash_required', 'off_leash_permitted', 'place-card')).toBe(
      'Restraint condition changed from leash required to off-leash allowed, reported from the place card.'
    );
  });

  it('covers every restraint condition the domain defines', () => {
    expect(describeRestraintChange('carrier_required', 'other_sourced', 'place-card')).toBe(
      'Restraint condition changed from carrier required to other stated conditions, reported from the place card.'
    );
  });

  it('describes a place field correction by the field the member chose', () => {
    expect(describePlaceFieldCorrection('opening_hours', 'correction-form')).toBe(
      'Correction to the opening hours, reported from the correction form.'
    );
  });

  it('describes an access condition correction when no place field is targeted', () => {
    expect(describePlaceFieldCorrection(null, 'correction-form')).toBe(
      'Correction to an access condition, reported from the correction form.'
    );
  });
});
