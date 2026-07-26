import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogues } from '$i18n';
import type { MemberPlacePhoto } from '$lib/contributions/photo';
import PlacePhotos from '$lib/discovery/PlacePhotos.svelte';
import SelectedPlaceCard from '$lib/discovery/SelectedPlaceCard.svelte';
import type {
  PublishedPlacePhoto,
  PublishedPlaceProfile,
  PublishedPlaceSummary
} from '$server/discovery/public-places';

/**
 * "Add a photo": the affordance a signed-out reader can see, the gate that fires when they use it,
 * and the tile their own photo becomes while it waits for review.
 */

const { requestAuthentication } = vi.hoisted(() => ({ requestAuthentication: vi.fn() }));
vi.mock('$lib/auth/controller', () => ({ requestAuthentication }));

const { uploadPlacePhoto, fetchMyPlacePhotos } = vi.hoisted(() => ({
  uploadPlacePhoto: vi.fn(),
  fetchMyPlacePhotos: vi.fn()
}));
vi.mock('$lib/contributions/photo-client', () => ({ uploadPlacePhoto, fetchMyPlacePhotos }));

const placeId = '30000000-0000-4000-8000-000000000003';
const submittedMediaId = '60000000-0000-4000-8000-000000000001';

const publishedPhoto: PublishedPlacePhoto = {
  mediaId: '50000000-0000-4000-8000-000000000001',
  url: 'https://example.invalid/signed/published.jpg',
  widthPx: 1600,
  heightPx: 1200,
  altTextIs: 'Hundur á kaffihúsi',
  altTextEn: 'A dog at a cafe',
  rightsBasis: 'cc_by',
  sourceUrl: null,
  licenseReference: 'CC BY 4.0',
  licenseUrl: null,
  attributionText: 'Photo: Hundavaent',
  attributionUrl: null,
  isPrimary: true,
  urlExpiresAt: '2099-01-01T00:00:00.000Z'
};

function memberPhoto(overrides: Partial<MemberPlacePhoto> = {}): MemberPlacePhoto {
  return {
    mediaId: submittedMediaId,
    url: 'https://example.invalid/signed/mine.jpg',
    approvalState: 'pending',
    widthPx: 800,
    heightPx: 600,
    uploadedAt: '2026-07-26T08:00:00.000Z',
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
    accessConditions: [],
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

function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ pending: [] }), {
          headers: { 'content-type': 'application/json' }
        })
    )
  );
}

function mountStrip(
  options: {
    photos?: PublishedPlacePhoto[];
    memberPhotos?: MemberPlacePhoto[];
    signedIn?: boolean;
    contributable?: boolean;
  } = {}
) {
  return render(PlacePhotos, {
    photos: options.photos ?? [],
    placeId,
    placeName: 'Brikk',
    lang: 'en' as const,
    copy: catalogues.en,
    featured: true,
    contributable: options.contributable ?? true,
    signedIn: options.signedIn ?? true,
    memberPhotos: options.memberPhotos ?? []
  });
}

function mountCard(options: { signedIn?: boolean } = {}) {
  return render(SelectedPlaceCard, {
    place,
    lang: 'en' as const,
    copy: catalogues.en,
    profile: profile(),
    loading: false,
    loadFailed: false,
    onClose: () => undefined,
    onRetry: () => undefined,
    signedIn: options.signedIn ?? true
  });
}

async function chooseFile(bytes = new Uint8Array([1, 2, 3]), type = 'image/jpeg'): Promise<void> {
  const picker = document.querySelector<HTMLInputElement>('[data-photo-picker]');
  expect(picker).toBeTruthy();
  const transfer = new DataTransfer();
  transfer.items.add(new File([bytes], 'walk.jpg', { type }));
  picker!.files = transfer.files;
  await fireEvent.change(picker!);
}

afterEach(() => {
  vi.unstubAllGlobals();
  requestAuthentication.mockReset();
  uploadPlacePhoto.mockReset();
  fetchMyPlacePhotos.mockReset();
});

describe('the add-a-photo affordance', () => {
  it('is offered on a Place with no photos at all', () => {
    const { container } = mountStrip();

    expect(container.querySelector('[data-photos-section]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a photo of Brikk' })).toBeTruthy();
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });

  it('stands beside the published photos rather than behind a disclosure', () => {
    mountStrip({ photos: [publishedPhoto] });

    expect(screen.getByAltText('A dog at a cafe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a photo of Brikk' })).toBeTruthy();
  });

  it('stays absent on a surface that was not given the Member their own photos', () => {
    const { container } = mountStrip({ contributable: false });

    expect(container.querySelector('[data-photos-section]')).toBeNull();
  });

  it('is visible signed out and asks for sign-in at the moment of action', async () => {
    mountStrip({ signedIn: false });

    const trigger = screen.getByRole('button', { name: 'Add a photo of Brikk' });
    await fireEvent.click(trigger);

    expect(requestAuthentication).toHaveBeenCalledWith({ origin: 'contribution' });
    expect(uploadPlacePhoto).not.toHaveBeenCalled();
  });

  it('refuses a file the endpoint would refuse, in the same words the editors use', async () => {
    const { container } = mountStrip();

    await chooseFile(new Uint8Array([1]), 'image/gif');

    await waitFor(() =>
      expect(container.querySelector('[data-photo-outcome]')?.textContent?.trim()).toBe(
        'Photos have to be JPEG, PNG or WebP.'
      )
    );
    expect(uploadPlacePhoto).not.toHaveBeenCalled();
  });

  it('reports a refused submission quietly and keeps the affordance standing', async () => {
    uploadPlacePhoto.mockResolvedValue({ status: 'rate_limited' });
    const { container } = mountStrip();

    await chooseFile();

    await waitFor(() =>
      expect(container.querySelector('[data-photo-outcome]')?.textContent?.trim()).toBe(
        'You have sent several photos recently. Please try again later.'
      )
    );
    expect(screen.getByRole('button', { name: 'Add a photo of Brikk' })).toBeTruthy();
  });
});

describe("the Member's own photos on the strip", () => {
  it('renders a pending photo with a badge that says it is waiting', () => {
    const { container } = mountStrip({ memberPhotos: [memberPhoto()] });

    expect(screen.getByAltText('Your photo of Brikk')).toBeTruthy();
    expect(container.querySelector('[data-photo-badge]')?.textContent?.trim()).toBe(
      'Waiting for review'
    );
  });

  it('leaves a rejected photo out of the strip without a word about it', () => {
    const { container } = mountStrip({
      memberPhotos: [memberPhoto({ approvalState: 'rejected' })]
    });

    expect(container.querySelectorAll('[data-member-photo]')).toHaveLength(0);
    expect(screen.queryByAltText('Your photo of Brikk')).toBeNull();
  });

  it('renders an approved photo once, not twice, when the public strip already carries it', () => {
    const { container } = mountStrip({
      photos: [publishedPhoto],
      memberPhotos: [memberPhoto({ mediaId: publishedPhoto.mediaId, approvalState: 'approved' })]
    });

    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(screen.getByAltText('A dog at a cafe')).toBeTruthy();
    expect(container.querySelector('[data-member-photo]')).toBeNull();
  });

  it('shows every published photo once the featured image has become a strip', () => {
    const secondPublished: PublishedPlacePhoto = {
      ...publishedPhoto,
      mediaId: '50000000-0000-4000-8000-000000000002',
      url: 'https://example.invalid/signed/second.jpg',
      altTextEn: 'A second dog at a cafe',
      isPrimary: false
    };
    const { container } = mountStrip({
      photos: [publishedPhoto, secondPublished],
      memberPhotos: [memberPhoto()]
    });

    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByAltText('A dog at a cafe')).toBeTruthy();
    expect(screen.getByAltText('A second dog at a cafe')).toBeTruthy();
    expect(screen.getByAltText('Your photo of Brikk')).toBeTruthy();
    expect(container.querySelector('.scroller')?.getAttribute('role')).toBe('region');
  });

  it('keeps the single featured image when the Member has no tile of their own', () => {
    const secondPublished: PublishedPlacePhoto = {
      ...publishedPhoto,
      mediaId: '50000000-0000-4000-8000-000000000002',
      url: 'https://example.invalid/signed/second.jpg',
      altTextEn: 'A second dog at a cafe',
      isPrimary: false
    };
    const { container } = mountStrip({ photos: [publishedPhoto, secondPublished] });

    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(screen.getByAltText('A dog at a cafe')).toBeTruthy();
    // A featured image is the card's own picture, not a labelled region a reader tabs into.
    expect(container.querySelector('.scroller')?.hasAttribute('role')).toBe(false);
    expect(container.querySelector('.scroller')?.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('renders the tile when the signed URL could not be minted', () => {
    const { container } = mountStrip({ memberPhotos: [memberPhoto({ url: null })] });

    expect(container.querySelector('[data-member-photo]')).toBeTruthy();
    expect(screen.getByText('Preview not available yet')).toBeTruthy();
    expect(container.querySelector('[data-member-photo] img')).toBeNull();
  });
});

describe('the card after a photo is accepted', () => {
  it('shows the pending tile and announces the outcome', async () => {
    stubFetch();
    fetchMyPlacePhotos.mockResolvedValue({ status: 'loaded', photos: [] });
    uploadPlacePhoto.mockResolvedValue({
      status: 'submitted',
      mediaId: submittedMediaId,
      approvalState: 'pending'
    });
    const { container } = mountCard();

    await waitFor(() => expect(fetchMyPlacePhotos).toHaveBeenCalledWith(placeId));
    fetchMyPlacePhotos.mockResolvedValue({ status: 'loaded', photos: [memberPhoto()] });

    await chooseFile();

    await waitFor(() =>
      expect(container.querySelector('[data-photo-badge]')?.textContent?.trim()).toBe(
        'Waiting for review'
      )
    );
    expect(uploadPlacePhoto).toHaveBeenCalledWith(placeId, expect.any(File));
    await waitFor(() =>
      expect(container.querySelector('[data-photo-announcement]')?.textContent?.trim()).toBe(
        'Thank you. A Moderator will check your photo.'
      )
    );
    // The refresh carries the signed URL the upload answer never had.
    await waitFor(() => expect(screen.getByAltText('Your photo of Brikk')).toBeTruthy());
  });

  it('asks nothing of the server for a signed-out reader', async () => {
    stubFetch();
    mountCard({ signedIn: false });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add a photo of Brikk' })).toBeTruthy()
    );
    expect(fetchMyPlacePhotos).not.toHaveBeenCalled();
  });
});
