import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import AccessEligibilityCorrection from '$lib/discovery/AccessEligibilityCorrection.svelte';
import type { PublishedAccessFacts } from '$server/discovery/public-places';

const { requestAuthentication } = vi.hoisted(() => ({ requestAuthentication: vi.fn() }));
vi.mock('$lib/auth/controller', () => ({ requestAuthentication }));

const placeId = '30000000-0000-4000-8000-000000000003';
const accessConditionId = '40000000-0000-4000-8000-000000000003';
const trigger = /correct which dogs are welcome/i;
const weightLabel = 'Maximum weight in kilograms';
const dogsLabel = 'Maximum number of dogs';

function condition(overrides: Partial<PublishedAccessFacts> = {}): PublishedAccessFacts {
  return {
    id: accessConditionId,
    accessArea: 'indoors',
    accessAreaNote: null,
    restraintCondition: 'leash_required',
    restraintNote: null,
    dogEligibility: { scope: 'all_dogs' },
    availabilityWindow: {},
    availabilityState: 'not_stated',
    permissionRequirement: 'standing_permission',
    ...overrides
  };
}

function mount(options: { signedIn?: boolean; condition?: Partial<PublishedAccessFacts> } = {}) {
  return render(AccessEligibilityCorrection, {
    placeId,
    placeName: 'Brikk',
    lang: 'en' as const,
    copy: catalogues.en,
    signedIn: options.signedIn ?? true,
    condition: condition(options.condition),
    announce: () => undefined
  });
}

function submittedResponse(): Response {
  return new Response(JSON.stringify({ status: 'submitted', flagId: 'flag-1' }));
}

function captureFetch(): RequestInit[] {
  const calls: RequestInit[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      return submittedResponse();
    })
  );
  return calls;
}

async function openEditor(): Promise<void> {
  await fireEvent.click(screen.getByRole('button', { name: trigger }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  requestAuthentication.mockReset();
});

describe('AccessEligibilityCorrection', () => {
  it('offers the three eligibilities a member can state and never a sourced note', async () => {
    mount();
    await openEditor();

    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      'all_dogs',
      'maximum_weight_kg',
      'maximum_dogs'
    ]);
  });

  it('shows no numeric control until a limit is chosen', async () => {
    mount();
    await openEditor();

    expect(screen.queryByLabelText(weightLabel)).toBeNull();
    expect(screen.queryByLabelText(dogsLabel)).toBeNull();
  });

  it('reveals the numeric control on a limit and carries focus into it', async () => {
    mount();
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Only dogs under a weight limit' }));

    const weight = screen.getByLabelText(weightLabel);
    expect(weight).toBeRequired();
    await waitFor(() => expect(document.activeElement).toBe(weight));
  });

  it('does not lose that focus to the note, which follows the value controls', async () => {
    mount();
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Only a limited number of dogs' }));

    const dogs = screen.getByLabelText(dogsLabel);
    await waitFor(() => expect(document.activeElement).toBe(dogs));
    const note = screen.getByRole('textbox', { name: 'Anything to add? (optional)' });
    expect(dogs.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('seeds the choice and the figure from a place that already has a weight limit', async () => {
    mount({ condition: { dogEligibility: { scope: 'restricted', maximumWeightKg: 10 } } });
    await openEditor();

    const checked = screen.getByRole('radio', { name: 'Only dogs under a weight limit' });
    expect(checked).toBeChecked();
    expect(screen.getByLabelText(weightLabel)).toHaveValue(10);
    // The checked option is the entry point, as in any radio group. The numeric control is only
    // claimed when the member changes the choice.
    await waitFor(() => expect(document.activeElement).toBe(checked));
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('seeds nothing when the stored eligibility carries a moderator note', async () => {
    // The group cannot represent a sourced note, and pre-checking a substitute would state a rule
    // the place does not have.
    mount({
      condition: { dogEligibility: { scope: 'restricted', maximumDogs: 2, notes: 'Ask the bar.' } }
    });
    await openEditor();

    expect(screen.getAllByRole('radio').some((radio) => (radio as HTMLInputElement).checked)).toBe(
      false
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('seeds nothing when the stored eligibility carries two limits at once', async () => {
    mount({
      condition: {
        dogEligibility: { scope: 'restricted', maximumWeightKg: 10, maximumDogs: 2 }
      }
    });
    await openEditor();

    expect(screen.getAllByRole('radio').some((radio) => (radio as HTMLInputElement).checked)).toBe(
      false
    );
  });

  it('refuses to send a limit with no figure behind it', async () => {
    mount();
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Only dogs under a weight limit' }));

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await fireEvent.input(screen.getByLabelText(weightLabel), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await fireEvent.input(screen.getByLabelText(weightLabel), { target: { value: '10' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('refuses a fractional number of dogs, which the database rejects too', async () => {
    mount();
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Only a limited number of dogs' }));
    await fireEvent.input(screen.getByLabelText(dogsLabel), { target: { value: '2.5' } });

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('sends the eligibility object, not the radio key', async () => {
    const calls = captureFetch();
    mount();
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Only dogs under a weight limit' }));
    await fireEvent.input(screen.getByLabelText(weightLabel), { target: { value: '10' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0].body))).toEqual({
      target: 'access_condition',
      accessConditionId,
      dimension: 'eligibility',
      value: { scope: 'restricted', maximumWeightKg: 10 },
      note: null
    });
  });

  it('sends all dogs as a scope with nothing bounding it', async () => {
    const calls = captureFetch();
    mount({ condition: { dogEligibility: { scope: 'restricted', maximumDogs: 2 } } });
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'All dogs welcome' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0].body))).toEqual({
      target: 'access_condition',
      accessConditionId,
      dimension: 'eligibility',
      value: { scope: 'all_dogs' },
      note: null
    });
  });

  it('keeps confirm disabled while the figure is the one already on file', async () => {
    mount({ condition: { dogEligibility: { scope: 'restricted', maximumWeightKg: 10 } } });
    await openEditor();

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await fireEvent.input(screen.getByLabelText(weightLabel), { target: { value: '12' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('reseeds the choice and the figure when the editor is reopened', async () => {
    mount({ condition: { dogEligibility: { scope: 'restricted', maximumWeightKg: 10 } } });
    await openEditor();
    await fireEvent.input(screen.getByLabelText(weightLabel), { target: { value: '12' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await openEditor();

    expect(screen.getByLabelText(weightLabel)).toHaveValue(10);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('asks a signed-out reader to sign in and sends nothing', async () => {
    const fetchSpy = vi.fn(async () => submittedResponse());
    vi.stubGlobal('fetch', fetchSpy);
    mount({ signedIn: false });
    await openEditor();
    await fireEvent.click(screen.getByRole('radio', { name: 'Only a limited number of dogs' }));
    await fireEvent.input(screen.getByLabelText(dogsLabel), { target: { value: '2' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(requestAuthentication).toHaveBeenCalledWith({ origin: 'contribution' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('closes on Escape from the numeric control without the key reaching the chip behind it', async () => {
    const reachedOuterListener = vi.fn();
    document.addEventListener('keydown', reachedOuterListener);
    mount({ condition: { dogEligibility: { scope: 'restricted', maximumDogs: 2 } } });
    await openEditor();

    screen
      .getByLabelText(dogsLabel)
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(reachedOuterListener).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'What applies here?' })).toBeNull()
    );
    document.removeEventListener('keydown', reachedOuterListener);
  });
});
