import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import CandidateReviewPanel from '$lib/moderation/CandidateReviewPanel.svelte';

const placeId = '70000000-0000-4000-8000-000000000001';

const data = {
  lang: 'en' as const,
  copy: catalogues.en,
  defaultFreshnessUntil: '2027-07-13',
  review: {
    placeId,
    version: 3,
    lifecycle: 'candidate',
    operatorName: 'Candidate operator',
    category: 'cafe',
    addressLine: 'Candidate street 1',
    locality: 'Reykjavik',
    postalCode: '101',
    municipality: 'reykjavik',
    latitude: 64.1466,
    longitude: -21.9426,
    geometryPrecision: 'official_address_point' as const,
    geometrySource: 'test fixture',
    nameIs: 'Tillogustadur',
    descriptionIs: 'Lysing',
    nameEn: 'Candidate Place',
    descriptionEn: 'Description',
    accessConditions: [
      {
        id: '70000000-0000-4000-8000-000000000002',
        accessArea: 'outdoors' as const,
        accessAreaNote: null,
        restraintCondition: 'leash_required' as const,
        restraintNote: null,
        dogEligibility: { scope: 'all_dogs' as const },
        availabilityWindow: {},
        permissionRequirement: 'standing_permission' as const
      }
    ],
    evidenceRecords: [
      {
        id: '70000000-0000-4000-8000-000000000003',
        kind: 'official_website' as const,
        sourceUrl: 'https://example.invalid/source',
        sourceCitation: null,
        sourceLabel: 'Official website',
        observedAt: '2026-07-13T09:00:00Z'
      }
    ],
    checks: {
      candidate: true,
      operatorAndCategory: true,
      capitalRegionLocation: true,
      geometryQuality: true,
      icelandicTranslation: true,
      englishTranslation: true,
      accessCondition: true,
      evidence: true
    },
    ready: true
  },
  media: []
};

describe('CandidateReviewPanel', () => {
  it('leads with one readiness summary and keeps complete supporting sections collapsed', async () => {
    render(CandidateReviewPanel, { data, form: null });

    expect(screen.queryByRole('heading', { name: 'Review Place' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Candidate Place' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Publication checklist' })).toBeTruthy();
    expect(screen.getAllByText('Ready')).toHaveLength(1);
    expect(document.querySelector('#candidate-publication')).toBeTruthy();
    expect(document.querySelector('#candidate-media')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verify and publish' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Needs information' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(screen.getByText('Place overview').closest('details')?.open).toBe(false);
    expect(screen.getByText('Names and descriptions').closest('details')?.open).toBe(false);

    await fireEvent.click(screen.getByRole('button', { name: 'Verify and publish' }));
    const confirmation = screen.getByRole('dialog', { name: 'Publish this Place?' });
    expect(
      within(confirmation).getByText(
        'The reviewed Place and its verified access information will become publicly visible.'
      )
    ).toBeTruthy();

    const forms = [...document.querySelectorAll('form')];
    expect(forms.length).toBeGreaterThan(0);
    expect(
      forms.every(
        (form) =>
          (form.querySelector('input[name="placeId"]') as HTMLInputElement | null)?.value ===
          placeId
      )
    ).toBe(true);
  });

  it('opens only the problem section and links to it from the blocked summary', async () => {
    render(CandidateReviewPanel, {
      data: {
        ...data,
        review: {
          ...data.review,
          nameEn: null,
          descriptionEn: null,
          ready: false,
          checks: { ...data.review.checks, englishTranslation: false }
        }
      },
      form: null
    });

    const readiness = screen.getByRole('region', { name: 'Publication checklist' });
    expect(within(readiness).getByText('Blocked')).toBeTruthy();
    expect(
      within(readiness).getByRole('link', { name: 'Add English translation' }).getAttribute('href')
    ).toBe('#translations');
    expect(screen.getByText('Names and descriptions').closest('details')?.open).toBe(true);
    expect(screen.getByText('Place overview').closest('details')?.open).toBe(false);
    expect(screen.getByRole('button', { name: 'Verify and publish' })).toBeDisabled();
  });

  it('preserves the direct-route heading and stale-version recovery in standalone mode', () => {
    render(CandidateReviewPanel, {
      data,
      standalone: true,
      form: {
        action: 'publish',
        success: false,
        error: 'The information changed while you were working.',
        conflict: true
      }
    });

    expect(screen.getByRole('heading', { name: 'Review Place' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(
      'The information changed while you were working.'
    );
    expect(
      screen.getByRole('link', { name: 'Reload current information' }).getAttribute('href')
    ).toBe(`/en/moderation/places/${placeId}`);
  });

  it('refreshes the version token and permits retry while the Place is still a Candidate', () => {
    const refreshedData = {
      ...data,
      review: { ...data.review, version: 8 }
    };
    const { container } = render(CandidateReviewPanel, {
      data: refreshedData,
      form: {
        action: 'publish',
        success: false,
        error: 'The information changed while you were working.',
        conflict: true
      }
    });

    expect(container.querySelector<HTMLInputElement>('input[name="expectedVersion"]')?.value).toBe(
      '8'
    );
    expect(
      (screen.getByRole('button', { name: 'Verify and publish' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('keeps a terminal publication conflict visible but prevents stale resubmission', () => {
    render(CandidateReviewPanel, {
      data: {
        ...data,
        review: { ...data.review, lifecycle: 'published' }
      },
      form: {
        action: 'publish',
        success: false,
        error: 'The information changed while you were working.',
        conflict: true
      }
    });

    expect(
      (screen.getByRole('button', { name: 'Verify and publish' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
