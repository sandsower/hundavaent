import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import '../../src/app.css';
import { catalogues } from '$i18n';
import type { PublishedPlaceProfile } from '$server/discovery/public-places';
import type { ModerationPlaceFlag } from '$server/place-flags/place-flags';
import MemberFlagsPage from '../../src/routes/[lang=lang]/account/corrections-and-reports/+page.svelte';
import FlagReviewPage from '../../src/routes/[lang=lang]/moderation/corrections-and-reports/[id]/+page.svelte';
import CorrectionPage from '../../src/routes/[lang=lang]/places/[id]/correct/+page.svelte';
import ReportPage from '../../src/routes/[lang=lang]/places/[id]/report/+page.svelte';

const place: PublishedPlaceProfile = {
  placeId: '76300000-0000-4000-8000-000000000001',
  name: 'Flagged Cafe',
  description: 'Original description.',
  category: 'cafe',
  wheelchairAccessibility: 'unknown',
  location: {
    addressLine: 'Flag Street 1',
    locality: 'Reykjavík',
    postalCode: '101',
    latitude: 64.15,
    longitude: -21.95
  },
  websiteUrl: 'https://example.invalid/flag-cafe',
  phone: '+354 555 0100',
  openingHours: {},
  dogAmenities: [],
  accessConditions: [
    {
      id: '76400000-0000-4000-8000-000000000001',
      accessArea: 'indoors',
      accessAreaNote: null,
      restraintCondition: 'leash_required',
      restraintNote: null,
      dogEligibility: { scope: 'all_dogs' },
      availabilityWindow: {},
      availabilityState: 'not_stated',
      permissionRequirement: 'standing_permission',
      accessInformationUrls: []
    }
  ],
  dogFriendlinessSummary: {
    placeId: '76300000-0000-4000-8000-000000000001',
    visible: false,
    eligibleCount: null,
    trailingTwelveMonthCount: null,
    dimensions: [],
    overallMean: null,
    overallVisible: false
  },
  photos: []
};

const correctionFlag: ModerationPlaceFlag = {
  itemVersion: 1,
  draftVersion: 0,
  draftPayload: null,
  draftUpdatedBy: null,
  draftUpdatedAt: null,
  flagId: '90000000-0000-4000-8000-000000000001',
  memberId: '76000000-0000-4000-8000-000000000001',
  kind: 'correction',
  outcome: 'submitted',
  placeId: place.placeId,
  placeNameIs: 'Flögguð kaffihús',
  placeNameEn: place.name,
  targetKind: 'place_field',
  targetField: 'phone',
  accessConditionId: null,
  currentValueSnapshot: { value: '+354 555 0100' },
  currentLiveValue: { value: '+354 555 0100' },
  currentPlaceVersion: 1,
  currentVerificationId: null,
  currentVerificationStatus: null,
  currentVerificationVerifiedAt: null,
  currentVerificationFreshnessUntil: null,
  currentVerificationEvidence: null,
  proposedValue: { value: '+354 555 0199' },
  reportReason: null,
  isSafetyConcern: false,
  successorPlaceId: null,
  explanation: 'The phone number changed.',
  evidence: {
    kind: 'direct_observation',
    source_url: 'https://example.invalid/proof',
    source_citation: null,
    source_label: 'Called the venue',
    observed_at: '2026-07-11T09:00:00Z',
    source_metadata: {}
  },
  privateNote: null,
  appliedAccessConditionId: null,
  disputeId: null,
  transitionId: null,
  contributionId: null,
  submittedAt: '2026-07-11T09:00:00Z',
  updatedAt: '2026-07-11T09:00:00Z'
};

const reportFlag: ModerationPlaceFlag = {
  ...correctionFlag,
  flagId: '90000000-0000-4000-8000-000000000002',
  kind: 'report',
  targetKind: 'access_condition',
  targetField: null,
  accessConditionId: place.accessConditions[0].id,
  currentValueSnapshot: {
    access_area: 'indoors',
    access_area_note: null,
    restraint_condition: 'leash_required',
    restraint_note: null,
    dog_eligibility: { scope: 'all_dogs' },
    availability_window: {},
    permission_requirement: 'standing_permission'
  } as never,
  currentVerificationId: '76600000-0000-4000-8000-000000000001',
  currentVerificationStatus: 'verified',
  currentVerificationVerifiedAt: '2026-01-01T00:00:00Z',
  currentVerificationFreshnessUntil: '2030-01-01T00:00:00Z',
  currentVerificationEvidence: [
    {
      kind: 'official_website',
      sourceUrl: 'https://example.invalid/flag-cafe',
      sourceCitation: null,
      sourceLabel: 'Original policy',
      observedAt: '2026-01-01T00:00:00Z'
    }
  ],
  proposedValue: null,
  reportReason: 'unsafe',
  isSafetyConcern: true,
  privateNote: 'Escalated informally; venue contacted.'
};

describe('Member Correction and Report submission', () => {
  it.each([
    ['is', 'Leggja til leiðréttingu', 'Senda einkaleiðréttingu'],
    ['en', 'Suggest a correction', 'Send private Correction']
  ] as const)(
    'renders the keyboard-accessible %s Correction form',
    (lang, heading, submitLabel) => {
      render(CorrectionPage, {
        params: { lang, id: place.placeId },
        data: {
          lang,
          copy: catalogues[lang],
          signInUrl: null,
          place,
          presetField: 'phone',
          presetConditionId: null
        },
        form: null
      } as never);

      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
      expect(screen.getByLabelText(catalogues[lang]['correction.explanation'])).toBeTruthy();
      expect(screen.getByRole('button', { name: submitLabel })).toBeTruthy();
    }
  );

  it.each(['is', 'en'] as const)(
    'never asks a %s Member to construct an Evidence record',
    (lang) => {
      render(CorrectionPage, {
        params: { lang, id: place.placeId },
        data: {
          lang,
          copy: catalogues[lang],
          signInUrl: null,
          place,
          presetField: 'phone',
          presetConditionId: null
        },
        form: null
      } as never);

      expect(screen.queryByText(catalogues[lang]['evidenceField.section'])).toBeNull();
      for (const field of [
        'evidenceField.kind',
        'evidenceField.label',
        'evidenceField.url',
        'evidenceField.citation',
        'evidenceField.observedAt'
      ] as const) {
        expect(screen.queryByLabelText(catalogues[lang][field])).toBeNull();
      }
      // The Member still explains the change in their own words; only the Moderator worksheet is gone.
      expect(screen.getByLabelText(catalogues[lang]['correction.explanation'])).toBeTruthy();
    }
  );

  it('preselects an Access Condition target from the query preset', () => {
    render(CorrectionPage, {
      params: { lang: 'en', id: place.placeId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        signInUrl: null,
        place,
        presetField: null,
        presetConditionId: place.accessConditions[0].id
      },
      form: null
    } as never);

    expect((screen.getByLabelText('What are you correcting?') as HTMLSelectElement).value).toBe(
      'access_condition'
    );
    expect(screen.getAllByText('Dogs are generally allowed').length).toBeGreaterThan(0);
    expect((screen.getByLabelText('When are dogs welcome?') as HTMLSelectElement).value).toBe(
      'not_stated'
    );
  });

  it('preserves whenever-open timing when correcting another Access Condition field', () => {
    const wheneverOpenPlace = {
      ...place,
      accessConditions: [
        { ...place.accessConditions[0], availabilityState: 'whenever_open' as const }
      ]
    };
    render(CorrectionPage, {
      params: { lang: 'en', id: place.placeId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        signInUrl: null,
        place: wheneverOpenPlace,
        presetField: null,
        presetConditionId: place.accessConditions[0].id
      },
      form: null
    } as never);

    expect((screen.getByLabelText('When are dogs welcome?') as HTMLSelectElement).value).toBe(
      'whenever_open'
    );
    expect(screen.queryByLabelText('Dog access starts at')).toBeNull();
  });

  it('announces the fail-closed abuse boundary without rendering a usable Correction form', () => {
    render(CorrectionPage, {
      params: { lang: 'en', id: place.placeId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        signInUrl: null,
        place,
        presetField: null,
        presetConditionId: null
      },
      form: { error: 'policy_unavailable' }
    } as never);

    expect(screen.getByRole('alert').textContent).toContain(
      'Corrections cannot be accepted until the service abuse policy has been activated.'
    );
    expect(
      (screen.getByRole('button', { name: 'Send private Correction' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it('renders the Report form with the Safety Concern control and disclaimer', () => {
    render(ReportPage, {
      params: { lang: 'en', id: place.placeId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        signInUrl: null,
        place,
        presetField: null,
        presetConditionId: null
      },
      form: null
    } as never);

    expect(screen.getByRole('heading', { name: 'Report a problem' })).toBeTruthy();
    expect(screen.getByLabelText('This is a Safety Concern')).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('112');
    expect(screen.getByLabelText('What kind of problem is this?')).toBeTruthy();
  });

  it.each(['is', 'en'] as const)(
    'never asks a %s Member to fill in the Moderator Evidence worksheet',
    (lang) => {
      render(ReportPage, {
        params: { lang, id: place.placeId },
        data: {
          lang,
          copy: catalogues[lang],
          signInUrl: null,
          place,
          presetField: null,
          presetConditionId: null,
          presetReason: null
        },
        form: null
      } as never);

      for (const key of [
        'evidenceField.section',
        'evidenceField.kind',
        'evidenceField.label',
        'evidenceField.url',
        'evidenceField.citation',
        'evidenceField.observedAt'
      ] as const) {
        expect(screen.queryByLabelText(catalogues[lang][key]), key).toBeNull();
      }
      // The one thing the Member is still asked for, and it reaches the private explanation rather
      // than the Evidence citation.
      expect(screen.getByLabelText(catalogues[lang]['report.explanation'])).toBeTruthy();
    }
  );

  it('opens on the whole place when the link named no target', () => {
    render(ReportPage, {
      params: { lang: 'en', id: place.placeId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        signInUrl: null,
        place,
        presetField: null,
        presetConditionId: null,
        presetReason: null
      },
      form: null
    } as never);

    const target = screen.getByLabelText('What are you correcting?') as HTMLSelectElement;
    expect(target.value).toBe('place');
    expect(Array.from(target.options, (option) => option.value)).toEqual([
      'place',
      'place_field',
      'access_condition'
    ]);
    // The whole Place carries neither, and the validator rejects it paired with either.
    expect(screen.queryByLabelText('Choose the detail')).toBeNull();
    expect(screen.queryByLabelText('Choose the Access Condition')).toBeNull();
  });

  it('keeps a deep-linked Access Condition target and its reason preselected', () => {
    render(ReportPage, {
      params: { lang: 'en', id: place.placeId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        signInUrl: null,
        place,
        presetField: null,
        presetConditionId: place.accessConditions[0].id,
        presetReason: 'misleading'
      },
      form: null
    } as never);

    expect((screen.getByLabelText('What are you correcting?') as HTMLSelectElement).value).toBe(
      'access_condition'
    );
    expect(
      (screen.getByLabelText('What kind of problem is this?') as HTMLSelectElement).value
    ).toBe('misleading');
  });
});

describe('Member Correction and Report outcome history', () => {
  it('shows a private outcome and its Member-safe reason without leaking a private note', () => {
    render(MemberFlagsPage, {
      params: { lang: 'en' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        submitted: null,
        nextCursor: null,
        hasPrevious: false,
        flags: [
          {
            flagId: correctionFlag.flagId,
            kind: 'correction',
            outcome: 'rejected',
            placeNameIs: correctionFlag.placeNameIs,
            placeNameEn: correctionFlag.placeNameEn,
            targetKind: 'place_field',
            targetField: 'phone',
            reportReason: null,
            memberReasonIs: 'Ekki tókst að staðfesta.',
            memberReasonEn: 'Could not be confirmed.',
            submittedAt: correctionFlag.submittedAt,
            updatedAt: correctionFlag.updatedAt
          }
        ]
      },
      form: null
    } as never);

    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.getByText('Could not be confirmed.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Escalated informally');
  });

  it('shows the empty state when no Corrections or Reports were submitted', () => {
    render(MemberFlagsPage, {
      params: { lang: 'en' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        submitted: null,
        nextCursor: null,
        hasPrevious: false,
        flags: []
      },
      form: null
    } as never);

    expect(screen.getByText('You have not submitted any Corrections or Reports.')).toBeTruthy();
  });
});

describe('Moderator Correction and Report detail', () => {
  it('preserves the proposed whenever-open state when editing an Access Condition application', async () => {
    const accessCorrection = {
      ...correctionFlag,
      targetKind: 'access_condition' as const,
      targetField: null,
      accessConditionId: place.accessConditions[0].id,
      currentVerificationId: '76600000-0000-4000-8000-000000000001',
      currentVerificationStatus: 'verified',
      currentVerificationVerifiedAt: '2026-01-01T00:00:00Z',
      currentVerificationFreshnessUntil: '2030-01-01T00:00:00Z',
      currentVerificationEvidence: [],
      proposedValue: {
        access_area: 'indoors',
        access_area_note: null,
        restraint_condition: 'off_leash_permitted',
        restraint_note: null,
        dog_eligibility: { scope: 'all_dogs' },
        availability_state: 'whenever_open',
        availability_window: {},
        permission_requirement: 'standing_permission'
      }
    } as ModerationPlaceFlag;
    render(FlagReviewPage, {
      params: { lang: 'en', id: accessCorrection.flagId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        flag: accessCorrection,
        related: [],
        resolved: false,
        contributionConfirmed: false
      },
      form: null
    } as never);

    await fireEvent.click(screen.getByText('Change under review'));
    await fireEvent.click(screen.getByRole('button', { name: 'Edit Change under review' }));
    expect((screen.getByLabelText('When are dogs welcome?') as HTMLSelectElement).value).toBe(
      'whenever_open'
    );
    expect(screen.queryByLabelText('Dog access starts at')).toBeNull();
  });

  it('compares the live value, snapshot, and proposed Correction, and offers Apply', () => {
    render(FlagReviewPage, {
      params: { lang: 'en', id: correctionFlag.flagId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        flag: correctionFlag,
        related: [],
        resolved: false,
        contributionConfirmed: false
      },
      form: null
    } as never);

    expect(screen.getByText('+354 555 0199')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply correction' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm useful' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open dispute' })).toBeNull();
    expect((document.querySelector('#correction-evidence') as HTMLDetailsElement).open).toBe(false);
  });

  it('offers dispute_opened only for an Access Condition target Report, plus the Safety Concern badge', () => {
    render(FlagReviewPage, {
      params: { lang: 'en', id: reportFlag.flagId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        flag: reportFlag,
        related: [],
        resolved: false,
        contributionConfirmed: false
      },
      form: null
    } as never);

    expect(screen.getAllByText('Safety Concern')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Confirm useful' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open dispute' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Apply correction' })).toBeNull();
    expect(screen.getByText('Escalated informally; venue contacted.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Current verification' })).toBeTruthy();
    expect(screen.getByText('Verification status: verified')).toBeTruthy();
    expect(
      screen.getByText('official_website · Original policy · 2026-01-01T00:00:00Z')
    ).toBeTruthy();
  });

  it('shows an absent-verification message for an Access Condition target with no current verification', () => {
    render(FlagReviewPage, {
      params: { lang: 'en', id: reportFlag.flagId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        flag: {
          ...reportFlag,
          currentVerificationId: null,
          currentVerificationStatus: null,
          currentVerificationVerifiedAt: null,
          currentVerificationFreshnessUntil: null,
          currentVerificationEvidence: null
        },
        related: [],
        resolved: false,
        contributionConfirmed: false
      },
      form: null
    } as never);

    expect(screen.getByRole('heading', { name: 'Current verification' })).toBeTruthy();
    expect(screen.getByText('This target has no current verification.')).toBeTruthy();
  });

  it('offers Contribution confirmation only after an applied or confirmed-useful outcome', () => {
    render(FlagReviewPage, {
      params: { lang: 'en', id: correctionFlag.flagId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        flag: { ...correctionFlag, outcome: 'applied' },
        related: [],
        resolved: true,
        contributionConfirmed: false
      },
      form: null
    } as never);

    expect(screen.getByRole('button', { name: 'Confirm useful Contribution' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save outcome' })).toBeNull();
  });

  it('shows related claims sharing the same target without merging them', () => {
    render(FlagReviewPage, {
      params: { lang: 'en', id: reportFlag.flagId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        flag: reportFlag,
        related: [
          {
            flagId: 'related-1',
            kind: 'correction',
            outcome: 'submitted',
            submittedAt: '2026-07-11T10:00:00Z'
          }
        ],
        resolved: false,
        contributionConfirmed: false
      },
      form: null
    } as never);

    expect(screen.getAllByText('Related claims')).toHaveLength(2);
    expect(screen.getAllByText('Correction')).toBeTruthy();
  });
});
