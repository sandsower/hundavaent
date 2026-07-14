import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import HistoryPage from '../../src/routes/[lang=lang]/history/+page.svelte';

const favouritePlace = {
  placeId: '87000000-0000-4000-8000-000000000001',
  name: 'History Predecessor',
  category: 'cafe' as const,
  locality: 'Reykjavík',
  latitude: 64.147,
  longitude: -21.933,
  isFavourite: true,
  favouritedAt: '2026-07-01T10:00:00Z',
  visitCount: null,
  firstVisitedAt: null,
  lastVisitedAt: null,
  lastActivityAt: '2026-07-01T10:00:00Z',
  availability: 'available' as const,
  successorPlaceId: null,
  successorName: null,
  successorAvailable: false
};

const checkIn = {
  checkInId: '90000000-0000-4000-8000-000000000009',
  placeId: '87000000-0000-4000-8000-000000000003',
  name: 'Repeat-visit Park',
  category: 'park' as const,
  locality: 'Reykjavík',
  latitude: 64.132,
  longitude: -21.902,
  checkedInAt: '2026-07-11T09:00:00Z',
  availability: 'available' as const,
  successorPlaceId: null,
  successorName: null,
  successorAvailable: false
};

function baseData<T extends Record<string, unknown>>(overrides: T) {
  return {
    lang: 'en' as const,
    copy: catalogues.en,
    mapStyleUrl: null,
    forceMapFailure: false,
    ...overrides
  };
}

describe('Personal history page', () => {
  it('keeps the visits timeline primary and the personal map secondary', () => {
    render(HistoryPage, {
      params: { lang: 'en' },
      data: baseData({
        view: 'checkins' as const,
        checkIns: [],
        isFirstPage: true,
        nextCheckInCursor: null
      }),
      form: null
    });

    const nav = screen.getByRole('navigation', { name: 'Visits' });
    expect(within(nav).getByRole('link', { name: 'Visits' }).getAttribute('aria-current')).toBe(
      'page'
    );
    expect(within(nav).getByRole('link', { name: 'Map' })).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: 'Favourites' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: 'Visited' })).toBeNull();
  });

  it('renders the empty state for the Check-ins tab', () => {
    render(HistoryPage, {
      params: { lang: 'en' },
      data: baseData({
        view: 'checkins' as const,
        checkIns: [],
        isFirstPage: true,
        nextCheckInCursor: null
      }),
      form: null
    });

    expect(screen.getByRole('heading', { name: 'No visits yet' })).toBeTruthy();
  });

  it('renders a chronological Check-in with a working "next page" link', () => {
    render(HistoryPage, {
      params: { lang: 'en' },
      data: baseData({
        view: 'checkins' as const,
        checkIns: [checkIn],
        isFirstPage: true,
        nextCheckInCursor: { beforeCheckedInAt: '2026-07-10T09:00:00Z', beforeCheckInId: 'abc' }
      }),
      form: null
    });

    expect(screen.getByRole('heading', { name: 'Repeat-visit Park' })).toBeTruthy();
    expect(screen.getByText('Checked in 11 Jul 2026, 09:00')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Show more' })).toBeTruthy();
  });

  it('renders the empty-map state distinctly from the empty list states', () => {
    render(HistoryPage, {
      params: { lang: 'en' },
      data: baseData({
        view: 'map' as const,
        mapPlaces: [],
        mapTruncated: false,
        mapLimit: 200
      }),
      form: null
    });

    expect(screen.getByRole('heading', { name: 'Nothing to show on the map yet' })).toBeTruthy();
  });

  it('renders the map view with a synchronized, keyboard-operable Place list using Place Location', () => {
    render(HistoryPage, {
      params: { lang: 'en' },
      data: baseData({
        view: 'map' as const,
        mapPlaces: [favouritePlace],
        mapTruncated: false,
        mapLimit: 200
      }),
      form: null
    });

    const list = screen.getByRole('list', { name: 'Map' });
    const button = within(list).getByRole('button', { name: 'History Predecessor' });
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('Showing the first 200 places by most recent activity.')).toBeNull();
  });

  it('retains quarantined history text without rendering a marker or focus control', () => {
    const withheldPlace = {
      ...favouritePlace,
      latitude: null,
      longitude: null,
      availability: 'unavailable' as const
    };

    render(HistoryPage, {
      params: { lang: 'en' },
      data: baseData({
        view: 'map' as const,
        mapPlaces: [withheldPlace],
        mapTruncated: false,
        mapLimit: 200
      }),
      form: null
    });

    expect(screen.getByRole('heading', { name: 'Nothing to show on the map yet' })).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Map' });
    expect(within(list).getByText(withheldPlace.name)).toBeTruthy();
    expect(within(list).queryByRole('button', { name: withheldPlace.name })).toBeNull();
  });

  it('announces the capped map window when the history exceeds the map limit', () => {
    render(HistoryPage, {
      params: { lang: 'en' },
      data: baseData({
        view: 'map' as const,
        mapPlaces: [favouritePlace],
        mapTruncated: true,
        mapLimit: 200
      }),
      form: null
    });

    expect(screen.getByText('Showing the first 200 places by most recent activity.')).toBeTruthy();
  });

  it('renders the Icelandic catalogue for the same view', () => {
    render(HistoryPage, {
      params: { lang: 'is' },
      data: baseData({
        lang: 'is',
        copy: catalogues.is,
        view: 'checkins' as const,
        checkIns: [],
        isFirstPage: true,
        nextCheckInCursor: null
      }),
      form: null
    });

    expect(screen.getByRole('heading', { name: 'Heimsóknir' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Engar heimsóknir enn' })).toBeTruthy();
  });
});
