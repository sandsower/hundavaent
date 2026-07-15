import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page as browserPage } from 'vitest/browser';

import { catalogues } from '$i18n';
import { defaultDiscoveryState } from '$lib/discovery/state';
import MapListShell from '$lib/discovery/MapListShell.svelte';
import { createDomTestMapAdapter } from '$lib/map/dom-test-adapter';
import type { MapAdapter, MapCallbacks } from '$lib/map/types';

const { captureAnalytics } = vi.hoisted(() => ({ captureAnalytics: vi.fn() }));

vi.mock('$lib/analytics/posthog', () => ({
  postHogAnalytics: { capture: captureAnalytics }
}));

beforeEach(() => captureAnalytics.mockClear());

const places = [
  {
    placeId: '30000000-0000-4000-8000-000000000003',
    name: 'Published Place',
    category: 'park' as const,
    locality: 'Reykjavík',
    latitude: 64.1423,
    longitude: -21.9555,
    accessConditionCount: 1,
    simpleAccessSummary: true,
    accessArea: 'outdoors' as const,
    restraintCondition: 'leash_required' as const,
    permissionRequirement: 'standing_permission' as const,
    accessConditions: [
      {
        accessArea: 'outdoors' as const,
        restraintCondition: 'leash_required' as const,
        permissionRequirement: 'standing_permission' as const
      }
    ],
    verifiedAt: '2026-07-09T11:00:00.000Z'
  }
];

const complexProfile = {
  placeId: places[0].placeId,
  name: 'Published Place',
  description: 'Complex verified access.',
  category: 'park' as const,
  location: {
    addressLine: 'Hundagata 1',
    locality: 'Reykjavík',
    postalCode: '101',
    latitude: 64.1423,
    longitude: -21.9555
  },
  websiteUrl: null,
  phone: null,
  openingHours: {
    monday: ['09:00-17:00'],
    seasonal_note: 'Call ahead on holidays'
  },
  dogAmenities: ['water_bowl', 'covered patio hook'],
  accessConditions: [
    {
      id: 'condition-complex',
      accessArea: 'indoors' as const,
      accessAreaNote: null,
      restraintCondition: 'carrier_required' as const,
      restraintNote: null,
      dogEligibility: { scope: 'restricted' as const, maximumWeightKg: 10 },
      availabilityWindow: { endsAt: '17:00' },
      permissionRequirement: 'standing_permission' as const,
      evidenceSources: [
        {
          kind: 'official_website' as const,
          sourceUrl: 'https://example.invalid/rules',
          sourceCitation: null,
          sourceLabel: 'Official rules',
          observedAt: '2026-07-08T10:00:00Z'
        }
      ],
      verifiedAt: '2026-07-09T11:00:00Z',
      freshnessUntil: '2026-07-10T00:00:00Z'
    },
    {
      id: 'condition-outdoor',
      accessArea: 'outdoors' as const,
      accessAreaNote: null,
      restraintCondition: 'leash_required' as const,
      restraintNote: null,
      dogEligibility: { scope: 'all_dogs' as const },
      availabilityWindow: {},
      permissionRequirement: 'ask_on_arrival' as const,
      evidenceSources: [
        {
          kind: 'public_record' as const,
          sourceUrl: null,
          sourceCitation: 'Rule 4',
          sourceLabel: 'Municipal rule',
          observedAt: '2026-07-07T10:00:00Z'
        }
      ],
      verifiedAt: '2026-07-09T11:00:00Z',
      freshnessUntil: '2099-01-01T00:00:00Z'
    }
  ],
  dogFriendlinessSummary: {
    placeId: places[0].placeId,
    visible: false,
    eligibleCount: null,
    trailingTwelveMonthCount: null,
    dimensions: [],
    overallMean: null,
    overallVisible: false
  },
  photos: []
};

const replaceUrl = (url: string) => history.replaceState(history.state, '', url);
const pushUrl = replaceUrl;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('MapListShell synchronization', () => {
  it('preserves the exact signed-out result view without a legacy Favorite marker', async () => {
    const origin = `/en?place=${places[0].placeId}&lat=64.12&lng=-21.91&z=11&view=list&q=Published&category=outdoors&area=Reykjav%C3%ADk#saved-origin`;
    history.replaceState(null, '', origin);
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: { ...defaultDiscoveryState, view: 'list' },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    const invitation = await screen.findByRole('link', {
      name: 'Sign in to add Published Place to favorites'
    });
    const accountUrl = new URL(invitation.getAttribute('href') ?? '', window.location.origin);
    const returnTo = new URL(
      accountUrl.searchParams.get('returnTo') ?? '',
      'https://hundavaent.local'
    );

    expect(accountUrl.pathname).toBe('/en/account');
    expect(returnTo.pathname).toBe('/en');
    expect(returnTo.searchParams.get('place')).toBe(places[0].placeId);
    expect(returnTo.searchParams.has('favourite')).toBe(false);
    expect(returnTo.searchParams.get('view')).toBe('list');
    expect(returnTo.searchParams.get('q')).toBe('Published');
    expect(returnTo.searchParams.get('category')).toBe('outdoors');
    expect(returnTo.searchParams.get('area')).toBe('Reykjavík');
    expect(returnTo.searchParams.get('lat')).toBe('64.12');
    expect(returnTo.searchParams.get('lng')).toBe('-21.91');
    expect(returnTo.searchParams.get('z')).toBe('11');
    expect(returnTo.hash).toBe('#saved-origin');
  });

  it('renders the Favorite completed by the cross-device auth intent without reconfirmation', () => {
    history.replaceState(null, '', `/en?place=${places[0].placeId}&view=list#favorite-origin`);
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: { ...defaultDiscoveryState, view: 'list' },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile),
      signedIn: true,
      initialFavouritePlaceIds: [places[0].placeId]
    });

    expect(
      screen.getByRole('button', { name: 'Remove Published Place from favorites' })
    ).toBeTruthy();
    expect(screen.queryByText(/confirm/i)).toBeNull();
    expect(screen.queryByLabelText('Selected place')).toBeNull();
  });

  it('does not let an older external Favourite refresh overwrite a successful local add', async () => {
    history.replaceState(null, '', '/en?view=list');
    const staleRefresh = deferred<Response>();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return new Response(JSON.stringify({ placeId: places[0].placeId, isFavourite: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return staleRefresh.promise;
    });
    vi.stubGlobal('fetch', fetchMock);
    const external = new BroadcastChannel('hundavaent-favourites');

    try {
      render(MapListShell, {
        places,
        lang: 'en',
        copy: catalogues.en,
        initialState: { ...defaultDiscoveryState, view: 'list' },
        adapter: createDomTestMapAdapter(),
        replaceUrl,
        pushUrl,
        loadPlace: vi.fn(async () => complexProfile),
        signedIn: true
      });
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));

      external.postMessage({ type: 'invalidate', sourceId: 'external-tab' });
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith('/api/favourites', {
          headers: { accept: 'application/json' }
        })
      );

      await fireEvent.click(
        screen.getByRole('button', { name: 'Add Published Place to favorites' })
      );
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Remove Published Place from favorites' })
        ).toBeTruthy()
      );

      staleRefresh.resolve(
        new Response(JSON.stringify({ placeIds: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));

      expect(
        screen.getByRole('button', { name: 'Remove Published Place from favorites' })
      ).toBeTruthy();
    } finally {
      external.close();
      vi.unstubAllGlobals();
    }
  });

  it('exposes a signed-in Favorites-only filter and serializes it canonically', async () => {
    history.replaceState(null, '', '/en?view=list');
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: { ...defaultDiscoveryState, view: 'list' },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile),
      signedIn: true,
      initialFavouritePlaceIds: []
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Favorites only' }));

    expect(window.location.search).toContain('favorites=1');
    expect(screen.getByRole('button', { name: 'Show 0 results' })).toBeTruthy();
  });

  it('clears a selected Place and restores stable focus when it leaves Favorites-only results', async () => {
    history.replaceState(null, '', `/en?place=${places[0].placeId}&favorites=1`);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          return new Response(JSON.stringify({ placeId: places[0].placeId, isFavourite: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        return new Response(JSON.stringify(complexProfile), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      })
    );

    try {
      render(MapListShell, {
        places,
        lang: 'en',
        copy: catalogues.en,
        initialState: {
          ...defaultDiscoveryState,
          selectedPlaceId: places[0].placeId,
          filters: { ...defaultDiscoveryState.filters, favoritesOnly: true }
        },
        adapter: createDomTestMapAdapter(),
        replaceUrl,
        pushUrl,
        signedIn: true,
        initialFavouritePlaceIds: [places[0].placeId]
      });

      await fireEvent.click(
        screen.getByRole('button', { name: 'Remove Published Place from favorites' })
      );

      await waitFor(() => expect(screen.queryByLabelText('Selected place')).toBeNull());
      expect(window.location.search).not.toContain('place=');
      expect(screen.getByRole('button', { name: 'Show filters' })).toHaveFocus();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('opens Place details from a marker and closes them without leaving the map', async () => {
    history.replaceState(null, '', '/en');
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn()
        }) satisfies MediaQueryList
    );
    const adapter = createDomTestMapAdapter();
    const onStateChange = vi.fn();
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: defaultDiscoveryState,
      adapter,
      onStateChange,
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    const marker = await screen.findByRole('button', { name: 'Published Place' });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('One place found')
    );
    expect(screen.queryByLabelText('Selected place')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Select Published Place' })).toBeNull();

    await fireEvent.click(marker);

    await waitFor(() =>
      expect(screen.getByLabelText('Selected place').getAttribute('data-overlay')).toBe('place')
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Published Place' }).getAttribute('aria-pressed')
      ).toBe('true')
    );
    expect(window.location.search).toContain('place=30000000-0000-4000-8000-000000000003');
    expect(window.location.search).toContain('lat=64.1423');
    expect(window.location.search).toContain('view=map');
    expect(
      screen
        .getAllByRole('status')
        .some((status) => status.textContent?.includes('Published Place'))
    ).toBe(true);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(captureAnalytics).toHaveBeenCalledWith('place viewed', {
      place_id: places[0].placeId,
      category: 'park',
      source: 'map',
      language: 'en'
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Close selected place' }));
    await waitFor(() => expect(screen.queryByLabelText('Selected place')).toBeNull());
    expect(window.location.search).not.toContain('place=');
    expect(window.location.search).toContain('lat=64.1423');
    expect(window.location.search).toContain('view=map');
    expect(document.activeElement).toBe(marker);
  });

  it('renders concise localized access facts for a URL-selected Place', async () => {
    history.replaceState(null, '', '/en?place=30000000-0000-4000-8000-000000000003');
    const adapter = createDomTestMapAdapter();
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: {
        ...defaultDiscoveryState,
        selectedPlaceId: places[0].placeId
      },
      adapter,
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    const selectedPlace = screen.getByLabelText('Selected place');
    expect(within(selectedPlace).getByRole('heading', { name: 'Are dogs welcome?' })).toBeTruthy();
    expect(within(selectedPlace).getByText('Yes')).toBeTruthy();
    expect(within(selectedPlace).getByText('Outdoors')).toBeTruthy();
    expect(within(selectedPlace).getByText('Leash required')).toBeTruthy();
    expect(within(selectedPlace).queryByText('Dogs are generally allowed')).toBeNull();
    expect(within(selectedPlace).getByText('Last verified')).toBeTruthy();
    expect(within(selectedPlace).getByText('9 July 2026')).toBeTruthy();
    expect(within(selectedPlace).queryByText('Not yet rated')).toBeNull();
    expect(
      within(selectedPlace).getByRole('link', {
        name: 'Sign in to add Published Place to favorites'
      })
    ).toBeTruthy();
    expect(within(selectedPlace).queryByText('Sign in to check in')).toBeNull();
    expect(within(selectedPlace).queryByText('Sign in to rate this place')).toBeNull();
    await waitFor(() =>
      expect(captureAnalytics).toHaveBeenCalledWith('place viewed', {
        place_id: places[0].placeId,
        category: 'park',
        source: 'direct',
        language: 'en'
      })
    );
  });

  it('keeps Favorite and Share together in the selected Place header', () => {
    history.replaceState(null, '', '/en?place=30000000-0000-4000-8000-000000000003');
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: { ...defaultDiscoveryState, selectedPlaceId: places[0].placeId },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile),
      signedIn: true
    });

    const card = screen.getByLabelText('Selected place');
    const favorite = within(card).getByRole('button', {
      name: 'Add Published Place to favorites'
    });
    const share = within(card).getByRole('button', { name: 'Share Published Place' });
    const close = within(card).getByRole('button', { name: 'Close selected place' });
    expect(favorite.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(share.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('asks the friendly welcome question in Icelandic with concise trust metadata', () => {
    history.replaceState(null, '', '/is?place=30000000-0000-4000-8000-000000000003');
    render(MapListShell, {
      places,
      lang: 'is',
      copy: catalogues.is,
      initialState: {
        ...defaultDiscoveryState,
        selectedPlaceId: places[0].placeId
      },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    const selectedPlace = screen.getByLabelText('Valinn staður');
    expect(
      within(selectedPlace).getByRole('heading', { name: 'Eru hundar velkomnir?' })
    ).toBeTruthy();
    expect(within(selectedPlace).getByText('Já')).toBeTruthy();
    expect(within(selectedPlace).getByText('9. júlí 2026')).toBeTruthy();
  });

  it('withdraws the verified welcome signal when loaded access evidence is stale', async () => {
    history.replaceState(null, '', `/en?place=${places[0].placeId}`);
    const profileRequest = deferred<typeof complexProfile>();
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: { ...defaultDiscoveryState, selectedPlaceId: places[0].placeId },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(() => profileRequest.promise)
    });

    const selectedPlace = screen.getByLabelText('Selected place');
    const welcome = selectedPlace.querySelector<HTMLElement>('.welcome-answer');
    expect(welcome?.getAttribute('data-tone')).toBe('info');
    expect(welcome?.getAttribute('data-access-state')).toBe('conditional');

    profileRequest.resolve({
      ...complexProfile,
      accessConditions: [
        {
          ...complexProfile.accessConditions[0],
          freshnessUntil: '2000-01-01T00:00:00Z'
        }
      ]
    });

    await waitFor(() => expect(welcome?.getAttribute('data-tone')).toBe('attention'));
    expect(welcome?.getAttribute('data-access-state')).toBe('attention');
    expect(welcome?.getAttribute('data-tone')).not.toBe('verified');
    expect(welcome?.getAttribute('data-access-state')).not.toBe('verified');
    expect(within(selectedPlace).getAllByText('Reconfirmation due')).toHaveLength(2);
  });

  it('never promotes summary access to verified when complete details fail to load', async () => {
    history.replaceState(null, '', `/en?place=${places[0].placeId}`);
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: { ...defaultDiscoveryState, selectedPlaceId: places[0].placeId },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => {
        throw new Error('profile unavailable');
      })
    });

    const selectedPlace = screen.getByLabelText('Selected place');
    const welcome = selectedPlace.querySelector<HTMLElement>('.welcome-answer');
    await waitFor(() =>
      expect(
        within(selectedPlace).getByText('The complete access information could not be loaded.')
      ).toBeTruthy()
    );
    expect(welcome?.getAttribute('data-tone')).toBe('info');
    expect(welcome?.getAttribute('data-access-state')).toBe('conditional');
    expect(welcome?.getAttribute('data-tone')).not.toBe('verified');
    expect(selectedPlace.querySelector('.trust-summary [data-status="verified"]')).toBeNull();
  });

  it('reveals every restriction and provenance inside the rail card without navigating away', async () => {
    history.replaceState(null, '', `/en?place=${places[0].placeId}`);
    const multiConditionPlaces = [
      {
        ...places[0],
        accessConditionCount: 2,
        simpleAccessSummary: false,
        accessArea: null,
        restraintCondition: null,
        permissionRequirement: null,
        accessConditions: [
          {
            accessArea: 'indoors' as const,
            restraintCondition: 'carrier_required' as const,
            permissionRequirement: 'standing_permission' as const
          },
          {
            accessArea: 'outdoors' as const,
            restraintCondition: 'leash_required' as const,
            permissionRequirement: 'ask_on_arrival' as const
          }
        ]
      }
    ];
    render(MapListShell, {
      places: multiConditionPlaces,
      lang: 'en',
      copy: catalogues.en,
      initialState: { ...defaultDiscoveryState, selectedPlaceId: places[0].placeId },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    const selectedPlace = screen.getByLabelText('Selected place');
    expect(selectedPlace.classList.contains('hv-panel')).toBe(true);
    expect(selectedPlace.querySelector('[data-access-state="conditional"]')).not.toBeNull();
    expect(
      within(selectedPlace).getByText(
        '2 different access conditions apply. Review every restriction.'
      )
    ).toBeTruthy();
    await fireEvent.click(await within(selectedPlace).findByText('Details and sources'));
    expect(
      within(selectedPlace).getByText(
        'Dogs weighing up to and including 10 kg are allowed indoors before 17:00 when carried.'
      )
    ).toBeTruthy();
    expect(
      within(selectedPlace).getByText(/may be allowed after asking on arrival outdoors on a leash/)
    ).toBeTruthy();
    expect(within(selectedPlace).getByText('Official rules')).toBeTruthy();
    expect(within(selectedPlace).getByText('Municipal rule')).toBeTruthy();
    expect(within(selectedPlace).getByText('Official website')).toBeTruthy();
    expect(within(selectedPlace).getByText('Public record')).toBeTruthy();
    expect(within(selectedPlace).getByText('https://example.invalid/rules')).toBeTruthy();
    expect(within(selectedPlace).getByText('Rule 4')).toBeTruthy();
    expect(within(selectedPlace).getByText('8 July 2026')).toBeTruthy();
    expect(within(selectedPlace).getAllByText('Reconfirmation due')).toHaveLength(2);
    expect(within(selectedPlace).getByText(/Monday: 09:00-17:00/)).toBeTruthy();
    expect(within(selectedPlace).getByText(/seasonal_note: Call ahead on holidays/)).toBeTruthy();
    expect(within(selectedPlace).getByText('Water bowl, covered patio hook')).toBeTruthy();
    expect(selectedPlace.querySelector('details.hv-disclosure')).not.toBeNull();
    expect(selectedPlace.querySelector('[data-status="attention"]')).not.toBeNull();
    expect(selectedPlace.querySelector('[data-status="verified"]')).not.toBeNull();
    expect(window.location.pathname).toBe('/en');
  });

  it('localizes known structured labels in Icelandic and preserves sourced free text', async () => {
    history.replaceState(null, '', `/is?place=${places[0].placeId}`);
    render(MapListShell, {
      places: [
        {
          ...places[0],
          accessConditionCount: 2,
          simpleAccessSummary: false,
          accessArea: null,
          restraintCondition: null,
          permissionRequirement: null,
          accessConditions: [
            {
              accessArea: 'indoors' as const,
              restraintCondition: 'carrier_required' as const,
              permissionRequirement: 'standing_permission' as const
            },
            {
              accessArea: 'outdoors' as const,
              restraintCondition: 'leash_required' as const,
              permissionRequirement: 'ask_on_arrival' as const
            }
          ]
        }
      ],
      lang: 'is',
      copy: catalogues.is,
      initialState: { ...defaultDiscoveryState, selectedPlaceId: places[0].placeId },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    const selectedPlace = screen.getByLabelText('Valinn staður');
    await fireEvent.click(await within(selectedPlace).findByText('Nánar og heimildir'));
    expect(within(selectedPlace).getByText('Rule 4')).toBeTruthy();
    expect(within(selectedPlace).getByText('Opinber skrá')).toBeTruthy();
    expect(within(selectedPlace).getByText('Opinber vefsíða')).toBeTruthy();
    expect(within(selectedPlace).getByText('https://example.invalid/rules')).toBeTruthy();
    expect(within(selectedPlace).getByText('8. júlí 2026')).toBeTruthy();
    expect(within(selectedPlace).getByText(/Mánudagur: 09:00-17:00/)).toBeTruthy();
    expect(within(selectedPlace).getByText(/seasonal_note: Call ahead on holidays/)).toBeTruthy();
    expect(within(selectedPlace).getByText('Vatnsskál, covered patio hook')).toBeTruthy();
  });

  it('renders distinct provenance when Evidence sources share a kind and label', async () => {
    history.replaceState(null, '', `/en?place=${places[0].placeId}`);
    const duplicateLabelProfile = {
      ...complexProfile,
      accessConditions: [
        {
          ...complexProfile.accessConditions[0],
          evidenceSources: [
            complexProfile.accessConditions[0].evidenceSources[0],
            {
              ...complexProfile.accessConditions[0].evidenceSources[0],
              sourceUrl: 'https://example.invalid/rules/archive',
              sourceCitation: 'Archived rule 2',
              observedAt: '2026-07-06T10:00:00Z'
            }
          ]
        }
      ]
    };
    render(MapListShell, {
      places: [{ ...places[0], simpleAccessSummary: false }],
      lang: 'en',
      copy: catalogues.en,
      initialState: { ...defaultDiscoveryState, selectedPlaceId: places[0].placeId },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => duplicateLabelProfile)
    });

    const selectedPlace = screen.getByLabelText('Selected place');
    await fireEvent.click(await within(selectedPlace).findByText('Details and sources'));
    expect(within(selectedPlace).getAllByText('Official rules')).toHaveLength(2);
    expect(within(selectedPlace).getByText('https://example.invalid/rules')).toBeTruthy();
    expect(within(selectedPlace).getByText('https://example.invalid/rules/archive')).toBeTruthy();
    expect(within(selectedPlace).getByText('Archived rule 2')).toBeTruthy();
  });

  it.each([
    ['en', 'Selected place', 'Details and sources'],
    ['is', 'Valinn staður', 'Nánar og heimildir']
  ] as const)('renders every populated restriction in %s', async (lang, cardLabel, expandLabel) => {
    history.replaceState(null, '', `/${lang}?place=${places[0].placeId}`);
    const fullyRestricted = {
      ...complexProfile.accessConditions[0],
      accessAreaNote: 'rear room only',
      restraintNote: 'short lead',
      dogEligibility: {
        scope: 'restricted' as const,
        maximumWeightKg: 10.5,
        maximumDogs: 2,
        notes: 'calm dogs only'
      },
      availabilityWindow: {
        startsAt: '22:00',
        endsAt: '02:00',
        startsOn: '2026-06-01',
        endsOn: '2026-08-31'
      }
    };
    render(MapListShell, {
      places: [{ ...places[0], simpleAccessSummary: false }],
      lang,
      copy: catalogues[lang],
      initialState: { ...defaultDiscoveryState, selectedPlaceId: places[0].placeId },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => ({ ...complexProfile, accessConditions: [fullyRestricted] }))
    });

    const selectedPlace = screen.getByLabelText(cardLabel);
    await fireEvent.click(await within(selectedPlace).findByText(expandLabel));
    const explanation = within(selectedPlace).getByText(/rear room only/).textContent ?? '';
    expect(explanation).toContain(lang === 'en' ? '10.5 kg' : '10,5 kg');
    expect(explanation).toContain('2');
    expect(explanation).toContain('calm dogs only');
    expect(explanation).toContain('short lead');
    expect(explanation).toContain(lang === 'en' ? '1 June 2026' : '1. júní 2026');
  });

  it('keeps the heading and close control fixed while the mobile card body scrolls', () => {
    history.replaceState(null, '', `/en?place=${places[0].placeId}`);
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: { ...defaultDiscoveryState, selectedPlaceId: places[0].placeId },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    const selectedPlace = screen.getByLabelText('Selected place');
    const body = selectedPlace.querySelector<HTMLElement>('[data-card-scroll-body]');
    const heading = selectedPlace.querySelector<HTMLElement>('.card-heading');
    const close = within(selectedPlace).getByRole('button', { name: 'Close selected place' });
    expect(body).not.toBeNull();
    expect(heading).not.toBeNull();
    expect(getComputedStyle(body!).overflowY).toBe('auto');
    expect(getComputedStyle(heading!).position).toBe('sticky');
    expect(heading!.contains(close)).toBe(true);
  });

  it('deduplicates profile requests and prevents an older Place response from replacing current state', async () => {
    const secondPlace = {
      ...places[0],
      placeId: '30000000-0000-4000-8000-000000000004',
      name: 'Second Place',
      latitude: 64.15
    };
    const firstRequest = deferred<typeof complexProfile>();
    const secondRequest = deferred<typeof complexProfile>();
    const loadPlace = vi.fn((placeId: string) =>
      placeId === places[0].placeId ? firstRequest.promise : secondRequest.promise
    );
    history.replaceState(null, '', `/en?place=${places[0].placeId}`);
    render(MapListShell, {
      places: [...places, secondPlace],
      lang: 'en',
      copy: catalogues.en,
      initialState: { ...defaultDiscoveryState, selectedPlaceId: places[0].placeId },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace
    });

    await waitFor(() => expect(loadPlace).toHaveBeenCalledTimes(1));
    await fireEvent.click(screen.getByRole('button', { name: 'Published Place' }));
    expect(loadPlace).toHaveBeenCalledTimes(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Second Place' }));
    await waitFor(() => expect(loadPlace).toHaveBeenCalledTimes(2));
    secondRequest.resolve({
      ...complexProfile,
      placeId: secondPlace.placeId,
      name: 'Second Place'
    });
    await screen.findByText('Details and sources');
    firstRequest.reject(new Error('late failure'));
    await Promise.resolve();

    const selectedPlace = screen.getByLabelText('Selected place');
    expect(within(selectedPlace).getByText('Second Place')).toBeTruthy();
    expect(
      within(selectedPlace).queryByText('The complete access information could not be loaded.')
    ).toBeNull();
  });

  it('never presents an incomplete concise summary for one complex condition', () => {
    history.replaceState(null, '', `/en?place=${places[0].placeId}`);
    render(MapListShell, {
      places: [{ ...places[0], simpleAccessSummary: false }],
      lang: 'en',
      copy: catalogues.en,
      initialState: { ...defaultDiscoveryState, selectedPlaceId: places[0].placeId },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => ({
        ...complexProfile,
        accessConditions: [complexProfile.accessConditions[0]]
      }))
    });

    const selectedPlace = screen.getByLabelText('Selected place');
    expect(
      within(selectedPlace).getByText('Specific restrictions apply. Review the complete condition.')
    ).toBeTruthy();
    expect(within(selectedPlace).queryByText('Dogs are generally allowed')).toBeNull();
  });

  it('keeps the selected summary and offers retry when complete access cannot load', async () => {
    history.replaceState(null, '', `/en?place=${places[0].placeId}`);
    const loadPlace = vi.fn(async () => {
      throw new Error('offline');
    });
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: { ...defaultDiscoveryState, selectedPlaceId: places[0].placeId },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace
    });
    const unavailable = await screen.findByRole('alert');
    expect(unavailable.textContent).toContain(
      'The complete access information could not be loaded.'
    );
    expect(unavailable.classList.contains('hv-notice')).toBe(true);
    expect(unavailable.getAttribute('data-tone')).toBe('error');
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(loadPlace).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Outdoors')).toBeTruthy();
  });

  it('reveals the complete Place list only when the map is unavailable', async () => {
    history.replaceState(null, '', '/en');
    const failedAdapter: MapAdapter = {
      mount: () => {
        throw new Error('provider failed');
      },
      setPlaces: vi.fn(),
      setSelectedPlace: vi.fn(),
      focusPlace: vi.fn(),
      setCamera: vi.fn(),
      destroy: vi.fn()
    };
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: defaultDiscoveryState,
      adapter: failedAdapter,
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    expect(
      await screen.findByRole('heading', { name: 'The map is unavailable right now' })
    ).toBeTruthy();
    const fallbackList = screen.getByRole('region', { name: 'List' });
    expect(
      within(fallbackList).getByRole('button', { name: 'Select Published Place' })
    ).toBeTruthy();
    expect(
      within(fallbackList).getByRole('link', {
        name: 'Sign in to add Published Place to favorites'
      })
    ).toBeTruthy();

    const fallbackResult = within(fallbackList).getByRole('button', {
      name: 'Select Published Place'
    });
    fallbackResult.focus();
    await fireEvent.click(fallbackResult);
    const closeSelected = screen.getByRole('button', { name: 'Close selected place' });
    await waitFor(() => expect(document.activeElement).toBe(closeSelected));
    await fireEvent.click(closeSelected);
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-place-id')).toBe(places[0].placeId)
    );
  });

  it('keeps filters and results mutually exclusive with deterministic focus restoration', async () => {
    history.replaceState(null, '', '/en');
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: defaultDiscoveryState,
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    const category = screen.getByRole('combobox', { name: 'Place type' });
    await waitFor(() => expect(document.activeElement).toBe(category));
    expect(
      within(screen.getByRole('combobox', { name: 'Dog access area' })).getByRole('option', {
        name: 'Other stated bounded area'
      })
    ).toBeTruthy();
    expect(screen.getByText('More filters')).toBeTruthy();
    await fireEvent.change(category, { target: { value: 'outdoors' } });
    expect(captureAnalytics).toHaveBeenCalledWith('discovery filtered', {
      filter_count: 1,
      result_count: 1,
      has_query: false,
      uses_distance: false
    });
    expect(screen.queryByRole('combobox', { name: 'Leash and restraint' })).toBeNull();
    await fireEvent.click(screen.getByText('More filters'));
    expect(
      within(screen.getByRole('combobox', { name: 'Leash and restraint' })).getByRole('option', {
        name: 'Other stated control rule'
      })
    ).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Show 1 result' }));
    expect(screen.queryByRole('combobox', { name: 'Place type' })).toBeNull();
    const closeResults = screen.getByRole('button', { name: 'Close results' });
    await waitFor(() => expect(document.activeElement).toBe(closeResults));

    await fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    expect(screen.queryByRole('heading', { name: 'Places found' })).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Place type' }))
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Hide filters' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Show filters' }))
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Show 1 result' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Close results' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Show 1 result' }))
    );
  });

  it('offers a missing-place suggestion only when no place matches', async () => {
    history.replaceState(null, '', '/en');
    const { rerender } = render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: defaultDiscoveryState,
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    expect(screen.queryByRole('link', { name: 'Suggest a place' })).toBeNull();

    await rerender({
      places: [],
      lang: 'en',
      copy: catalogues.en,
      initialState: defaultDiscoveryState,
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    } as never);

    expect(screen.getByRole('link', { name: 'Suggest a place' })).toBeTruthy();
  });

  it('keeps filters, results, and the selected Place mutually exclusive', async () => {
    history.replaceState(null, '', '/en');
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: defaultDiscoveryState,
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Published Place' }));
    expect(screen.queryByRole('combobox', { name: 'Place type' })).toBeNull();
    expect(screen.getByLabelText('Selected place')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    expect(screen.queryByLabelText('Selected place')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Place type' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Published Place' }));
    expect(screen.queryByRole('combobox', { name: 'Place type' })).toBeNull();
    expect(screen.getByLabelText('Selected place')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Show 1 result' }));
    expect(screen.queryByLabelText('Selected place')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Places found' })).toBeTruthy();
  });

  it('restores result and selected-card focus across browser history', async () => {
    history.replaceState(null, '', '/en');
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: defaultDiscoveryState,
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl: (url) => history.pushState(null, '', url),
      loadPlace: vi.fn(async () => complexProfile)
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Show 1 result' }));
    const resultsUrl = window.location.href;
    await fireEvent.click(screen.getByRole('button', { name: 'Select Published Place' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Close selected place' })
      )
    );

    history.replaceState(null, '', resultsUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Select Published Place' })
      )
    );

    history.pushState(
      null,
      '',
      '/en?place=30000000-0000-4000-8000-000000000003&lat=64.1423&lng=-21.9555&z=13&view=map'
    );
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Close selected place' })
      )
    );
    expect(
      screen
        .getAllByRole('status')
        .some((status) => status.textContent?.includes('Selected place: Published Place'))
    ).toBe(true);
  });

  it('keeps search, result, and selected states in a persistent sidebar before the map', async () => {
    history.replaceState(null, '', '/en');
    const secondPlace = {
      ...places[0],
      placeId: '30000000-0000-4000-8000-000000000004',
      name: 'Second Café',
      category: 'cafe' as const,
      locality: 'Kópavogur',
      accessArea: 'indoors' as const,
      permissionRequirement: 'ask_on_arrival' as const
    };
    const { container } = render(MapListShell, {
      places: [...places, secondPlace],
      lang: 'en',
      copy: catalogues.en,
      initialState: defaultDiscoveryState,
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    const sidebar = container.querySelector<HTMLElement>('[data-directory-sidebar]');
    const mapPanel = container.querySelector<HTMLElement>('.map-panel');
    expect(sidebar).toBeTruthy();
    expect(mapPanel).toBeTruthy();
    if (!sidebar || !mapPanel) throw new Error('Expected the discovery sidebar and map panel');
    expect(
      Boolean(sidebar.compareDocumentPosition(mapPanel) & Node.DOCUMENT_POSITION_FOLLOWING)
    ).toBe(true);
    expect(sidebar.querySelector('.discovery-controls')).toBeTruthy();
    expect(mapPanel.querySelector('.discovery-controls')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Places found' })).toBeNull();
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search for a place' }), {
      target: { value: 'cafe kopavogur' }
    });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Published Place' })).toBeNull()
    );
    expect(screen.getByRole('button', { name: 'Second Café' })).toBeTruthy();
    expect(window.location.search).toContain('q=cafe+kopavogur');

    await fireEvent.click(screen.getByRole('button', { name: 'Show 1 result' }));
    const resultsHeading = screen.getByRole('heading', { name: 'Places found' });
    expect(resultsHeading).toBeTruthy();
    expect(sidebar.contains(resultsHeading)).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Select Second Café' }));
    const selectedPlace = screen.getByLabelText('Selected place');
    expect(selectedPlace).toBeTruthy();
    expect(sidebar.contains(selectedPlace)).toBe(true);
    expect(selectedPlace.querySelector('.trust-summary')?.textContent).toContain('Last verified');
    expect(screen.queryByRole('heading', { name: 'Places found' })).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Close selected place' })
      )
    );
  });

  it('uses the approved desktop rail-map grid geometry', async () => {
    const initialViewport = { width: window.innerWidth, height: window.innerHeight };
    await browserPage.viewport(1200, 800);

    try {
      const { container } = render(MapListShell, {
        places,
        lang: 'en',
        copy: catalogues.en,
        initialState: defaultDiscoveryState,
        adapter: createDomTestMapAdapter(),
        replaceUrl,
        pushUrl,
        loadPlace: vi.fn(async () => complexProfile)
      });
      const shell = container.querySelector<HTMLElement>('[data-responsive-shell]');
      expect(shell).toBeTruthy();
      if (!shell) throw new Error('Expected the discovery shell');

      const shellStyle = getComputedStyle(shell);
      const desktopColumns = shellStyle.gridTemplateColumns.split(' ').map(Number.parseFloat);
      expect(shellStyle.display).toBe('grid');
      expect(desktopColumns).toHaveLength(2);
      expect(desktopColumns[0] / desktopColumns[1]).toBeCloseTo(0.72 / 1.28, 1);
    } finally {
      await browserPage.viewport(initialViewport.width, initialViewport.height);
    }
  });

  it('opens only terminal cluster members in the selectable result tray', async () => {
    history.replaceState(null, '', '/en');
    const clusteredPlace = {
      ...places[0],
      placeId: '30000000-0000-4000-8000-000000000004',
      name: 'Clustered Café',
      category: 'cafe' as const
    };
    const outsidePlace = {
      ...places[0],
      placeId: '30000000-0000-4000-8000-000000000005',
      name: 'Outside Shop',
      category: 'shop' as const,
      latitude: 64.12,
      longitude: -21.8
    };
    let mountedCallbacks: MapCallbacks | null = null;
    const adapter: MapAdapter = {
      mount: vi.fn((_container, callbacks) => {
        mountedCallbacks = callbacks;
      }),
      setPlaces: vi.fn(),
      setSelectedPlace: vi.fn(),
      focusPlace: vi.fn(),
      setCamera: vi.fn(),
      destroy: vi.fn()
    };

    render(MapListShell, {
      places: [...places, clusteredPlace, outsidePlace],
      lang: 'en',
      copy: catalogues.en,
      initialState: defaultDiscoveryState,
      adapter,
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    await waitFor(() => expect(adapter.setPlaces).toHaveBeenCalled());
    const callbacks = mountedCallbacks as unknown as MapCallbacks;
    callbacks.onClusterSelect?.([places[0].placeId, clusteredPlace.placeId]);

    const results = await screen.findByRole('region', { name: 'Places found' });
    expect(within(results).getByRole('button', { name: 'Select Published Place' })).toBeTruthy();
    expect(within(results).getByRole('button', { name: 'Select Clustered Café' })).toBeTruthy();
    expect(within(results).queryByRole('button', { name: 'Select Outside Shop' })).toBeNull();

    const clusterUrl = window.location.href;
    const clusterState = structuredClone(history.state);
    history.replaceState(null, '', '/en?view=map');
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Places found' })).toBeNull());

    history.replaceState(clusterState, '', clusterUrl);
    window.dispatchEvent(new PopStateEvent('popstate', { state: clusterState }));
    const restoredResults = await screen.findByRole('region', { name: 'Places found' });
    expect(
      within(restoredResults).getByRole('button', { name: 'Select Published Place' })
    ).toBeTruthy();
    expect(
      within(restoredResults).getByRole('button', { name: 'Select Clustered Café' })
    ).toBeTruthy();
    expect(
      within(restoredResults).queryByRole('button', { name: 'Select Outside Shop' })
    ).toBeNull();
  });

  it('clears a shared distance constraint in a cold session instead of pretending it is active', async () => {
    sessionStorage.clear();
    history.replaceState(null, '', '/en?distance=5&view=map');
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: {
        ...defaultDiscoveryState,
        filters: { ...defaultDiscoveryState.filters, distanceKm: 5 }
      },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    await waitFor(() => expect(window.location.search).not.toContain('distance='));
  });

  it('remembers denied geolocation and retries only after an explicit action', async () => {
    sessionStorage.clear();
    history.replaceState(null, '', '/en');
    const getCurrentPosition = vi.fn((_success: PositionCallback, failure: PositionErrorCallback) =>
      failure({
        code: 1,
        message: 'denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      })
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });
    render(MapListShell, {
      places,
      lang: 'en',
      copy: catalogues.en,
      initialState: defaultDiscoveryState,
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    await waitFor(() =>
      expect(screen.getByText('Location is blocked in this browser.')).toBeTruthy()
    );
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(captureAnalytics).toHaveBeenCalledWith('location permission resolved', {
      context: 'discovery',
      outcome: 'denied'
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Try location again' }));
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('applies distance only after opt-in location and can broaden the radius', async () => {
    sessionStorage.clear();
    history.replaceState(null, '', '/en?lat=64.2&lng=-21.8&z=11&view=map');
    const farPlace = {
      ...places[0],
      placeId: '30000000-0000-4000-8000-000000000005',
      name: 'Hafnarfjörður Park',
      locality: 'Hafnarfjörður',
      latitude: 64.0671,
      longitude: -21.9547
    };
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: {
          latitude: 64.1466,
          longitude: -21.9426,
          accuracy: 100,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({})
        },
        timestamp: Date.now(),
        toJSON: () => ({})
      })
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition }
    });
    render(MapListShell, {
      places: [...places, farPlace],
      lang: 'en',
      copy: catalogues.en,
      initialState: {
        ...defaultDiscoveryState,
        camera: { latitude: 64.2, longitude: -21.8, zoom: 11 }
      },
      adapter: createDomTestMapAdapter(),
      replaceUrl,
      pushUrl,
      loadPlace: vi.fn(async () => complexProfile)
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    await waitFor(() => expect(screen.getByText('Nearby search is ready.')).toBeTruthy());
    expect(window.location.search).toContain('distance=5');
    expect(window.location.search).toContain('lat=64.2');
    expect(window.location.search).toContain('lng=-21.8');
    expect(window.location.search).not.toContain('lat=64.1466');
    expect(window.location.search).not.toContain('lng=-21.9426');
    expect(captureAnalytics).toHaveBeenCalledWith('location permission resolved', {
      context: 'discovery',
      outcome: 'granted'
    });
    expect(screen.getByRole('button', { name: 'Published Place' })).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Hafnarfjörður Park' })).toBeNull()
    );

    await fireEvent.click(screen.getByRole('button', { name: 'More filters' }));
    await fireEvent.change(screen.getByRole('combobox', { name: 'Distance' }), {
      target: { value: '25' }
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Hafnarfjörður Park' })).toBeTruthy()
    );
  });

  it('never carries a completed Check-in over to a different selected Place', async () => {
    history.replaceState(null, '', '/en');
    const secondPlace = {
      ...places[0],
      placeId: '30000000-0000-4000-8000-000000000099',
      name: 'Second Place',
      latitude: 64.15,
      longitude: -21.94
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/check-ins/') && init?.method === 'POST') {
        const placeId = decodeURIComponent(url.split('/api/check-ins/')[1]);
        return new Response(
          JSON.stringify({
            checkInId: 'c1',
            placeId,
            proximityConfirmed: 'unknown',
            checkedInAt: '2026-07-12T14:32:00Z',
            alreadyCheckedIn: false
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/api/check-ins/')) {
        return new Response(
          JSON.stringify({ hasRecentCheckIn: false, checkedInAt: null, proximityConfirmed: null }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      render(MapListShell, {
        places: [...places, secondPlace],
        lang: 'en',
        copy: catalogues.en,
        initialState: defaultDiscoveryState,
        adapter: createDomTestMapAdapter(),
        replaceUrl,
        pushUrl,
        loadPlace: vi.fn(async () => complexProfile),
        signedIn: true
      });

      await fireEvent.click(await screen.findByRole('button', { name: 'Published Place' }));
      await fireEvent.click(
        await screen.findByRole('button', { name: 'Check in at Published Place' })
      );
      await waitFor(() =>
        expect(screen.getByText("You're checked in at Published Place.")).toBeTruthy()
      );

      // Selecting a different Place must recreate the card: no success message, no timestamp,
      // and a live Check-in action for the new Place.
      await fireEvent.click(screen.getByRole('button', { name: 'Second Place' }));
      const checkInAtSecond = await screen.findByRole('button', {
        name: 'Check in at Second Place'
      });
      expect(checkInAtSecond).toBeTruthy();
      expect(screen.queryByText(/You're checked in/)).toBeNull();
      expect(screen.queryByText(/Recorded at/)).toBeNull();

      // And returning to the first Place must show its own server-loaded state, not a stale
      // client-side terminal phase (the status endpoint here reports no recent Check-in).
      await fireEvent.click(screen.getByRole('button', { name: 'Published Place' }));
      expect(
        await screen.findByRole('button', { name: 'Check in at Published Place' })
      ).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
