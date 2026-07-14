import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import CorrectionReviewPanel from '$lib/moderation/CorrectionReviewPanel.svelte';
import { catalogues } from '$i18n';
import type { ModerationPlaceFlag } from '$server/place-flags/place-flags';

const flag: ModerationPlaceFlag = {
  flagId: '90000000-0000-4000-8000-000000000002',
  memberId: '76000000-0000-4000-8000-000000000001',
  kind: 'report',
  outcome: 'submitted',
  placeId: '76300000-0000-4000-8000-000000000001',
  placeNameIs: 'Prófstaður',
  placeNameEn: 'Test Place',
  targetKind: 'access_condition',
  targetField: null,
  accessConditionId: '76400000-0000-4000-8000-000000000001',
  currentValueSnapshot: {
    access_area: 'indoors',
    access_area_note: null,
    restraint_condition: 'leash_required',
    restraint_note: null,
    dog_eligibility: { scope: 'all_dogs' },
    availability_window: {},
    permission_requirement: 'standing_permission'
  } as never,
  currentLiveValue: {
    access_area: 'outdoors',
    restraint_condition: 'leash_required',
    permission_requirement: 'standing_permission'
  } as never,
  currentPlaceVersion: 4,
  currentVerificationId: '76600000-0000-4000-8000-000000000001',
  currentVerificationStatus: 'verified',
  currentVerificationVerifiedAt: '2026-01-01T00:00:00Z',
  currentVerificationFreshnessUntil: '2030-01-01T00:00:00Z',
  currentVerificationEvidence: [
    {
      kind: 'official_website',
      sourceUrl: 'https://example.invalid/policy',
      sourceCitation: null,
      sourceLabel: 'Published policy',
      observedAt: '2026-01-01T00:00:00Z'
    }
  ],
  proposedValue: null,
  reportReason: 'unsafe',
  isSafetyConcern: true,
  successorPlaceId: null,
  explanation: 'The posted policy is unsafe.',
  evidence: {
    kind: 'member_report',
    source_url: null,
    source_citation: 'Personal visit',
    source_label: 'Witnessed in person',
    observed_at: '2026-07-11T09:00:00Z',
    source_metadata: {}
  },
  privateNote: 'Escalated to the venue.',
  appliedAccessConditionId: null,
  disputeId: null,
  transitionId: null,
  contributionId: null,
  submittedAt: '2026-07-11T09:00:00Z',
  updatedAt: '2026-07-11T09:00:00Z'
};

const data = {
  lang: 'en' as const,
  copy: catalogues.en,
  flag,
  related: [
    {
      flagId: '90000000-0000-4000-8000-000000000003',
      kind: 'correction' as const,
      outcome: 'needs_information' as const,
      submittedAt: '2026-07-11T10:00:00Z'
    }
  ],
  resolved: false,
  contributionConfirmed: false
};

describe('CorrectionReviewPanel', () => {
  it('keeps the complete evidence, comparison, safety, related, and decision flow when embedded', () => {
    render(CorrectionReviewPanel, { data, form: null });

    expect(screen.queryByRole('heading', { name: 'Test Place' })).toBeNull();
    expect(screen.getByText('Safety Concern')).toBeTruthy();
    expect(screen.getByText('Witnessed in person')).toBeTruthy();
    expect(screen.getByText('Escalated to the venue.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Current verification' })).toBeTruthy();
    expect(
      screen.getByText('official_website · Published policy · 2026-01-01T00:00:00Z')
    ).toBeTruthy();
    expect(screen.getByText('Other Corrections and Reports on the same claim')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Access Dispute opened' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save outcome' })).toBeTruthy();
    expect(document.querySelector('#correction-decision')).toBeTruthy();
  });

  it('renders the direct-route identity header in standalone mode', () => {
    render(CorrectionReviewPanel, { data, form: { error: 'conflict' }, standalone: true });

    expect(screen.getByRole('heading', { name: 'Test Place' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(catalogues.en['flag.outcomeConflict']);
  });

  it('allows a retry after refreshed facts show the Correction is still actionable', () => {
    render(CorrectionReviewPanel, { data, form: { error: 'conflict' } });

    expect(
      (screen.getByRole('button', { name: 'Save outcome' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('keeps a terminal conflict visible but prevents stale resubmission', () => {
    render(CorrectionReviewPanel, {
      data: { ...data, flag: { ...flag, outcome: 'rejected' } },
      form: { error: 'conflict' }
    });

    expect(
      (screen.getByRole('button', { name: 'Save outcome' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
