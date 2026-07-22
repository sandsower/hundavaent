import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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

  it('preserves every Member timing state when the optional schedule disclosure closes', async () => {
    render(SuggestionPage, {
      params: { lang: 'en' },
      data: { lang: 'en', copy: catalogues.en, unavailable: false },
      form: null
    } as never);

    const toggle = screen.getByRole('button', { name: 'Only welcome at certain times?' });
    const form = screen.getByRole('button', { name: 'Send suggestion' }).closest('form')!;
    await fireEvent.click(toggle);
    const timing = screen.getByLabelText('When are dogs welcome?') as HTMLSelectElement;
    expect(timing.value).toBe('limited');
    expect(Array.from(timing.options, (option) => option.value)).toEqual([
      'not_stated',
      'whenever_open',
      'limited'
    ]);
    const days = screen.getByLabelText(
      'Which weekdays? (1-7, separated by commas)'
    ) as HTMLInputElement;
    await fireEvent.input(days, { target: { value: '1,2' } });
    await fireEvent.click(toggle);
    expect(new FormData(form).get('availabilityState')).toBe('limited');
    expect(new FormData(form).get('availabilityDays')).toBe('1,2');

    await fireEvent.click(toggle);
    await fireEvent.change(timing, { target: { value: 'whenever_open' } });
    expect(screen.queryByLabelText('Which weekdays? (1-7, separated by commas)')).toBeNull();
    await fireEvent.click(toggle);
    expect(new FormData(form).get('availabilityState')).toBe('whenever_open');
    expect(new FormData(form).get('availabilityDays')).toBeNull();

    await fireEvent.click(toggle);
    await fireEvent.change(timing, { target: { value: 'not_stated' } });
    await fireEvent.click(toggle);
    expect(new FormData(form).get('availabilityState')).toBe('not_stated');
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
  it('uses the shared compact review shell and keeps the decision form metadata-only', () => {
    const { container } = render(SuggestionReviewPanel, { data: reviewData, form: null });

    expect(screen.getByRole('heading', { name: 'Review summary' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Review summary' })).toBeTruthy();
    expect(screen.getByText('Place identity').closest('details')?.open).toBe(false);
    expect(screen.getByText('Names and descriptions').closest('details')?.open).toBe(false);
    expect(document.querySelector<HTMLDetailsElement>('#suggestion-matches')?.open).toBe(true);
    expect(screen.getByText('Contributor context').closest('details')?.open).toBe(false);

    const decision = container.querySelector<HTMLFormElement>('#suggestion-decision');
    expect(decision?.getAttribute('action')).toBe('?/decideSuggestion');
    expect(decision?.querySelector('[name="expectedItemVersion"]')).toBeTruthy();
    expect(decision?.querySelector('[name="expectedDraftVersion"]')).toBeTruthy();
    expect(decision?.querySelector('[name="operatorName"]')).toBeNull();
    expect(decision?.querySelector('[name="addressLine"]')).toBeNull();
    expect(decision?.querySelector('[name="accessArea"]')).toBeNull();
    expect(decision?.querySelector('[name="evidenceSourceLabel"]')).toBeNull();
  });

  it('reports unsaved Suggestion edits and guards standalone decisions until cancel', async () => {
    const editStates: boolean[] = [];
    const { container } = render(SuggestionReviewPanel, {
      data: reviewData,
      form: null,
      standalone: true,
      oneditstatechange: (editing: boolean) => editStates.push(editing)
    });

    await waitFor(() => expect(editStates.at(-1)).toBe(false));
    await beginSuggestionEdit('Place identity');
    await waitFor(() => expect(editStates.at(-1)).toBe(true));
    expect(
      screen.getByText('Save or cancel this section before choosing a decision.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept as Candidate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Needs information' })).toBeDisabled();

    await fireEvent.click(
      suggestionSectionForm(container, 'identity').querySelector<HTMLButtonElement>(
        'button[type="button"]'
      )!
    );
    await waitFor(() => expect(editStates.at(-1)).toBe(false));
    expect(screen.getByRole('button', { name: 'Accept as Candidate' })).toBeEnabled();
  });

  it('edits one Suggestion section at a time and posts strict section payloads', async () => {
    const { container } = render(SuggestionReviewPanel, { data: reviewData, form: null });

    await beginSuggestionEdit('Place identity');
    const identity = suggestionSectionForm(container, 'identity');
    expect(hiddenValue(identity, 'expectedItemVersion')).toBe('1');
    expect(hiddenValue(identity, 'expectedDraftVersion')).toBe('0');
    expect(JSON.parse(hiddenValue(identity, 'sectionPayload'))).toEqual({
      purpose: 'dog_access_destination',
      operator_name: 'Hundavænt operator',
      category: 'cafe'
    });

    await beginSuggestionEdit('Contact, hours and amenities');
    expect(container.querySelector('[data-section-form="identity"]')).toBeNull();
    const details = suggestionSectionForm(container, 'hours-and-amenities');
    expect(JSON.parse(hiddenValue(details, 'sectionPayload'))).toEqual({
      website_url: null,
      phone: null,
      opening_hours: { monday: '09:00-17:00' },
      dog_amenities: ['water_bowl']
    });

    await beginSuggestionEdit('Access condition');
    const access = suggestionSectionForm(container, 'access-condition');
    expect(JSON.parse(hiddenValue(access, 'sectionPayload'))).toEqual({
      access_condition: proposal.access_condition
    });

    await beginSuggestionEdit('Supporting evidence');
    const evidence = suggestionSectionForm(container, 'evidence');
    expect(JSON.parse(hiddenValue(evidence, 'sectionPayload'))).toEqual({
      evidence: { ...proposal.evidence, observed_at: '2026-07-11T09:00:00.000Z' }
    });
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

  it('keeps the direct route actionable with compact decisions and explicit identity reuse', async () => {
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

    expect(screen.getByRole('button', { name: 'Accept as Candidate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Needs information' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark as duplicate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Accept as Candidate' }));
    expect(screen.getByRole('dialog', { name: 'Accept this Suggestion?' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Keep reviewing' }));

    await fireEvent.click(document.querySelector('#suggestion-matches summary')!);
    expect(screen.getByLabelText('Operator identity')).toBeTruthy();
    expect(screen.getAllByRole('option', { name: /Reuse identity from.*Inactive/ })).toHaveLength(
      2
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Needs information' }));
    expect(screen.getByRole('dialog', { name: 'Request more information' })).toBeTruthy();
    expect(screen.getByLabelText('Member explanation in Icelandic')).toBeRequired();

    await fireEvent.click(screen.getByRole('button', { name: 'Keep reviewing' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Mark as duplicate' }));
    expect(
      screen.getByRole('dialog', { name: 'Mark this Suggestion as a duplicate?' })
    ).toBeTruthy();
    expect(screen.getByLabelText('Choose the Place this Suggestion duplicates')).toBeRequired();

    await fireEvent.click(screen.getByRole('button', { name: 'Keep reviewing' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getByRole('dialog', { name: 'Reject this suggestion?' })).toBeTruthy();
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
        suggestion: {
          ...moderationSuggestion,
          proposal: proposalWithMissingIcelandic,
          effectiveProposal: proposalWithMissingIcelandic
        },
        matches: [],
        resolved: false,
        contributionConfirmed: false
      },
      form: null
    } as never);

    expect(screen.getByText('Names and descriptions').closest('details')?.open).toBe(true);
    expect(screen.getByRole('region', { name: 'Review summary' }).textContent).toContain('Blocked');
    expect(screen.getByRole('button', { name: 'Accept as Candidate' })).toBeDisabled();
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
    expect(screen.queryByRole('button', { name: 'Accept as Candidate' })).toBeNull();
  });
});

async function beginSuggestionEdit(sectionTitle: string): Promise<void> {
  const section = screen.getByText(sectionTitle).closest('details');
  if (!section) throw new Error(`Missing section: ${sectionTitle}`);
  if (!section.open) await fireEvent.click(section.querySelector('summary')!);
  await fireEvent.click(screen.getByRole('button', { name: `Edit ${sectionTitle}` }));
}

function suggestionSectionForm(container: HTMLElement, sectionId: string): HTMLFormElement {
  const form = container.querySelector<HTMLFormElement>(`form[data-section-form="${sectionId}"]`);
  if (!form) throw new Error(`Missing section form: ${sectionId}`);
  return form;
}

function hiddenValue(form: HTMLFormElement, name: string): string {
  const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) throw new Error(`Missing hidden input: ${name}`);
  return input.value;
}
