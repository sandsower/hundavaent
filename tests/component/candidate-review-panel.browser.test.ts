import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { page as browserPage } from 'vitest/browser';

import '../../src/app.css';
import { catalogues } from '$i18n';
import CandidateReviewPanel from '$lib/moderation/CandidateReviewPanel.svelte';
import CandidateReviewPage from '../../src/routes/[lang=lang]/moderation/places/[id]/+page.svelte';

const placeId = '70000000-0000-4000-8000-000000000001';

const data = {
  lang: 'en' as const,
  copy: catalogues.en,
  defaultFreshnessUntil: '2027-07-13',
  review: {
    placeId,
    version: 3,
    lifecycle: 'candidate',
    candidateStatus: 'pending' as const,
    itemVersion: 2,
    draftVersion: 0,
    draftPayload: null,
    draftUpdatedBy: null,
    draftUpdatedAt: null,
    readinessState: 'ready' as const,
    readinessIssues: [],
    originatingSuggestionId: null,
    contributorId: null,
    wheelchairAccessibility: 'unknown' as const,
    operatorName: 'Candidate operator',
    category: 'cafe',
    websiteUrl: null,
    phone: null,
    openingHours: {},
    dogAmenities: [],
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
        observedAt: '2026-07-13T09:00:00Z',
        sourceMetadata: { method: 'crawl' }
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
      publishableRestraintNote: true
    },
    ready: true
  },
  media: []
};

describe('CandidateReviewPanel', () => {
  it('uses refreshed direct-route conflict data and disables stale actions when refresh fails', () => {
    const refreshedReview = {
      ...data.review,
      itemVersion: 8,
      draftVersion: 4,
      lifecycle: 'published' as const,
      candidateStatus: 'published' as const
    };
    const { container, unmount } = render(CandidateReviewPage, {
      data,
      form: {
        action: 'publish',
        success: false,
        error: 'The information changed while you were working.',
        conflict: true,
        conflictReview: { review: refreshedReview }
      }
    } as never);

    expect(container.querySelector<HTMLInputElement>('[name="expectedItemVersion"]')?.value).toBe(
      '8'
    );
    expect(screen.queryByRole('button', { name: 'Verify and publish' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain(
      'The information changed while you were working.'
    );
    unmount();

    const failed = render(CandidateReviewPage, {
      data,
      form: {
        action: 'publish',
        success: false,
        error: 'The information changed while you were working.',
        conflict: true,
        conflictRefreshFailed: true
      }
    } as never);
    expect(
      failed.container.querySelector('fieldset[data-route-review]')?.hasAttribute('disabled')
    ).toBe(true);
  });

  it('leads with one readiness summary and keeps complete supporting sections collapsed', async () => {
    render(CandidateReviewPanel, { data, form: null });

    expect(screen.queryByRole('heading', { name: 'Review Place' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Candidate Place' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Publication checklist' })).toBeTruthy();
    expect(screen.getAllByText('Ready')).toHaveLength(1);
    const publicationForm = document.querySelector<HTMLElement>('#candidate-publication');
    expect(publicationForm).toBeTruthy();
    expect(getComputedStyle(publicationForm!).display).toBe('none');
    expect(document.querySelector('[name^="conditionEvidence."]')).toBeNull();
    expect(screen.queryByText('Publication evidence')).toBeNull();
    expect(document.querySelector('#candidate-media')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Verify and publish' })).toBeNull();
    expect(screen.getByText('Place identity').closest('details')?.open).toBe(false);
    expect(screen.getByText('Names and descriptions').closest('details')?.open).toBe(false);

    await fireEvent.click(screen.getByRole('button', { name: 'Edit Wheelchair accessibility' }));
    expect(screen.getByLabelText('Wheelchair accessibility')).toHaveValue('unknown');
    expect(screen.getByRole('button', { name: 'Save accessibility' })).toBeTruthy();

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
      form: null,
      standalone: true
    });

    const readiness = screen.getByRole('region', { name: 'Publication checklist' });
    expect(within(readiness).getByText('Blocked')).toBeTruthy();
    expect(
      within(readiness).getByRole('link', { name: 'Add English translation' }).getAttribute('href')
    ).toBe('#translations');
    expect(screen.getByText('Names and descriptions').closest('details')?.open).toBe(true);
    expect(screen.getByText('Place identity').closest('details')?.open).toBe(false);
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
      standalone: true,
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
        review: {
          ...data.review,
          lifecycle: 'published',
          candidateStatus: 'published' as const
        }
      },
      standalone: true,
      form: {
        action: 'publish',
        success: false,
        error: 'The information changed while you were working.',
        conflict: true
      }
    });

    expect(screen.queryByRole('button', { name: 'Verify and publish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Needs information' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });

  it('reports unsaved edits and guards every standalone Candidate decision until save or cancel', async () => {
    const editStates: boolean[] = [];
    const { container } = render(CandidateReviewPanel, {
      data,
      form: null,
      standalone: true,
      oneditstatechange: (editing: boolean) => editStates.push(editing)
    });

    await waitFor(() => expect(editStates.at(-1)).toBe(false));
    const decisionForm = container.querySelector<HTMLElement>('.decision-form');
    expect(decisionForm).toBeTruthy();
    expect(getComputedStyle(decisionForm!).display).toBe('none');
    expect(screen.getByRole('button', { name: 'Verify and publish' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Needs information' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();

    await beginEditing('Place identity');
    await waitFor(() => expect(editStates.at(-1)).toBe(true));
    expect(
      screen.getByText('Save or cancel this section before choosing a decision.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verify and publish' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Needs information' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();

    await fireEvent.click(
      within(sectionForm(container, 'identity')).getByRole('button', { name: 'Cancel' })
    );
    await waitFor(() => expect(editStates.at(-1)).toBe(false));
    expect(screen.getByRole('button', { name: 'Verify and publish' })).toBeEnabled();
  });

  it('asks only for an internal rationale when publishing', async () => {
    const { container } = render(CandidateReviewPanel, {
      data: {
        ...data,
        review: { ...data.review, evidenceRecords: [] }
      },
      form: null,
      standalone: true
    });

    expect(screen.getByRole('button', { name: 'Verify and publish' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Verify and publish' }));

    const dialog = screen.getByRole('dialog');
    const reason = within(dialog).getByRole('textbox', { name: 'Reason for publishing' });
    expect(reason).toBeRequired();
    await fireEvent.input(reason, {
      target: { value: 'The Place details and access rules have been reviewed.' }
    });
    expect(reason).toHaveValue('The Place details and access rules have been reviewed.');
    expect(container.querySelector('[name^="conditionEvidence."]')).toBeNull();
  });

  it('shows Candidate decision errors beside decisions and never inside Media', () => {
    render(CandidateReviewPanel, {
      data,
      standalone: true,
      form: {
        action: 'decideCandidate',
        success: false,
        error: 'The Candidate decision could not be saved.'
      }
    });

    const decisions = screen.getByRole('region', { name: 'Candidate decisions' });
    expect(within(decisions).getByRole('alert').textContent).toContain(
      'The Candidate decision could not be saved.'
    );
    expect(document.querySelector('#candidate-media')?.textContent).not.toContain(
      'The Candidate decision could not be saved.'
    );
  });

  it('offers only Reopen for a rejected standalone Candidate', () => {
    render(CandidateReviewPanel, {
      data: { ...data, review: { ...data.review, candidateStatus: 'rejected' as const } },
      standalone: true,
      form: null
    });

    expect(screen.getByRole('button', { name: 'Reopen' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Verify and publish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Needs information' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });

  it('edits one concise section at a time and posts only its strict draft patch', async () => {
    const { container } = render(CandidateReviewPanel, { data, form: null });

    await beginEditing('Place identity');
    const identityForm = container.querySelector<HTMLFormElement>(
      'form[data-section-form="identity"]'
    );
    expect(identityForm).toBeTruthy();
    expect(hiddenValue(identityForm, 'sectionId')).toBe('identity');
    expect(hiddenValue(identityForm, 'expectedItemVersion')).toBe('2');
    expect(hiddenValue(identityForm, 'expectedDraftVersion')).toBe('0');
    expect(identityForm?.querySelector('[name="currentDraftPayload"]')).toBeNull();
    expect(JSON.parse(hiddenValue(identityForm, 'sectionPayload'))).toEqual({
      operator: { name: 'Candidate operator' },
      category: 'cafe'
    });

    await fireEvent.input(within(identityForm!).getByLabelText('Operator'), {
      target: { value: 'Updated operator' }
    });
    expect(JSON.parse(hiddenValue(identityForm, 'sectionPayload')).operator.name).toBe(
      'Updated operator'
    );

    await beginEditing('Contact, hours and amenities');
    expect(container.querySelector('form[data-section-form="identity"]')).toBeNull();
    expect(container.querySelector('form[data-section-form="details"]')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(container.querySelector('form[data-section-form="details"]')).toBeNull();
  });

  it('posts exact Details, Location and Translation section contracts', async () => {
    const detailedData = {
      ...data,
      review: {
        ...data.review,
        websiteUrl: 'https://example.invalid',
        phone: '+354 555 0100',
        openingHours: { monday: '09:00-17:00', note: 'Call ahead' },
        dogAmenities: ['water_bowl']
      }
    };
    const { container } = render(CandidateReviewPanel, { data: detailedData, form: null });

    await beginEditing('Contact, hours and amenities');
    const detailsForm = sectionForm(container, 'details');
    expect(JSON.parse(hiddenValue(detailsForm, 'sectionPayload'))).toEqual({
      website_url: 'https://example.invalid',
      phone: '+354 555 0100',
      opening_hours: { monday: '09:00-17:00', note: 'Call ahead' },
      dog_amenities: ['water_bowl']
    });
    await fireEvent.input(within(detailsForm).getByLabelText('Monday'), {
      target: { value: '10:00-18:00' }
    });
    expect(JSON.parse(hiddenValue(detailsForm, 'sectionPayload')).opening_hours.monday).toBe(
      '10:00-18:00'
    );

    await beginEditing('Location');
    const locationForm = sectionForm(container, 'location');
    expect(locationForm.querySelector('[name="sectionPayload"]')).toBeNull();
    expect(hiddenValue(locationForm, 'sectionId')).toBe('location');
    expect(
      (within(locationForm).getByLabelText('Address or area description') as HTMLInputElement).value
    ).toBe('Candidate street 1');

    await beginEditing('Names and descriptions');
    const translationsForm = sectionForm(container, 'translations');
    expect(JSON.parse(hiddenValue(translationsForm, 'sectionPayload'))).toEqual({
      translations: {
        is: { name: 'Tillogustadur', description: 'Lysing' },
        en: { name: 'Candidate Place', description: 'Description' }
      }
    });
  });

  it('posts Published Location corrections directly with the Place version', async () => {
    const { container } = render(CandidateReviewPanel, {
      data: {
        ...data,
        review: {
          ...data.review,
          lifecycle: 'published',
          candidateStatus: 'published' as const
        }
      },
      form: null
    });

    await beginEditing('Location');
    const locationForm = sectionForm(container, 'location');

    expect(locationForm.getAttribute('action')).toBe('?/correctLocation');
    expect(hiddenValue(locationForm, 'expectedVersion')).toBe('3');
    expect(locationForm.querySelector('[name="expectedItemVersion"]')).toBeNull();
    expect(locationForm.querySelector('[name="expectedDraftVersion"]')).toBeNull();
    expect(locationForm.querySelector('[name="sectionId"]')).toBeNull();
    expect(screen.queryByText('Place is still a Candidate')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Review Candidate state' })).toBeNull();
  });

  it('normalizes Access Conditions into the strict snake-case patch', async () => {
    const { container } = render(CandidateReviewPanel, { data, form: null });

    await beginEditing('Current Access Condition');
    const form = sectionForm(container, 'access_conditions');
    expect(JSON.parse(hiddenValue(form, 'sectionPayload'))).toEqual({
      access_conditions: [
        {
          id: '70000000-0000-4000-8000-000000000002',
          access_area: 'outdoors',
          access_area_note: null,
          restraint_condition: 'leash_required',
          restraint_note: null,
          dog_eligibility: { scope: 'all_dogs' },
          availability_state: 'not_stated',
          availability_window: {},
          permission_requirement: 'standing_permission'
        }
      ]
    });

    await fireEvent.click(within(form).getByRole('button', { name: 'Add another condition' }));
    const addedConditions = JSON.parse(hiddenValue(form, 'sectionPayload')).access_conditions;
    expect(addedConditions).toHaveLength(2);
    expect(addedConditions[1]).not.toHaveProperty('id');
    expect(addedConditions[1]).toMatchObject({
      dog_eligibility: { scope: 'all_dogs' },
      availability_state: 'not_stated',
      availability_window: {}
    });

    await fireEvent.click(within(form).getAllByRole('button', { name: 'Remove condition' })[0]);
    expect(JSON.parse(hiddenValue(form, 'sectionPayload')).access_conditions).toHaveLength(1);
  });

  it('normalizes Evidence into the strict snake-case patch and keeps metadata editable', async () => {
    const { container } = render(CandidateReviewPanel, { data, form: null });

    await beginEditing('Supporting Evidence');
    const form = sectionForm(container, 'evidence_records');
    expect(JSON.parse(hiddenValue(form, 'sectionPayload'))).toEqual({
      evidence_records: [
        {
          id: '70000000-0000-4000-8000-000000000003',
          kind: 'official_website',
          source_url: 'https://example.invalid/source',
          source_citation: null,
          source_label: 'Official website',
          observed_at: '2026-07-13T09:00:00.000Z',
          source_metadata: { method: 'crawl' }
        }
      ]
    });
    await fireEvent.click(within(form).getByText('Additional details', { selector: 'summary' }));
    expect(within(form).getByRole('textbox', { name: 'Additional details' })).toBeTruthy();

    await fireEvent.click(
      within(form).getByRole('button', { name: 'Add another Evidence source' })
    );
    const sourceTitles = within(form).getAllByLabelText('Evidence source title');
    const sourceUrls = within(form).getAllByLabelText('Evidence URL');
    await fireEvent.input(sourceTitles[1], { target: { value: 'New official source' } });
    await fireEvent.input(sourceUrls[1], { target: { value: 'https://example.invalid/new' } });
    const addedEvidence = JSON.parse(hiddenValue(form, 'sectionPayload')).evidence_records;
    expect(addedEvidence).toHaveLength(2);
    expect(addedEvidence[1]).not.toHaveProperty('id');
    expect(addedEvidence[1]).toMatchObject({
      source_url: 'https://example.invalid/new',
      source_label: 'New official source',
      source_metadata: {}
    });

    await fireEvent.click(
      within(form).getAllByRole('button', { name: 'Remove Evidence source' })[0]
    );
    expect(JSON.parse(hiddenValue(form, 'sectionPayload')).evidence_records).toHaveLength(1);
  });

  it('keeps the densest section editor inside a mobile viewport', async () => {
    const initialViewport = { width: window.innerWidth, height: window.innerHeight };
    await browserPage.viewport(390, 844);

    try {
      const { container } = render(CandidateReviewPanel, { data, form: null });
      await beginEditing('Current Access Condition');
      const form = sectionForm(container, 'access_conditions');
      const formBox = form.getBoundingClientRect();

      expect(formBox.left).toBeGreaterThanOrEqual(0);
      expect(formBox.right).toBeLessThanOrEqual(window.innerWidth);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    } finally {
      await browserPage.viewport(initialViewport.width, initialViewport.height);
    }
  });
});

async function beginEditing(sectionTitle: string): Promise<void> {
  const section = screen.getByText(sectionTitle).closest('details');
  if (!section) throw new Error(`Missing section: ${sectionTitle}`);
  if (!section.open) await fireEvent.click(section.querySelector('summary')!);
  await fireEvent.click(within(section).getByRole('button', { name: `Edit ${sectionTitle}` }));
}

function sectionForm(container: HTMLElement, sectionId: string): HTMLFormElement {
  const form = container.querySelector<HTMLFormElement>(`form[data-section-form="${sectionId}"]`);
  if (!form) throw new Error(`Missing section form: ${sectionId}`);
  return form;
}

function hiddenValue(form: HTMLFormElement | null, name: string): string {
  const input = form?.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) throw new Error(`Missing hidden input: ${name}`);
  return input.value;
}
