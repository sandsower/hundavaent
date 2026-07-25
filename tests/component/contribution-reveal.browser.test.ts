import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import type { PendingPlaceFlag } from '$lib/contributions/correction';
import ContributionReveal from '$lib/discovery/ContributionReveal.svelte';
import type { PublishedAccessFacts, PublishedPlaceProfile } from '$server/discovery/public-places';

const { requestAuthentication } = vi.hoisted(() => ({ requestAuthentication: vi.fn() }));
vi.mock('$lib/auth/controller', () => ({ requestAuthentication }));

const placeId = '30000000-0000-4000-8000-000000000003';
const firstConditionId = '40000000-0000-4000-8000-000000000001';
const secondConditionId = '40000000-0000-4000-8000-000000000002';
const revealTrigger = /correct the details for brikk/i;

function condition(overrides: Partial<PublishedAccessFacts> = {}): PublishedAccessFacts {
  return {
    id: firstConditionId,
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

function profile(overrides: Partial<PublishedPlaceProfile> = {}): PublishedPlaceProfile {
  return {
    placeId,
    name: 'Brikk',
    description: 'A cafe.',
    category: 'cafe',
    location: {
      addressLine: 'Hundagata 1',
      locality: 'Reykjavík',
      postalCode: '101',
      latitude: 64.1423,
      longitude: -21.9555
    },
    websiteUrl: 'https://example.invalid/brikk',
    phone: '+354 555 0100',
    wheelchairAccessibility: 'accessible',
    openingHours: {},
    dogAmenities: ['water_bowl', 'covered patio hook'],
    accessConditions: [condition()],
    dogFriendlinessSummary: {
      placeId,
      visible: false,
      eligibleCount: null,
      trailingTwelveMonthCount: null,
      dimensions: [],
      overallMean: null,
      overallVisible: false
    },
    photos: [],
    ...overrides
  };
}

function mount(
  options: {
    signedIn?: boolean;
    pending?: PendingPlaceFlag[];
    profile?: Partial<PublishedPlaceProfile>;
    onSubmitted?: (flag: PendingPlaceFlag) => void;
  } = {}
) {
  return render(ContributionReveal, {
    placeName: 'Brikk',
    lang: 'en' as const,
    copy: catalogues.en,
    signedIn: options.signedIn ?? true,
    profile: profile(options.profile),
    pending: options.pending ?? [],
    onSubmitted: options.onSubmitted ?? (() => undefined)
  });
}

function pendingField(field: PendingPlaceFlag['targetField']): PendingPlaceFlag {
  return {
    kind: 'correction',
    targetKind: 'place_field',
    targetField: field,
    accessConditionId: null,
    reportReason: null,
    status: 'submitted'
  };
}

function pendingCondition(accessConditionId: string): PendingPlaceFlag {
  return {
    kind: 'correction',
    targetKind: 'access_condition',
    targetField: null,
    accessConditionId,
    reportReason: null,
    status: 'submitted'
  };
}

function pendingReport(reportReason: string): PendingPlaceFlag {
  return {
    kind: 'report',
    targetKind: 'place',
    targetField: null,
    accessConditionId: null,
    reportReason,
    status: 'submitted'
  };
}

function reportAction(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

function submittedResponse(): Response {
  return new Response(JSON.stringify({ status: 'submitted', flagId: 'flag-1' }));
}

async function reveal(): Promise<void> {
  await fireEvent.click(screen.getByRole('button', { name: revealTrigger }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  requestAuthentication.mockReset();
});

describe('the contribution reveal', () => {
  it('shows one quiet line and nothing else until a member asks', () => {
    mount();

    expect(screen.getByRole('button', { name: revealTrigger })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /correct the name of/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /correct the phone number/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /correct the website address/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /correct what is there for dogs/i })).toBeNull();
  });

  it('reveals every place-fact affordance, including the name the card never showed', async () => {
    mount();
    await reveal();

    expect(
      screen.getByRole('button', { name: 'Not right? Correct the name of Brikk' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Not right? Correct the website address for Brikk' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Not right? Correct the phone number for Brikk' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Not right? Correct what is there for dogs at Brikk' })
    ).toBeTruthy();
  });

  it('names each fact and shows the published value beside its affordance', async () => {
    mount();
    await reveal();

    expect(screen.getByText('Brikk')).toBeTruthy();
    expect(screen.getByText('https://example.invalid/brikk')).toBeTruthy();
    expect(screen.getByText('+354 555 0100')).toBeTruthy();
    // The raw stored vocabulary, not the localized rendering above: it is what the editor edits.
    expect(screen.getByText('water_bowl, covered patio hook')).toBeTruthy();
  });

  it('carries focus into the panel and back to the line when it closes', async () => {
    mount();
    await reveal();

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Not right? Correct the name of Brikk' })
      )
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: revealTrigger }))
    );
  });

  it('says what is missing rather than leaving a fact blank', async () => {
    mount({ profile: { websiteUrl: null, phone: null, dogAmenities: [] } });
    await reveal();

    expect(screen.getAllByText('Not available').length).toBe(3);
  });
});

describe('the place-field editors behind the reveal', () => {
  it('prefills the name and sends the single locale the member typed', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init: init ?? {} });
        return submittedResponse();
      })
    );
    mount();
    await reveal();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Not right? Correct the name of Brikk' })
    );

    const input = screen.getByRole('textbox', { name: 'Name of this place' });
    expect(input).toHaveValue('Brikk');
    await fireEvent.input(input, { target: { value: 'Brikk Kaffihús' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      target: 'place_field',
      field: 'name',
      value: 'Brikk Kaffihús',
      note: null
    });
  });

  it('never offers to clear a name, because a place always has one', async () => {
    mount();
    await reveal();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Not right? Correct the name of Brikk' })
    );

    expect(screen.queryByRole('button', { name: /^clear/i })).toBeNull();
    await fireEvent.input(screen.getByRole('textbox', { name: 'Name of this place' }), {
      target: { value: '   ' }
    });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('treats a cleared website as a removal and sends a null value', async () => {
    const calls: Array<RequestInit> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(init ?? {});
        return submittedResponse();
      })
    );
    mount();
    await reveal();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Not right? Correct the website address for Brikk' })
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Clear Website address' }));
    expect(screen.getByRole('textbox', { name: 'Website address' })).toHaveValue('');
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0].body))).toEqual({
      target: 'place_field',
      field: 'website_url',
      value: null,
      note: null
    });
  });

  it('splits the amenity list on commas and drops the blanks', async () => {
    const calls: Array<RequestInit> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(init ?? {});
        return submittedResponse();
      })
    );
    mount();
    await reveal();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Not right? Correct what is there for dogs at Brikk' })
    );

    const input = screen.getByRole('textbox', { name: 'What is there for dogs?' });
    expect(input).toHaveValue('water_bowl, covered patio hook');
    await fireEvent.input(input, { target: { value: 'water_bowl, , shaded bench ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0].body))).toEqual({
      target: 'place_field',
      field: 'dog_amenities',
      value: ['water_bowl', 'shaded bench'],
      note: null
    });
  });

  it('caps what a member can type so the server never has to reject a long paste', async () => {
    mount();
    await reveal();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Not right? Correct the name of Brikk' })
    );
    expect(screen.getByRole('textbox', { name: 'Name of this place' })).toHaveAttribute(
      'maxlength',
      '200'
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await fireEvent.click(
      screen.getByRole('button', { name: 'Not right? Correct the website address for Brikk' })
    );
    expect(screen.getByRole('textbox', { name: 'Website address' })).toHaveAttribute(
      'maxlength',
      '2048'
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // The amenities control holds the whole comma-separated list, so any per-entry maxlength on it
    // would cap the list at about one entry and lock a longer stored list out of editing.
    await fireEvent.click(
      screen.getByRole('button', { name: 'Not right? Correct what is there for dogs at Brikk' })
    );
    expect(screen.getByRole('textbox', { name: 'What is there for dogs?' })).not.toHaveAttribute(
      'maxlength'
    );
  });

  it('refuses to send more amenities than the server accepts, and says so', async () => {
    mount();
    await reveal();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Not right? Correct what is there for dogs at Brikk' })
    );

    await fireEvent.input(screen.getByRole('textbox', { name: 'What is there for dogs?' }), {
      target: { value: Array.from({ length: 21 }, (_entry, index) => `item${index}`).join(', ') }
    });

    expect(screen.getByText('Up to 20 of them, each up to 200 characters.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('puts the value before the note and opens with focus on the value', async () => {
    mount();
    await reveal();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Not right? Correct the phone number for Brikk' })
    );

    const value = screen.getByRole('textbox', { name: 'Phone number' });
    const note = screen.getByRole('textbox', { name: 'Anything to add? (optional)' });
    await waitFor(() => expect(document.activeElement).toBe(value));
    expect(value.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('asks a signed-out reader to sign in and sends nothing', async () => {
    const fetchSpy = vi.fn(async () => submittedResponse());
    vi.stubGlobal('fetch', fetchSpy);
    mount({ signedIn: false });
    await reveal();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Not right? Correct the name of Brikk' })
    );
    await fireEvent.input(screen.getByRole('textbox', { name: 'Name of this place' }), {
      target: { value: 'Brikk Kaffihús' }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(requestAuthentication).toHaveBeenCalledWith({ origin: 'contribution' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('what the reveal does about a correction already sent', () => {
  it('replaces only the flagged field with the pending line', async () => {
    mount({ pending: [pendingField('name')] });
    await reveal();

    expect(screen.getByText('Correction sent - pending review')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Not right? Correct the name of Brikk' })
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Not right? Correct the phone number for Brikk' })
    ).toBeTruthy();
  });

  it('leaves every affordance in place when nothing is open', async () => {
    mount({ pending: [pendingField('opening_hours')] });
    await reveal();

    expect(screen.queryByText('Correction sent - pending review')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Not right? Correct the name of Brikk' })
    ).toBeTruthy();
  });
});

const closedAction = 'This place is closed - report a closure at Brikk';
const movedAction = 'This place has moved - report a move at Brikk';
const unsafeAction = 'This place is unsafe for dogs - report unsafe conditions for dogs at Brikk';

describe('the place-level report actions behind the reveal', () => {
  it('stays out of the way until a member asks, then offers all three claims', async () => {
    mount();
    expect(screen.queryByRole('button', { name: closedAction })).toBeNull();

    await reveal();

    expect(reportAction(closedAction)).toBeTruthy();
    expect(reportAction(movedAction)).toBeTruthy();
    expect(reportAction(unsafeAction)).toBeTruthy();
  });

  it('expands to a confirmation and a note, and to nothing else at all', async () => {
    mount();
    await reveal();
    await fireEvent.click(reportAction(closedAction));

    // The claim is the trigger. There is nothing to pick, and the note is the only field.
    expect(screen.getByText('Report that this place is closed')).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const note = screen.getByRole('textbox', { name: 'Anything to add? (optional)' });
    expect(screen.getAllByRole('textbox')).toEqual([note]);
    await waitFor(() => expect(document.activeElement).toBe(note));
  });

  it('sends the reason and the note, and never a language the server would have to trust', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init: init ?? {} });
        return submittedResponse();
      })
    );
    const submitted: PendingPlaceFlag[] = [];
    mount({ onSubmitted: (flag) => submitted.push(flag) });
    await reveal();
    await fireEvent.click(reportAction(unsafeAction));
    await fireEvent.input(screen.getByRole('textbox', { name: 'Anything to add? (optional)' }), {
      target: { value: '  Broken glass by the door.  ' }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe(`/api/places/${placeId}/reports`);
    expect(calls[0].url).not.toContain('lang=');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      reason: 'unsafe',
      note: 'Broken glass by the door.'
    });

    // Appended by the card without a refetch, so the action it came from is silenced at once.
    await waitFor(() =>
      expect(submitted).toEqual([
        {
          kind: 'report',
          targetKind: 'place',
          targetField: null,
          accessConditionId: null,
          reportReason: 'unsafe',
          status: 'submitted'
        }
      ])
    );
    await waitFor(() =>
      expect(
        screen.getByText('Thank you. A Moderator will check this.', { selector: 'p' })
      ).toBeTruthy()
    );
  });

  it('asks a signed-out reader to sign in at confirm and sends nothing', async () => {
    const fetchSpy = vi.fn(async () => submittedResponse());
    vi.stubGlobal('fetch', fetchSpy);
    mount({ signedIn: false });
    await reveal();

    // All four lines are offered to everyone; the gate is at confirm, exactly as it is for a
    // Correction.
    await fireEvent.click(reportAction(closedAction));
    await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(requestAuthentication).toHaveBeenCalledWith({ origin: 'contribution' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('deep-links everything else to the report form with no target chosen for the member', async () => {
    mount();
    await reveal();

    const link = screen.getByRole('link', {
      name: 'Something else is wrong - report another problem with Brikk'
    });
    expect(link.getAttribute('href')).toContain(`/places/${placeId}/report`);
    expect(link.getAttribute('href')).not.toContain('?');
  });
});

describe('what the reveal does about a report already sent', () => {
  it('replaces only the reason that is open and names the claim it is standing in for', async () => {
    mount({ pending: [pendingReport('closed')] });
    await reveal();

    expect(screen.getByText('Report sent - pending review')).toBeTruthy();
    expect(screen.getByText('This place is closed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: closedAction })).toBeNull();
    expect(reportAction(movedAction)).toBeTruthy();
    expect(reportAction(unsafeAction)).toBeTruthy();
  });

  it('suppresses reports and corrections independently in both directions', async () => {
    mount({
      pending: [pendingReport('closed'), pendingCondition(firstConditionId), pendingField('name')]
    });
    await reveal();

    // A Correction on a fact says nothing about the Place being closed, and the reverse.
    expect(reportAction(movedAction)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Not right? Correct the phone number for Brikk' })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: closedAction })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Not right? Correct the name of Brikk' })
    ).toBeNull();
  });

  it('leaves every claim available when the open report is about a different place', async () => {
    mount({ pending: [pendingReport('inaccurate')] });
    await reveal();

    // 'inaccurate' is a report-form reason with no card action, so nothing is silenced.
    expect(screen.queryByText('Report sent - pending review')).toBeNull();
    expect(reportAction(closedAction)).toBeTruthy();
  });
});

describe('the multi-condition deep links', () => {
  it('offers one prefilled link per condition when the card cannot address them', async () => {
    mount({
      profile: {
        accessConditions: [
          condition(),
          condition({ id: secondConditionId, accessArea: 'outdoors' })
        ]
      }
    });
    await reveal();

    const first = screen.getByRole('link', { name: 'Not right? Correct condition 1 at Brikk' });
    expect(first.getAttribute('href')).toContain(
      `/places/${placeId}/correct?conditionId=${firstConditionId}`
    );
    expect(
      screen
        .getByRole('link', { name: 'Not right? Correct condition 2 at Brikk' })
        .getAttribute('href')
    ).toContain(`conditionId=${secondConditionId}`);
  });

  it('offers no condition links at all when the place has only one', async () => {
    mount();
    await reveal();

    expect(screen.queryByRole('link', { name: /correct condition/i })).toBeNull();
  });

  it('suppresses the link for a condition that already has something open', async () => {
    mount({
      profile: {
        accessConditions: [
          condition(),
          condition({ id: secondConditionId, accessArea: 'outdoors' })
        ]
      },
      pending: [pendingCondition(firstConditionId)]
    });
    await reveal();

    expect(
      screen.queryByRole('link', { name: 'Not right? Correct condition 1 at Brikk' })
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Not right? Correct condition 2 at Brikk' })
    ).toBeTruthy();
    expect(screen.getByText('Correction sent - pending review')).toBeTruthy();
  });
});
