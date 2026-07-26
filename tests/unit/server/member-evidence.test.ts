import { describe, expect, it } from 'vitest';

import {
  buildMemberExplanation,
  buildMemberReportEvidence,
  buildMemberSuggestionEvidence,
  describeAreaChange,
  describeEligibilityChange,
  describePermissionChange,
  describePlaceFieldCorrection,
  describePlaceReport,
  describePlaceSuggestion,
  describeRestraintChange
} from '../../../src/lib/server/contributions/member-evidence';

const observedAt = '2026-07-25T09:00:00.000Z';

describe('member report evidence synthesis', () => {
  it('cites the server summary and records that no member note was given', () => {
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
        memberNoteProvided: false
      }
    });
  });

  it("never copies the member's private words into the citation, only flags that they exist", () => {
    // The citation reaches private.evidence when a Moderator applies the Correction, and
    // public.get_published_place_profile returns it to anonymous callers. The Member is promised
    // their explanation is never published, so it must not travel in Evidence at all.
    const note = 'Staff told me dogs can be off leash on the terrace.';
    const evidence = buildMemberReportEvidence({
      note,
      changeSummary: 'Restraint condition changed from leash required to off-leash allowed.',
      observedAt,
      surface: 'place-card'
    });

    expect(evidence.source_citation).toBe(
      'Restraint condition changed from leash required to off-leash allowed.'
    );
    expect(JSON.stringify(evidence)).not.toContain(note);
    expect(evidence.source_metadata.memberNoteProvided).toBe(true);
  });

  it('treats a blank note as no note', () => {
    const evidence = buildMemberReportEvidence({
      note: '   ',
      changeSummary: 'Restraint condition changed from leash required to carrier required.',
      observedAt,
      surface: 'place-card'
    });

    expect(evidence.source_citation).toBe(
      'Restraint condition changed from leash required to carrier required.'
    );
    expect(evidence.source_metadata.memberNoteProvided).toBe(false);
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

  it('keeps the member note out of every evidence field, not just the citation', () => {
    const note = 'The manager said it is because of a neighbour complaint.';
    const evidence = buildMemberReportEvidence({
      note,
      changeSummary: 'Restraint condition changed.',
      observedAt,
      surface: 'correction-form'
    });

    for (const value of Object.values(evidence)) {
      expect(JSON.stringify(value)).not.toContain(note);
    }
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

  it('names the before area, the after area, and the surface', () => {
    expect(describeAreaChange('indoors', 'designated_area', 'place-card')).toBe(
      'Access area changed from indoors to a designated area, reported from the place card.'
    );
  });

  it('covers every access area the domain defines', () => {
    expect(describeAreaChange('other_bounded', 'outdoors', 'correction-form')).toBe(
      'Access area changed from another stated area to outdoors, reported from the correction form.'
    );
  });

  it('covers every permission requirement the domain defines', () => {
    expect(describePermissionChange('standing_permission', 'ask_on_arrival', 'place-card')).toBe(
      'Permission requirement changed from standing permission to ask on arrival, reported from the place card.'
    );
    expect(
      describePermissionChange('advance_approval', 'standing_permission', 'correction-form')
    ).toBe(
      'Permission requirement changed from advance approval to standing permission, reported from the correction form.'
    );
  });

  it('names an eligibility by the shape of its limit, never by the figure', () => {
    expect(
      describeEligibilityChange(
        { scope: 'restricted', maximumDogs: 2 },
        { scope: 'restricted', maximumWeightKg: 12 },
        'place-card'
      )
    ).toBe(
      'Dog eligibility changed from a limit on the number of dogs to a weight limit, reported from the place card.'
    );
  });

  it('folds every eligibility the member cannot choose into one structural label', () => {
    // A sourced eligibility note is Moderator text and the citation can be published, so the
    // stored shape is named rather than quoted.
    expect(
      describeEligibilityChange(
        { scope: 'restricted', maximumWeightKg: 10, notes: 'Ask about large breeds.' },
        { scope: 'all_dogs' },
        'place-card'
      )
    ).toBe(
      'Dog eligibility changed from other stated restrictions to all dogs, reported from the place card.'
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

  it('names a place-level report by its reason and the surface it came from', () => {
    expect(describePlaceReport('closed', 'place-card')).toBe(
      'Reported closed from the place card.'
    );
    expect(describePlaceReport('moved', 'place-card')).toBe('Reported moved from the place card.');
    expect(describePlaceReport('unsafe', 'place-card')).toBe(
      'Reported unsafe for dogs from the place card.'
    );
  });

  it('names the report form as its own surface', () => {
    expect(describePlaceReport('closed', 'report-form')).toBe(
      'Reported closed from the report form.'
    );
  });

  it('builds a report summary from fixed labels alone, whatever the member wrote', () => {
    // The property, not one example: the summary becomes the Evidence citation, which reaches
    // anonymous callers through the published profile. A summary is only ever one of nine
    // sentences, so no member free text can ride out on one.
    const summaries = (['closed', 'moved', 'unsafe'] as const).flatMap((reason) =>
      (['place-card', 'correction-form', 'report-form'] as const).map((surface) =>
        describePlaceReport(reason, surface)
      )
    );

    for (const summary of summaries) {
      expect(summary).toMatch(
        /^Reported (closed|moved|unsafe for dogs) from the (place card|correction form|report form)\.$/
      );
    }
    expect(new Set(summaries).size).toBe(9);
  });

  it('keeps the member note out of a report citation and in the explanation alone', () => {
    const note = 'The gate was chained shut and a neighbour said it shut for good in May.';
    const changeSummary = describePlaceReport('closed', 'place-card');
    const evidence = buildMemberReportEvidence({
      note,
      changeSummary,
      observedAt,
      surface: 'place-card'
    });

    expect(buildMemberExplanation({ note, changeSummary })).toBe(note);
    expect(evidence.source_citation).toBe('Reported closed from the place card.');
    expect(JSON.stringify(evidence)).not.toContain('neighbour');
    expect(evidence.source_metadata.memberNoteProvided).toBe(true);
  });

  it('writes a minimal Suggestion its whole Evidence record from fixed strings', () => {
    const evidence = buildMemberSuggestionEvidence({
      changeSummary: describePlaceSuggestion('suggestion-form'),
      observedAt,
      surface: 'suggestion-form'
    });

    expect(evidence).toEqual({
      kind: 'member_report',
      source_url: null,
      source_citation: 'New place suggestion, reported from the suggestion form.',
      source_label: 'Member report from the suggestion form',
      observed_at: observedAt,
      explanation: 'New place suggestion, reported from the suggestion form.',
      source_metadata: { submissionProfile: 'minimal-v1', surface: 'suggestion-form' }
    });
  });

  it('names the surface a Suggestion came from and nothing about the Place itself', () => {
    // A minimal Suggestion carries exactly one piece of member text, the Place name, and the
    // summary this builds becomes the Evidence citation an anonymous caller can read.
    const summaries = (
      ['place-card', 'correction-form', 'report-form', 'suggestion-form'] as const
    ).map((surface) => describePlaceSuggestion(surface));

    for (const summary of summaries) {
      expect(summary).toMatch(
        /^New place suggestion, reported from the (place card|correction form|report form|suggestion form)\.$/
      );
    }
    expect(new Set(summaries).size).toBe(4);
  });
});
