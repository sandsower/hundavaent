import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import SuggestionReviewPanel from '$lib/moderation/SuggestionReviewPanel.svelte';
import type {
  ContributorEvidenceItem,
  ModerationContributorStatus
} from '$server/contributors/contributor-status';
import type { ModerationSuggestion, SuggestionPlaceMatch } from '$server/suggestions/suggestions';
import MemberSuggestionsPage from '../../src/routes/[lang=lang]/account/suggestions/+page.svelte';
import SuggestionReviewPage from '../../src/routes/[lang=lang]/moderation/suggestions/[id]/+page.svelte';
import SuggestionQueuePage from '../../src/routes/[lang=lang]/moderation/suggestions/+page.svelte';
import SuggestionPage from '../../src/routes/[lang=lang]/suggest/+page.svelte';

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
  suggestionId: '85000000-0000-4000-8000-000000000001',
  memberId: '75000000-0000-4000-8000-000000000001',
  outcome: 'submitted',
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
  contributionId: null,
  operatorIdentityPlaceId: null,
  locationIdentityPlaceId: null
};

const placeMatch: SuggestionPlaceMatch = {
  placeId: '35000000-0000-4000-8000-000000000001',
  lifecycle: 'inactive',
  operatorName: proposal.operator_name,
  nameIs: 'Eldri staður',
  nameEn: 'Previous Place',
  addressLine: proposal.location.address_line,
  locality: proposal.location.locality,
  sameOperator: true,
  exactLocation: true
};

const contributor: ModerationContributorStatus = {
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

const contributorEvidence: ContributorEvidenceItem[] = [
  {
    contributionId: '95000000-0000-4000-8000-000000000001',
    subjectPlaceId: placeMatch.placeId,
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

const reviewData = {
  lang: 'en' as const,
  copy: catalogues.en,
  suggestion: moderationSuggestion,
  matches: [placeMatch],
  resolved: false,
  contributionConfirmed: false,
  contributor,
  contributorEvidence,
  contributionRevoked: false,
  conductFlagRecorded: false,
  conductFlagCleared: false
};

describe('Member Suggestion workflow', () => {
  it.each([
    ['is', 'Leggðu til stað', 'Senda tillögu'],
    ['en', 'Suggest a place', 'Send suggestion']
  ] as const)('renders the friendly short %s form', (lang, heading, submitLabel) => {
    render(SuggestionPage, {
      params: { lang },
      data: { lang, copy: catalogues[lang], unavailable: false },
      form: null
    } as never);

    expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    expect(screen.getByLabelText(catalogues[lang]['suggestion.placeName'])).toBeTruthy();
    expect(screen.getByLabelText(catalogues[lang]['suggestion.locationNote'])).toBeTruthy();
    expect(screen.getByLabelText(catalogues[lang]['suggestion.welcomeArea'])).toBeTruthy();
    expect(screen.getByLabelText(catalogues[lang]['suggestion.allDogsWelcome'])).toBeTruthy();
    expect(screen.getByLabelText(catalogues[lang]['suggestion.welcomePermission'])).toBeTruthy();
    expect(
      screen.getByRole('group', { name: catalogues[lang]['suggestion.howKnow'] })
    ).toBeTruthy();
    expect(screen.getByLabelText(catalogues[lang]['suggestion.howKnowExplanation'])).toBeTruthy();
    expect(screen.getByLabelText(catalogues[lang]['suggestion.howKnowDate'])).toBeTruthy();
    expect(screen.queryByLabelText(catalogues[lang]['suggestion.postalCode'])).toBeNull();
    expect(screen.queryByText(catalogues[lang]['suggestion.translationEn'])).toBeNull();
    expect(screen.queryByText(catalogues[lang]['suggestion.translationIs'])).toBeNull();
    expect(screen.getByRole('button', { name: submitLabel })).toBeTruthy();
  });

  it('announces the fail-closed suggestion-abuse boundary without rendering a usable form', () => {
    render(SuggestionPage, {
      params: { lang: 'en' },
      data: { lang: 'en', copy: catalogues.en, unavailable: false },
      form: { error: 'policy_unavailable' }
    } as never);

    expect(screen.getByRole('alert').textContent).toContain(
      'We cannot take suggestions right now. Please try again soon.'
    );
    expect(
      (screen.getByRole('button', { name: 'Send suggestion' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByLabelText('Place name').matches(':disabled')).toBe(true);
  });

  it('shows a private rejected outcome and its Member-safe reason', () => {
    render(MemberSuggestionsPage, {
      params: { lang: 'en' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        submitted: null,
        nextCursor: null,
        hasPrevious: true,
        suggestions: [
          {
            suggestionId: moderationSuggestion.suggestionId,
            outcome: 'rejected',
            nameIs: moderationSuggestion.nameIs,
            nameEn: moderationSuggestion.nameEn,
            category: moderationSuggestion.category,
            locality: moderationSuggestion.locality,
            memberReasonIs: 'Ekki nægar heimildir.',
            memberReasonEn: 'Insufficient evidence.',
            candidatePlaceId: null,
            duplicatePlaceId: null,
            submittedAt: moderationSuggestion.submittedAt,
            updatedAt: moderationSuggestion.updatedAt
          }
        ]
      },
      form: null
    } as never);

    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.getByText('Insufficient evidence.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to first page' }).getAttribute('href')).toBe(
      '/en/account/suggestions'
    );
    expect(document.body.textContent).not.toContain('Private moderator note');
  });
});

describe('Moderator Suggestion workflow', () => {
  it('keeps the complete moderation contract in the reusable review panel', async () => {
    render(SuggestionReviewPanel, {
      data: reviewData,
      form: {
        matchesRefreshed: true,
        refreshedMatches: [placeMatch],
        refreshedOutcome: 'accepted',
        refreshedMemberReasonIs: 'Yfirfarið.',
        refreshedMemberReasonEn: 'Reviewed.',
        refreshedPrivateNote: 'Private note.',
        refreshedProposal: moderationSuggestion.proposal
      }
    });

    expect(
      screen.getByText('Tillögugata 7, 101 Reykjavík · reykjavik · 64.1466, -21.9426')
    ).toBeTruthy();
    expect(screen.getByText('https://example.invalid/source')).toBeTruthy();
    expect(screen.getByText('Same Operator')).toBeTruthy();
    expect(screen.getByText('Same Location')).toBeTruthy();
    expect(screen.getByText('Contributor')).toBeTruthy();
    expect(screen.getByText('One serious false report was confirmed.')).toBeTruthy();
    expect(
      screen.getByText(
        'This is a bounded review-priority signal only. It never verifies, publishes, or bypasses moderation.'
      )
    ).toBeTruthy();
    expect(
      screen.getByText('No Trusted Contributor qualification policy is configured yet.')
    ).toBeTruthy();

    expect((screen.getByLabelText('Outcome') as HTMLSelectElement).value).toBe('accepted');
    expect(
      (screen.getByLabelText('Member explanation in Icelandic') as HTMLTextAreaElement).value
    ).toBe('Yfirfarið.');
    expect(
      (screen.getByLabelText('Member explanation in English') as HTMLTextAreaElement).value
    ).toBe('Reviewed.');
    expect((screen.getByLabelText('Private Moderator note') as HTMLTextAreaElement).value).toBe(
      'Private note.'
    );
    expect(screen.getByRole('option', { name: 'Needs information' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Accepted as a Candidate' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Place already recorded' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Rejected' })).toBeTruthy();

    const resolveForm = screen.getByRole('button', { name: 'Save outcome' }).closest('form');
    expect(resolveForm?.getAttribute('action')).toBe('?/resolve');
    expect(resolveForm?.querySelector('[name="memberReasonIs"]')).toBeTruthy();
    expect(resolveForm?.querySelector('[name="memberReasonEn"]')).toBeTruthy();
    expect(resolveForm?.querySelector('[name="privateNote"]')).toBeTruthy();
    expect(resolveForm?.querySelector('[name="operatorName"]')).toBeTruthy();
    expect(resolveForm?.querySelector('[name="operatorIdentityPlaceId"]')).toBeTruthy();
    expect(resolveForm?.querySelector('[name="locationIdentityPlaceId"]')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Refresh matches for corrected details' })
        .getAttribute('formaction')
    ).toBe('?/refreshMatches');
    expect(
      screen
        .getByRole('button', { name: 'Revoke this Contribution' })
        .closest('form')
        ?.getAttribute('action')
    ).toBe('?/revokeContribution');
    expect(
      screen
        .getByRole('button', { name: 'Record a conduct flag' })
        .closest('form')
        ?.getAttribute('action')
    ).toBe('?/recordConductFlag');
    expect(
      screen.getByRole('button', { name: 'Clear flag' }).closest('form')?.getAttribute('action')
    ).toBe('?/clearConductFlag');

    const englishNames = screen.getAllByLabelText('Name');
    await fireEvent.input(englishNames[1], { target: { value: 'Corrected cafe' } });
    expect((englishNames[1] as HTMLInputElement).value).toBe('Corrected cafe');
  });

  it('renders the private queue and a stable review link', () => {
    render(SuggestionQueuePage, {
      params: { lang: 'en' },
      data: {
        lang: 'en',
        copy: catalogues.en,
        suggestions: [{ ...moderationSuggestion, queueRank: 0 }],
        nextCursor: null,
        hasPrevious: true
      },
      form: null
    } as never);

    expect(screen.getByRole('heading', { name: 'Community Suggestions' })).toBeTruthy();
    expect(screen.getByText('Suggestion cafe')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Review Suggestion' }).getAttribute('href')).toBe(
      `/en/moderation/suggestions/${moderationSuggestion.suggestionId}`
    );
    expect(screen.getByRole('link', { name: 'Back to first page' }).getAttribute('href')).toBe(
      '/en/moderation/suggestions'
    );
  });

  it('shows the complete proposal and allows corrections with explicit inactive identity reuse', async () => {
    render(SuggestionReviewPage, {
      params: { lang: 'en', id: moderationSuggestion.suggestionId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        suggestion: moderationSuggestion,
        matches: [placeMatch],
        resolved: false,
        contributionConfirmed: false
      },
      form: null
    } as never);

    expect(screen.getByText('Same Operator')).toBeTruthy();
    expect(screen.getByText('Same Location')).toBeTruthy();
    expect(screen.getByText('https://example.invalid/source')).toBeTruthy();
    expect(screen.getByText('2026-07-11T09:00:00Z')).toBeTruthy();
    expect(
      screen.getByText('Tillögugata 7, 101 Reykjavík · reykjavik · 64.1466, -21.9426')
    ).toBeTruthy();
    expect(screen.getByText(/09:00-17:00/)).toBeTruthy();
    expect(screen.getByText('water_bowl')).toBeTruthy();
    expect(screen.getByLabelText('Private Moderator note')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Accepted as a Candidate' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Place already recorded' })).toBeTruthy();

    await fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'accepted' } });
    const englishNames = screen.getAllByLabelText('Name');
    expect((englishNames[1] as HTMLInputElement).value).toBe('Suggestion cafe');
    await fireEvent.input(englishNames[1], { target: { value: 'Corrected cafe' } });
    expect((englishNames[1] as HTMLInputElement).value).toBe('Corrected cafe');
    expect(screen.getByLabelText('Operator identity')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Refresh matches for corrected details' })
    ).toBeTruthy();
    expect(screen.getAllByRole('option', { name: /Reuse identity from.*Inactive/ })).toHaveLength(
      2
    );
  });

  it('renders refreshed corrected-payload matches instead of stale original matches', async () => {
    const correctedMatch = {
      ...placeMatch,
      placeId: '35000000-0000-4000-8000-000000000099',
      operatorName: 'Corrected operator',
      addressLine: 'Leiðrétt gata 48'
    };
    render(SuggestionReviewPage, {
      params: { lang: 'en', id: moderationSuggestion.suggestionId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        suggestion: moderationSuggestion,
        matches: [placeMatch],
        resolved: false,
        contributionConfirmed: false
      },
      form: {
        matchesRefreshed: true,
        refreshedMatches: [correctedMatch],
        refreshedOutcome: 'accepted',
        refreshedMemberReasonIs: 'Yfirfarið.',
        refreshedMemberReasonEn: 'Reviewed.',
        refreshedPrivateNote: 'Private note.',
        refreshedProposal: {
          ...moderationSuggestion.proposal,
          location: {
            ...moderationSuggestion.proposal.location,
            address_line: 'Leiðrétt gata 48'
          }
        }
      }
    } as never);

    expect(screen.getByText('Identity matches now reflect the corrected proposal.')).toBeTruthy();
    expect(screen.getByText(/Inactive · Leiðrétt gata 48, Reykjavík/)).toBeTruthy();
    expect((screen.getByLabelText('Outcome') as HTMLSelectElement).value).toBe('accepted');
    expect(
      (screen.getByLabelText('Member explanation in English') as HTMLTextAreaElement).value
    ).toBe('Reviewed.');
    expect((screen.getByLabelText('Private Moderator note') as HTMLTextAreaElement).value).toBe(
      'Private note.'
    );
    expect(screen.getAllByRole('option', { name: /Leiðrétt gata 48/ })).toHaveLength(1);
    expect(screen.queryByRole('option', { name: /Tillögugata 7/ })).toBeNull();
  });

  it('requires a moderator to supply the missing locale instead of publishing copied text', async () => {
    const proposalWithMissingIcelandic = {
      ...proposal,
      translations: {
        is: {
          name: proposal.translations.en.name,
          description: proposal.translations.en.description,
          needs_review: true
        },
        en: proposal.translations.en
      }
    };
    render(SuggestionReviewPage, {
      params: { lang: 'en', id: moderationSuggestion.suggestionId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        suggestion: { ...moderationSuggestion, proposal: proposalWithMissingIcelandic },
        matches: [],
        resolved: false,
        contributionConfirmed: false
      },
      form: null
    } as never);

    await fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'accepted' } });
    const names = screen.getAllByLabelText('Name') as HTMLInputElement[];
    const descriptions = screen.getAllByLabelText('Description') as HTMLTextAreaElement[];
    expect(names[0].value).toBe('');
    expect(names[0].required).toBe(true);
    expect(descriptions[0].value).toBe('');
    expect(descriptions[0].required).toBe(true);
    expect(names[1].value).toBe('Suggestion cafe');
    expect(screen.getByText('Please add a translation before publishing.')).toBeTruthy();
  });

  it('offers Contribution confirmation only after acceptance', () => {
    render(SuggestionReviewPage, {
      params: { lang: 'en', id: moderationSuggestion.suggestionId },
      data: {
        lang: 'en',
        copy: catalogues.en,
        suggestion: { ...moderationSuggestion, outcome: 'accepted' },
        matches: [],
        resolved: true,
        contributionConfirmed: false
      },
      form: null
    } as never);

    expect(screen.getByRole('button', { name: 'Confirm useful Contribution' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save outcome' })).toBeNull();
  });
});
