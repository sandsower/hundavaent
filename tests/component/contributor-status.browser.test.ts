import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import type {
  ContributorEvidenceItem,
  ModerationContributorStatus,
  MyContributorStatus
} from '$server/contributors/contributor-status';
import type { ModerationSuggestion, SuggestionPlaceMatch } from '$server/suggestions/suggestions';
import ContributorStatusPage from '../../src/routes/[lang=lang]/account/contributor-status/+page.svelte';
import SuggestionReviewPage from '../../src/routes/[lang=lang]/moderation/suggestions/[id]/+page.svelte';

const trustedStatus: MyContributorStatus = {
  status: 'trusted_contributor',
  policyVersion: 'trust-v1',
  statusSince: '2026-05-01T00:00:00Z'
};

const proposal = {
  purpose: 'dog_access_destination' as const,
  operator_name: 'Hundavænt operator',
  category: 'cafe' as const,
  location: {
    address_line: 'Tillögugata 7',
    locality: 'Reykjavík',
    postal_code: '101',
    municipality: 'reykjavik',
    latitude: 64.1466,
    longitude: -21.9426
  },
  translations: {
    is: { name: 'Tillögukaffi', description: 'Hundvæn tillaga.' },
    en: { name: 'Suggestion cafe', description: 'A dog-friendly suggestion.' }
  },
  website_url: null,
  phone: null,
  opening_hours: { monday: '09:00-17:00' },
  dog_amenities: ['water_bowl'],
  access_condition: {
    access_area: 'outdoors' as const,
    access_area_note: null,
    restraint_condition: 'leash_required' as const,
    restraint_note: null,
    dog_eligibility: { scope: 'all_dogs' as const },
    availability_state: 'limited' as const,
    availability_window: { days: [1, 2], startsAt: '09:00', endsAt: '17:00' },
    permission_requirement: 'standing_permission' as const
  },
  evidence: {
    kind: 'member_report' as const,
    source_url: 'https://example.invalid/source',
    source_citation: null,
    source_label: 'Member supplied source',
    observed_at: '2026-07-11T09:00:00Z',
    explanation: 'The source explicitly permits dogs outdoors.',
    source_metadata: {}
  }
};

const moderationSuggestion: ModerationSuggestion = {
  itemVersion: 1,
  draftVersion: 0,
  draftProposal: null,
  effectiveProposal: proposal,
  draftUpdatedBy: null,
  draftUpdatedAt: null,
  suggestionId: '85000000-0000-4000-8000-000000000001',
  memberId: '75000000-0000-4000-8000-000000000001',
  outcome: 'accepted',
  operatorName: proposal.operator_name,
  nameIs: proposal.translations.is.name,
  nameEn: proposal.translations.en.name,
  category: proposal.category,
  addressLine: proposal.location.address_line,
  locality: proposal.location.locality,
  submittedAt: '2026-07-11T09:00:00Z',
  updatedAt: '2026-07-11T09:00:00Z',
  proposal,
  reviewedProposal: null,
  privateNote: null,
  contributionId: '95000000-0000-4000-8000-000000000001',
  operatorIdentityPlaceId: null,
  locationIdentityPlaceId: null
};

const matches: SuggestionPlaceMatch[] = [];

const moderationDetail: ModerationContributorStatus = {
  status: 'contributor',
  policyVersion: null,
  netAcceptedTotal: 1,
  netAcceptedInWindow: 1,
  distinctSubjectsInWindow: 1,
  distinctMonthsInWindow: 1,
  revokedInWindow: 0,
  hasActiveFlag: true,
  firstNetAcceptedAt: '2026-06-01T00:00:00Z'
};

const evidence: ContributorEvidenceItem[] = [
  {
    contributionId: '95000000-0000-4000-8000-000000000001',
    subjectPlaceId: '35000000-0000-4000-8000-000000000001',
    confirmedAt: '2026-06-01T00:00:00Z',
    revokedAt: null,
    revokedReason: null,
    flagId: null,
    flagKind: null,
    flagReason: null,
    flagRecordedAt: null,
    flagActive: null
  },
  {
    contributionId: null,
    subjectPlaceId: null,
    confirmedAt: null,
    revokedAt: null,
    revokedReason: null,
    flagId: '55000000-0000-4000-8000-000000000001',
    flagKind: 'fraud',
    flagReason: 'One serious false report was confirmed.',
    flagRecordedAt: '2026-06-10T00:00:00Z',
    flagActive: true
  }
];

describe('Member Contributor status view', () => {
  it.each([
    ['is', 'Staða þín sem framlagsgjafi'],
    ['en', 'Your Contributor status']
  ] as const)(
    'shows only a tier and a since-date, never a count or ratio, in %s',
    (lang, heading) => {
      render(ContributorStatusPage, {
        params: { lang },
        data: { lang, copy: catalogues[lang], contributor: trustedStatus }
      } as never);

      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
      expect(
        screen.getByText(catalogues[lang]['contributor.status.trusted_contributor'])
      ).toBeTruthy();
      // The explanation must render verbatim from the static, number-free catalogue string - proving
      // no numeric progress, count, or ratio was interpolated into the private status view.
      expect(
        screen.getByText(catalogues[lang]['contributor.explanation.trusted_contributor'])
      ).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
      expect(document.body.textContent).not.toMatch(/\d+\s*(more|needed|contributions?)\b/i);
    }
  );

  it('renders no since-date for a Member with no history', () => {
    render(ContributorStatusPage, {
      params: { lang: 'en' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        contributor: { status: 'none', policyVersion: null, statusSince: null }
      }
    } as never);

    expect(screen.getByText(catalogues.en['contributor.status.none'])).toBeTruthy();
    expect(document.body.textContent).not.toContain('Recognized since');
  });
});

describe('Moderator Contributor detail on the Suggestion review page', () => {
  it('shows status, evidence history, and moderator actions gated by an active conduct flag', async () => {
    render(SuggestionReviewPage, {
      params: { lang: 'en', id: moderationSuggestion.suggestionId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        suggestion: moderationSuggestion,
        matches,
        resolved: false,
        contributionConfirmed: false,
        contributor: moderationDetail,
        contributorEvidence: evidence,
        contributionRevoked: false,
        conductFlagRecorded: false,
        conductFlagCleared: false
      },
      form: null
    } as never);

    const contributorSection =
      document.querySelector<HTMLDetailsElement>('#suggestion-contributor');
    expect(contributorSection).toBeTruthy();
    await fireEvent.click(contributorSection!.querySelector('summary')!);
    expect(screen.getAllByText('Contributor')).toHaveLength(2);
    expect(contributorSection!.textContent).toContain('One serious false report was confirmed.');
    expect(screen.getByRole('button', { name: 'Revoke this Contribution' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record a conduct flag' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear flag' })).toBeTruthy();
    expect(
      screen.getByText(
        'This is a bounded review-priority signal only. It never verifies, publishes, or bypasses moderation.'
      )
    ).toBeTruthy();
  });

  it('hides the clear-flag action when there is no active conduct flag', () => {
    render(SuggestionReviewPage, {
      params: { lang: 'en', id: moderationSuggestion.suggestionId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        suggestion: moderationSuggestion,
        matches,
        resolved: false,
        contributionConfirmed: false,
        contributor: { ...moderationDetail, hasActiveFlag: false },
        contributorEvidence: [evidence[0]],
        contributionRevoked: false,
        conductFlagRecorded: false,
        conductFlagCleared: false
      },
      form: null
    } as never);

    expect(screen.queryByRole('button', { name: 'Clear flag' })).toBeNull();
  });
});
