import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import type { PublishedPlaceProfile } from '$server/discovery/public-places';
import type { ModerationPlaceFlag } from '$server/place-flags/place-flags';
import MemberFlagsPage from '../../src/routes/[lang=lang]/account/corrections-and-reports/+page.svelte';
import FlagReviewPage from '../../src/routes/[lang=lang]/moderation/corrections-and-reports/[id]/+page.svelte';
import FlagQueuePage from '../../src/routes/[lang=lang]/moderation/corrections-and-reports/+page.svelte';
import CorrectionPage from '../../src/routes/[lang=lang]/places/[id]/correct/+page.svelte';
import ReportPage from '../../src/routes/[lang=lang]/places/[id]/report/+page.svelte';

const place: PublishedPlaceProfile = {
  placeId: '76300000-0000-4000-8000-000000000001',
  name: 'Flagged Cafe',
  description: 'Original description.',
  category: 'cafe',
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
      permissionRequirement: 'standing_permission',
      evidenceSources: [
        {
          kind: 'official_website',
          sourceUrl: 'https://example.invalid/flag-cafe',
          sourceCitation: null,
          sourceLabel: 'Original policy',
          observedAt: '2026-01-01T00:00:00Z'
        }
      ],
      verifiedAt: '2026-01-01T00:00:00Z',
      freshnessUntil: '2030-01-01T00:00:00Z'
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
      expect(screen.getByLabelText(catalogues[lang]['evidenceField.observedAt'])).toBeTruthy();
      expect(screen.getByRole('button', { name: submitLabel })).toBeTruthy();
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

describe('Moderator Correction and Report queue', () => {
  it('renders the queue with a Safety Concern badge and a stable review link', () => {
    render(FlagQueuePage, {
      params: { lang: 'en' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        flags: [
          {
            flagId: reportFlag.flagId,
            memberId: reportFlag.memberId,
            kind: 'report',
            outcome: 'submitted',
            placeId: reportFlag.placeId,
            placeNameIs: reportFlag.placeNameIs,
            placeNameEn: reportFlag.placeNameEn,
            targetKind: 'access_condition',
            targetField: null,
            accessConditionId: reportFlag.accessConditionId,
            reportReason: 'unsafe',
            isSafetyConcern: true,
            submittedAt: reportFlag.submittedAt,
            updatedAt: reportFlag.updatedAt,
            priority: 0
          }
        ],
        nextCursor: null,
        hasPrevious: false
      },
      form: null
    } as never);

    expect(screen.getByRole('heading', { name: 'Community Corrections and Reports' })).toBeTruthy();
    expect(screen.getByText('Safety Concern')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe(
      `/en/moderation/corrections-and-reports/${reportFlag.flagId}`
    );
  });
});

describe('Moderator Correction and Report detail', () => {
  it('compares the live value, snapshot, and proposed Correction, and offers the applied outcome', () => {
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
    expect(screen.getByRole('option', { name: 'Correction published' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Confirmed as a useful Report' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Access Dispute opened' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Current verification' })).toBeNull();
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

    expect(screen.getByText('Safety Concern')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Confirmed as a useful Report' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Access Dispute opened' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Correction published' })).toBeNull();
    expect(screen.getByLabelText('Private Moderator note')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Current verification' })).toBeTruthy();
    expect(screen.getByText('verified')).toBeTruthy();
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

    expect(screen.getByText('Other Corrections and Reports on the same claim')).toBeTruthy();
    expect(screen.getAllByText('Correction')).toBeTruthy();
  });
});
