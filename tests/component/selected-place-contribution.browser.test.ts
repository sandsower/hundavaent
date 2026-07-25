import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import type { PendingPlaceFlag } from '$lib/contributions/correction';
import SelectedPlaceCard from '$lib/discovery/SelectedPlaceCard.svelte';
import type {
  PublishedAccessFacts,
  PublishedPlaceProfile,
  PublishedPlaceSummary
} from '$server/discovery/public-places';

const { requestAuthentication } = vi.hoisted(() => ({ requestAuthentication: vi.fn() }));
vi.mock('$lib/auth/controller', () => ({ requestAuthentication }));

const placeId = '30000000-0000-4000-8000-000000000003';
const conditionId = '40000000-0000-4000-8000-000000000001';
const secondConditionId = '40000000-0000-4000-8000-000000000002';
const pendingLine = 'Correction sent - pending review';

function condition(overrides: Partial<PublishedAccessFacts> = {}): PublishedAccessFacts {
  return {
    id: conditionId,
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

const place: PublishedPlaceSummary = {
  placeId,
  name: 'Brikk',
  category: 'cafe',
  locality: 'Reykjavík',
  latitude: 64.1423,
  longitude: -21.9555,
  wheelchairAccessibility: 'accessible',
  accessConditionCount: 1,
  simpleAccessSummary: true,
  accessArea: 'indoors',
  restraintCondition: 'leash_required',
  permissionRequirement: 'standing_permission',
  accessConditions: [
    {
      accessArea: 'indoors',
      restraintCondition: 'leash_required',
      permissionRequirement: 'standing_permission',
      dogEligibilityState: 'all_dogs',
      availabilityState: 'not_stated'
    }
  ],
  primaryPhoto: null
};

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
    websiteUrl: null,
    phone: null,
    wheelchairAccessibility: 'accessible',
    openingHours: {},
    dogAmenities: [],
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

/**
 * URL-aware rather than a blanket stub: the card mounts a check-in control and a rating beside the
 * contribution affordances, and a stub that answered every request with the pending payload would
 * be testing a fiction.
 */
function stubFetch(pending: PendingPlaceFlag[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/corrections')) {
      return new Response(JSON.stringify({ pending }), {
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({}), { headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function pendingCondition(accessConditionId = conditionId): PendingPlaceFlag {
  return {
    kind: 'correction',
    targetKind: 'access_condition',
    targetField: null,
    accessConditionId,
    reportReason: null,
    status: 'submitted'
  };
}

function mount(
  options: {
    signedIn?: boolean;
    profile?: Partial<PublishedPlaceProfile>;
  } = {}
) {
  return render(SelectedPlaceCard, {
    place,
    lang: 'en' as const,
    copy: catalogues.en,
    profile: profile(options.profile),
    loading: false,
    loadFailed: false,
    onClose: () => undefined,
    onRetry: () => undefined,
    signedIn: options.signedIn ?? true
  });
}

async function openChip(name: string): Promise<void> {
  await fireEvent.click(screen.getByRole('button', { name }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  requestAuthentication.mockReset();
});

describe('the chip-panel affordances', () => {
  it('offers an editor on all four editable dimensions', async () => {
    stubFetch([]);
    mount();

    await openChip('Welcome indoors');
    expect(screen.getByRole('button', { name: /correct where dogs are welcome/i })).toBeTruthy();
    await openChip('Leash required');
    expect(screen.getByRole('button', { name: /correct the restraint rule/i })).toBeTruthy();
    await openChip('Generally welcome');
    expect(screen.getByRole('button', { name: /correct the permission needed/i })).toBeTruthy();
    await openChip('All dogs welcome');
    expect(screen.getByRole('button', { name: /correct which dogs are welcome/i })).toBeTruthy();
  });

  it('links the timing chip to the prefilled form instead of pretending to be a radio group', async () => {
    stubFetch([]);
    mount();

    await openChip('Information not stated');
    const link = screen.getByRole('link', {
      name: 'Fix the times dogs are welcome at Brikk'
    });
    expect(link.getAttribute('href')).toContain(
      `/places/${placeId}/correct?conditionId=${conditionId}`
    );
  });
});

describe('what the card does about a correction already sent', () => {
  it('asks the server what the member already has open once the profile is loaded', async () => {
    const fetchMock = stubFetch([]);
    mount();

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes(`/api/places/${placeId}/corrections`)
        )
      ).toBe(true)
    );
  });

  it('never asks on behalf of a signed-out reader, who has nothing open', async () => {
    const fetchMock = stubFetch([]);
    mount({ signedIn: false });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Welcome indoors' })).toBeTruthy()
    );
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/corrections'))).toBe(
      false
    );
  });

  it('suppresses all four editors and the timing link on a condition with anything open', async () => {
    // A flag on a Condition proposes the whole Condition object, so a second edit raised beside it
    // would build from the stored value and propose reverting the first.
    stubFetch([pendingCondition()]);
    mount();

    await openChip('Welcome indoors');
    await waitFor(() => expect(screen.getByText(pendingLine)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /correct where dogs are welcome/i })).toBeNull();

    await openChip('Leash required');
    expect(screen.queryByRole('button', { name: /correct the restraint rule/i })).toBeNull();
    await openChip('Generally welcome');
    expect(screen.queryByRole('button', { name: /correct the permission needed/i })).toBeNull();
    await openChip('All dogs welcome');
    expect(screen.queryByRole('button', { name: /correct which dogs are welcome/i })).toBeNull();
    await openChip('Information not stated');
    expect(screen.queryByRole('link', { name: /fix the times/i })).toBeNull();
    expect(screen.getByText(pendingLine)).toBeTruthy();
  });

  it('leaves the editors alone when the open flag is on another condition', async () => {
    stubFetch([pendingCondition(secondConditionId)]);
    mount();

    await openChip('Leash required');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /correct the restraint rule/i })).toBeTruthy()
    );
    expect(screen.queryByText(pendingLine)).toBeNull();
  });
});

describe('the reveal on the practical details', () => {
  it('sits at the foot of the details as one quiet line', async () => {
    stubFetch([]);
    mount();

    await fireEvent.click(screen.getByText('Place details'));
    expect(screen.getByRole('button', { name: 'Correct the details for Brikk' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /correct the name of/i })).toBeNull();
  });
});
