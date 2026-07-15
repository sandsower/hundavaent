import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { catalogues } from '$i18n';
import RatingSummary from '$lib/discovery/RatingSummary.svelte';
import type {
  DogFriendlinessSummary,
  ModerationRating
} from '$server/dog-friendliness/dog-friendliness';

import ModerationRatingsPage from '../../src/routes/[lang=lang]/moderation/dog-friendliness/[placeId]/+page.svelte';

const placeId = '30000000-0000-4000-8000-000000000003';

const hiddenSummary: DogFriendlinessSummary = {
  placeId,
  visible: false,
  eligibleCount: null,
  trailingTwelveMonthCount: null,
  dimensions: [],
  overallMean: null,
  overallVisible: false
};

const visibleSummary: DogFriendlinessSummary = {
  placeId,
  visible: true,
  eligibleCount: 5,
  trailingTwelveMonthCount: 5,
  dimensions: [
    { dimension: 'welcome', applicableCount: 5, mean: 4 },
    { dimension: 'comfort', applicableCount: 5, mean: 3.5 }
  ],
  overallMean: 3.5,
  overallVisible: true
};

const partialSummary: DogFriendlinessSummary = {
  placeId,
  visible: true,
  eligibleCount: 5,
  trailingTwelveMonthCount: 5,
  dimensions: [{ dimension: 'welcome', applicableCount: 5, mean: 4 }],
  overallMean: null,
  overallVisible: false
};

describe('RatingSummary', () => {
  it('leaks no counts or values below threshold', () => {
    render(RatingSummary, {
      summary: hiddenSummary,
      copy: catalogues.en,
      signedIn: false,
      rateHref: '/en/places/place-1/rate'
    });

    expect(screen.getByText('Not yet rated')).toBeTruthy();
    expect(screen.queryByText(/Based on/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign in to rate this place' })).toBeNull();
  });

  it('shows the eligible count, recency context, qualifying Dimensions, and overall result', () => {
    render(RatingSummary, {
      summary: visibleSummary,
      copy: catalogues.en,
      signedIn: true,
      rateHref: '/en/places/place-1/rate'
    });

    expect(screen.getByText('Based on 5 eligible Ratings')).toBeTruthy();
    expect(screen.getByText('Based on Ratings from the last 12 months (5)')).toBeTruthy();
    expect(screen.getByText('Welcome')).toBeTruthy();
    expect(screen.getByText('Comfort')).toBeTruthy();
    expect(screen.queryByText('Clarity')).toBeNull();
    expect(screen.getByText('Overall result').closest('p')?.textContent).toContain('3.5');
    expect(screen.getByRole('link', { name: 'Rate this place' })).toBeTruthy();
  });

  it('shows qualifying Dimensions without an overall when fewer than two qualify', () => {
    render(RatingSummary, {
      summary: partialSummary,
      copy: catalogues.en,
      signedIn: true,
      rateHref: '/en/places/place-1/rate'
    });

    expect(screen.getByText('Welcome')).toBeTruthy();
    expect(
      screen.getByText('Not enough Dimensions qualify yet to show an overall result.')
    ).toBeTruthy();
  });
});

const eligibleRating: ModerationRating = {
  id: 'rating-1',
  memberId: '78000000-0000-4000-8000-000000000001',
  scores: { welcome: 4, clarity: null, comfort: 5, thoughtfulness: 3 },
  ratedAt: '2026-07-12T09:00:00Z',
  excludedAt: null,
  excludedKind: null,
  excludedReason: null,
  privateNote: null,
  privateNoteClassification: null,
  privateNoteUpdatedAt: null,
  linkedReportId: null
};

const excludedRating: ModerationRating = {
  id: 'rating-2',
  memberId: '78000000-0000-4000-8000-000000000002',
  scores: { welcome: 1, clarity: 1, comfort: 1, thoughtfulness: 1 },
  ratedAt: '2026-07-12T08:00:00Z',
  excludedAt: '2026-07-12T09:30:00Z',
  excludedKind: 'fraud',
  excludedReason: 'Duplicate account signal',
  privateNote: null,
  privateNoteClassification: null,
  privateNoteUpdatedAt: null,
  linkedReportId: null
};

describe('Moderator Dog-Friendliness Rating exclusion workspace', () => {
  it('offers an exclusion form for an eligible Rating', () => {
    render(ModerationRatingsPage, {
      params: { lang: 'en', placeId },
      data: {
        placeId,
        placeName: 'Published Place',
        copy: catalogues.en,
        ratings: [eligibleRating],
        noteDetails: {}
      },
      form: null
    } as never);

    expect(screen.getByText('Eligible')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exclude' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reinstate' })).toBeNull();
  });

  it('shows the exclusion reason and a reinstatement form for an excluded Rating', () => {
    render(ModerationRatingsPage, {
      params: { lang: 'en', placeId },
      data: {
        placeId,
        placeName: 'Published Place',
        copy: catalogues.en,
        ratings: [excludedRating],
        noteDetails: {}
      },
      form: null
    } as never);

    expect(screen.getByText('Excluded')).toBeTruthy();
    expect(screen.getByText(/Duplicate account signal/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reinstate' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Exclude' })).toBeNull();
  });

  it('shows the empty state when no Ratings exist for the Place', () => {
    render(ModerationRatingsPage, {
      params: { lang: 'en', placeId },
      data: {
        placeId,
        placeName: 'Published Place',
        copy: catalogues.en,
        ratings: [],
        noteDetails: {}
      },
      form: null
    } as never);

    expect(screen.getByText('No Ratings exist for this Place.')).toBeTruthy();
  });
});

const notedRating: ModerationRating = {
  id: 'rating-3',
  memberId: '78000000-0000-4000-8000-000000000003',
  scores: { welcome: 1, clarity: null, comfort: 2, thoughtfulness: null },
  ratedAt: '2026-07-12T09:00:00Z',
  excludedAt: null,
  excludedKind: null,
  excludedReason: null,
  privateNote: 'A loose dog on site nearly reached the street.',
  privateNoteClassification: 'safety_concern',
  privateNoteUpdatedAt: '2026-07-12T09:00:00Z',
  linkedReportId: null
};

const notedRatingWithReport: ModerationRating = {
  ...notedRating,
  id: 'rating-4',
  memberId: '78000000-0000-4000-8000-000000000004',
  linkedReportId: 'flag-1'
};

describe('Moderator Private Rating Note workspace', () => {
  it('shows the note, classification, and a disposition form when a note is present', () => {
    render(ModerationRatingsPage, {
      params: { lang: 'en', placeId },
      data: {
        placeId,
        placeName: 'Published Place',
        lang: 'en',
        copy: catalogues.en,
        ratings: [notedRating],
        noteDetails: {
          [notedRating.memberId]: { history: [], dispositions: [] }
        }
      },
      form: null
    } as never);

    expect(screen.getByText('Private Rating Note')).toBeTruthy();
    expect(screen.getByText('A loose dog on site nearly reached the street.')).toBeTruthy();
    expect(screen.getByText('A possible Safety Concern')).toBeTruthy();
    expect(screen.queryByText('View Report')).toBeNull();
    expect(screen.getByRole('button', { name: 'Record decision' })).toBeTruthy();
  });

  it('links to the Report when the note produced one', () => {
    render(ModerationRatingsPage, {
      params: { lang: 'en', placeId },
      data: {
        placeId,
        placeName: 'Published Place',
        lang: 'en',
        copy: catalogues.en,
        ratings: [notedRatingWithReport],
        noteDetails: {
          [notedRatingWithReport.memberId]: { history: [], dispositions: [] }
        }
      },
      form: null
    } as never);

    const link = screen.getByRole('link', { name: 'View Report' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('flag-1');
  });

  it('never renders a Private Rating Note block for a Rating with no note', () => {
    render(ModerationRatingsPage, {
      params: { lang: 'en', placeId },
      data: {
        placeId,
        placeName: 'Published Place',
        copy: catalogues.en,
        ratings: [eligibleRating],
        noteDetails: {}
      },
      form: null
    } as never);

    expect(screen.queryByText('Private Rating Note')).toBeNull();
  });
});
