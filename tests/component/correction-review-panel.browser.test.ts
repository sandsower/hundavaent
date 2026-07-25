import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import CorrectionReviewPanel from '$lib/moderation/CorrectionReviewPanel.svelte';
import { catalogues } from '$i18n';
import type { ModerationPlaceFlag } from '$server/place-flags/place-flags';
import CorrectionReviewPage from '../../src/routes/[lang=lang]/moderation/corrections-and-reports/[id]/+page.svelte';

const flag: ModerationPlaceFlag = {
  itemVersion: 1,
  draftVersion: 0,
  draftPayload: null,
  draftUpdatedBy: null,
  draftUpdatedAt: null,
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
  it('labels a superseded Trusted Verification and disables stale moderation decisions', () => {
    render(CorrectionReviewPanel, {
      data: {
        ...data,
        trustedVerification: {
          submissionId: 'submission-1',
          taskId: 'access_freshness:condition-1:verification-1',
          taskKind: 'access_freshness',
          outcome: 'superseded',
          supersededBySubmissionId: 'submission-2'
        }
      },
      form: null,
      standalone: true
    });

    expect(screen.getByText('Trusted Verification')).toBeTruthy();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Another contribution already resolved this exact task. Decisions are disabled.'
    );
    expect(screen.queryByRole('button', { name: 'Apply Correction' })).toBeNull();
    expect(
      screen
        .getAllByRole('button', { name: /Edit/ })
        .every((button) => button.hasAttribute('disabled'))
    ).toBe(true);
  });

  it('announces a newly confirmed useful Contribution after redirect', () => {
    render(CorrectionReviewPanel, {
      data: {
        ...data,
        flag: {
          ...flag,
          outcome: 'applied',
          contributionId: 'contribution-1'
        },
        contributionConfirmed: true
      },
      form: null,
      standalone: true
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'The useful Contribution has been confirmed.'
    );
    expect(screen.queryByRole('button', { name: 'Confirm useful Contribution' })).toBeNull();
  });

  it('announces a saved draft on the direct route', () => {
    render(CorrectionReviewPage, {
      data: { ...data, draftSaved: true },
      form: null
    } as never);

    expect(screen.getByRole('status')).toHaveTextContent('Draft changes saved.');
  });

  it('uses refreshed direct-route conflict data and disables stale actions when refresh fails', () => {
    const refreshedFlag = {
      ...flag,
      itemVersion: 7,
      draftVersion: 3,
      privateNote: 'The winning Moderator note.',
      outcome: 'rejected' as const
    };
    const { container, unmount } = render(CorrectionReviewPage, {
      data,
      form: {
        error: 'conflict',
        conflict: true,
        conflictReview: { flag: refreshedFlag, resolved: true }
      }
    } as never);

    expect(container.querySelector('[name="expectedItemVersion"]')).toBeNull();
    expect(screen.getByText('The winning Moderator note.')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(catalogues.en['flag.outcomeConflict']);
    expect(screen.queryByRole('button', { name: 'Confirm useful' })).toBeNull();
    unmount();

    const failed = render(CorrectionReviewPage, {
      data,
      form: { error: 'conflict', conflict: true, conflictRefreshFailed: true }
    } as never);
    expect(
      failed.container.querySelector('fieldset[data-route-review]')?.hasAttribute('disabled')
    ).toBe(true);
  });

  it('uses the shared compact shell and keeps the final decision form metadata-only', () => {
    const { container } = render(CorrectionReviewPanel, { data, form: null });

    expect(screen.queryByRole('heading', { name: 'Test Place' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Review summary' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Review summary' })).toBeTruthy();
    expect(screen.getAllByText('Safety Concern')).toHaveLength(2);
    expect(screen.getByText('Change under review').closest('details')?.open).toBe(false);
    expect(screen.getByText('Evidence and current verification').closest('details')?.open).toBe(
      true
    );
    expect(document.querySelector<HTMLDetailsElement>('#correction-related')?.open).toBe(true);

    const decision = container.querySelector<HTMLFormElement>('#correction-decision');
    expect(decision?.getAttribute('action')).toBe('?/decideCorrection');
    expect(decision?.querySelector('[name="expectedItemVersion"]')).toBeTruthy();
    expect(decision?.querySelector('[name="expectedDraftVersion"]')).toBeTruthy();
    expect(decision?.querySelector('[name="replacementCondition"]')).toBeNull();
    expect(decision?.querySelector('[name="evidenceSourceLabel"]')).toBeNull();
    expect(decision?.querySelector('[name="decisionNotes"]')).toBeNull();
  });

  it('reports unsaved Correction edits and guards standalone decisions until cancel', async () => {
    const editStates: boolean[] = [];
    const { container } = render(CorrectionReviewPanel, {
      data,
      form: null,
      standalone: true,
      oneditstatechange: (editing: boolean) => editStates.push(editing)
    });

    await waitFor(() => expect(editStates.at(-1)).toBe(false));
    await beginEdit('Open an access dispute');
    await waitFor(() => expect(editStates.at(-1)).toBe(true));
    expect(
      screen.getByText('Save or cancel this section before choosing a decision.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm useful' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Open dispute' })).toBeDisabled();

    await fireEvent.click(
      sectionForm(container, 'dispute').querySelector<HTMLButtonElement>('button[type="button"]')!
    );
    await waitFor(() => expect(editStates.at(-1)).toBe(false));
    expect(screen.getByRole('button', { name: 'Confirm useful' })).toBeEnabled();
  });

  it('saves dispute and transition details through independent section forms', async () => {
    const { container } = render(CorrectionReviewPanel, { data, form: null });

    await beginEdit('Open an access dispute');
    const dispute = sectionForm(container, 'dispute');
    expect(hiddenValue(dispute, 'expectedItemVersion')).toBe('1');
    expect(hiddenValue(dispute, 'expectedDraftVersion')).toBe('0');
    expect(
      (dispute.querySelector('[name="expectedVerificationId"]') as HTMLInputElement).value
    ).toBe(flag.currentVerificationId);
    expect(dispute.querySelector('[name="disputeReason"]')).toBeTruthy();
    expect(dispute.querySelector('[name="evidenceSourceLabel"]')).toBeTruthy();

    await beginEdit('Inactivate this Place');
    expect(container.querySelector('[data-section-form="dispute"]')).toBeNull();
    const transition = sectionForm(container, 'transition');
    expect((transition.querySelector('[name="expectedVersion"]') as HTMLInputElement).value).toBe(
      '4'
    );
    expect(transition.querySelector('[name="decisionNotes"]')).toBeTruthy();
  });

  it('saves an application independently for a proposed Access Condition correction', async () => {
    const correctionData = {
      ...data,
      flag: {
        ...flag,
        kind: 'correction' as const,
        isSafetyConcern: false,
        reportReason: null,
        proposedValue: {
          access_area: 'outdoors',
          access_area_note: 'Patio',
          restraint_condition: 'off_leash_permitted',
          restraint_note: null,
          dog_eligibility: { scope: 'all_dogs' },
          availability_state: 'whenever_open',
          availability_window: {},
          permission_requirement: 'standing_permission'
        } as never
      }
    };
    const { container } = render(CorrectionReviewPanel, { data: correctionData, form: null });

    await beginEdit('Change under review');
    const application = sectionForm(container, 'application');
    expect(application.querySelector('[name="expectedVerificationId"]')).toBeTruthy();
    expect(application.querySelector('[name="accessArea"]')).toBeTruthy();
    expect(application.querySelector('[name="verifiedAt"]')).toBeTruthy();
    expect(application.querySelector('[name="freshnessUntil"]')).toBeTruthy();
    expect(application.querySelector('[name="evidenceSourceLabel"]')).toBeTruthy();
  });

  it('keeps the direct route actionable through compact consequence dialogs', async () => {
    render(CorrectionReviewPanel, { data, form: { error: 'conflict' }, standalone: true });

    expect(screen.getByRole('heading', { name: 'Test Place' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(catalogues.en['flag.outcomeConflict']);
    expect(screen.getByRole('button', { name: 'Confirm useful' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open dispute' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inactivate Place' })).toBeTruthy();

    const confirmUsefulButton = screen.getByRole('button', { name: 'Confirm useful' });
    confirmUsefulButton.focus();
    await fireEvent.click(confirmUsefulButton);
    const confirmDialog = screen.getByRole('dialog', {
      name: 'Confirm this report as useful?'
    });
    await waitFor(() => expect(confirmDialog.matches(':modal')).toBe(true));
    expect(confirmDialog.contains(document.activeElement)).toBe(true);
    await fireEvent(confirmDialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(confirmUsefulButton);

    const openDisputeButton = screen.getByRole('button', { name: 'Open dispute' });
    openDisputeButton.focus();
    await fireEvent.click(openDisputeButton);
    const reasonDialog = screen.getByRole('dialog', { name: 'Open an access dispute?' });
    await waitFor(() => expect(reasonDialog.matches(':modal')).toBe(true));
    expect(reasonDialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByLabelText('Member explanation in Icelandic')).toBeRequired();
    await fireEvent(reasonDialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(openDisputeButton);

    await fireEvent.click(screen.getByRole('button', { name: 'Inactivate Place' }));
    expect(screen.getByRole('dialog', { name: 'Inactivate this Place?' })).toBeTruthy();
  });

  it('blocks applying a half-translated name and prefills the flagged locale empty', async () => {
    // The omitted-locale hatch reaches the database as a valid draft, so nothing below this panel
    // stops a Moderator publishing a Place named in one language only. This is that stop.
    const { container } = render(CorrectionReviewPanel, {
      data: hatchedNameCorrection(),
      form: null,
      standalone: true
    });

    expect(screen.getByRole('button', { name: 'Apply correction' })).toBeDisabled();
    expect(screen.getByText('A translation is still missing')).toBeTruthy();
    expect(
      screen.getByText(
        'This Correction cannot be applied until the missing translation is written.'
      )
    ).toBeTruthy();
    // Every other outcome stays open: a claim that cannot be applied can still be rejected.
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Needs information' })).toBeEnabled();

    await beginEdit('Change under review');
    const application = sectionForm(container, 'application');
    expect(application.querySelector<HTMLInputElement>('[name="fieldValueIs"]')?.value).toBe(
      'Nýtt heiti'
    );
    expect(application.querySelector<HTMLInputElement>('[name="fieldValueEn"]')?.value).toBe('');
    expect(application.querySelector('[name="fieldValueEn"]')).toBeRequired();
  });

  it('opens the section holding the missing locale rather than leaving it to be found', () => {
    render(CorrectionReviewPanel, { data: hatchedNameCorrection(), form: null, standalone: true });

    const section = document.querySelector<HTMLDetailsElement>('#correction-change');
    expect(section?.getAttribute('data-section-state')).toBe('blocking');
    expect(section?.open).toBe(true);
  });

  it('lifts the block once the application draft carries both locales', () => {
    const blocked = hatchedNameCorrection();
    render(CorrectionReviewPanel, {
      data: {
        ...blocked,
        flag: {
          ...blocked.flag,
          draftVersion: 1,
          draftPayload: {
            application_payload: {
              expected_version: 4,
              field_value: { is: 'Nýtt heiti', en: 'New name' }
            }
          } as never
        }
      },
      form: null,
      standalone: true
    });

    expect(screen.getByRole('button', { name: 'Apply correction' })).toBeEnabled();
    expect(screen.queryByText('A translation is still missing')).toBeNull();
  });

  it('leaves a fully translated name Correction applicable', () => {
    const complete = hatchedNameCorrection();
    render(CorrectionReviewPanel, {
      data: {
        ...complete,
        flag: {
          ...complete.flag,
          proposedValue: { is: 'Nýtt heiti', en: 'New name' } as never
        }
      },
      form: null,
      standalone: true
    });

    expect(screen.getByRole('button', { name: 'Apply correction' })).toBeEnabled();
  });

  it('asks whether a locale is written, not whether the flag is still attached', () => {
    // The draft is deep merged onto the claim in the database, so a stale needs_review can outlive
    // the gap it named. Blocking on the flag would block the Correction forever.
    const stale = hatchedNameCorrection();
    render(CorrectionReviewPanel, {
      data: {
        ...stale,
        flag: {
          ...stale.flag,
          proposedValue: { is: 'Nýtt heiti', en: 'New name', needs_review: 'en' } as never
        }
      },
      form: null,
      standalone: true
    });

    expect(screen.getByRole('button', { name: 'Apply correction' })).toBeEnabled();
  });

  it('blocks a whitespace-only locale, which is missing text wearing a key', () => {
    const blank = hatchedNameCorrection();
    render(CorrectionReviewPanel, {
      data: {
        ...blank,
        flag: { ...blank.flag, proposedValue: { is: 'Nýtt heiti', en: '   ' } as never }
      },
      form: null,
      standalone: true
    });

    expect(screen.getByRole('button', { name: 'Apply correction' })).toBeDisabled();
  });

  it('never blocks a field that has no locales to be missing', () => {
    const phone = hatchedNameCorrection();
    render(CorrectionReviewPanel, {
      data: {
        ...phone,
        flag: {
          ...phone.flag,
          targetField: 'phone' as const,
          proposedValue: { value: '+354 555 0100' } as never
        }
      },
      form: null,
      standalone: true
    });

    expect(screen.getByRole('button', { name: 'Apply correction' })).toBeEnabled();
  });

  it('keeps a terminal conflict visible but prevents stale resubmission', () => {
    render(CorrectionReviewPanel, {
      data: { ...data, flag: { ...flag, outcome: 'rejected' } },
      form: { error: 'conflict' },
      standalone: true
    });

    expect(screen.queryByRole('button', { name: 'Confirm useful' })).toBeNull();
  });

  it('names the whole Place as the subject instead of an Access Condition nobody mentioned', () => {
    render(CorrectionReviewPanel, {
      data: placeLevelReport(),
      form: null,
      standalone: true
    });

    expect(screen.getByText('The whole place')).toBeTruthy();
    expect(screen.queryByText('An Access Condition')).toBeNull();
  });

  it('renders the place snapshot, which is neither of the other two snapshot shapes', () => {
    const { container } = render(CorrectionReviewPanel, {
      data: placeLevelReport(),
      form: null,
      standalone: true
    });

    const snapshot = container.querySelector('[data-place-snapshot]');
    expect(snapshot).toBeTruthy();
    expect(snapshot).toHaveTextContent('Prófstaður / Test Place');
    // Localized, not the stored enum: 'cafe' is a database word and a Moderator reads a catalogue.
    expect(snapshot).toHaveTextContent('Café');
    expect(snapshot).toHaveTextContent('Reykjavík');
    // Nothing was proposed and there is no live value, so no before-and-after grid is laid out.
    expect(screen.queryByText("Member's proposal")).toBeNull();
  });

  it('never reads a missing live value on a whole-Place Report as drift', () => {
    render(CorrectionReviewPanel, {
      data: placeLevelReport(),
      form: null,
      standalone: true
    });

    // The safety bit is the only thing that should ask for attention here.
    expect(screen.queryByText('Current value now')).toBeNull();
  });

  it('offers no Access Dispute on a target that has no Access Condition', () => {
    render(CorrectionReviewPanel, {
      data: placeLevelReport(),
      form: null,
      standalone: true
    });

    expect(screen.queryByRole('button', { name: 'Open dispute' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Inactivate Place' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm useful' })).toBeTruthy();
  });
});

/**
 * A Report about the whole Place: no field, no Condition, no proposal, and a snapshot recording what
 * identified the Place at the moment the claim was raised.
 */
function placeLevelReport(): typeof data {
  return {
    ...data,
    flag: {
      ...flag,
      reportReason: 'closed' as const,
      targetKind: 'place' as const,
      targetField: null,
      accessConditionId: null,
      currentValueSnapshot: {
        name: { is: 'Prófstaður', en: 'Test Place' },
        category: 'cafe',
        locality: 'Reykjavík'
      } as never,
      currentLiveValue: null,
      currentVerificationId: null,
      currentVerificationStatus: null,
      currentVerificationVerifiedAt: null,
      currentVerificationFreshnessUntil: null,
      currentVerificationEvidence: null,
      proposedValue: null
    },
    related: []
  };
}

function hatchedNameCorrection(): typeof data {
  return {
    ...data,
    flag: {
      ...flag,
      kind: 'correction' as const,
      isSafetyConcern: false,
      reportReason: null,
      targetKind: 'place_field' as const,
      targetField: 'name' as const,
      accessConditionId: null,
      currentValueSnapshot: { is: 'Gamalt heiti', en: 'Old name' } as never,
      currentLiveValue: { is: 'Gamalt heiti', en: 'Old name' } as never,
      // The English key is absent, not empty: the Member never wrote it and the shape says so.
      proposedValue: { is: 'Nýtt heiti', needs_review: 'en' } as never
    },
    related: []
  };
}

async function beginEdit(sectionTitle: string): Promise<void> {
  const section = screen.getByText(sectionTitle).closest('details');
  if (!section) throw new Error(`Missing section: ${sectionTitle}`);
  if (!section.open) await fireEvent.click(section.querySelector('summary')!);
  await fireEvent.click(screen.getByRole('button', { name: `Edit ${sectionTitle}` }));
}

function sectionForm(container: HTMLElement, sectionId: string): HTMLFormElement {
  const form = container.querySelector<HTMLFormElement>(`form[data-section-form="${sectionId}"]`);
  if (!form) throw new Error(`Missing section form: ${sectionId}`);
  return form;
}

function hiddenValue(form: HTMLFormElement, name: string): string {
  const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) throw new Error(`Missing hidden input: ${name}`);
  return input.value;
}
