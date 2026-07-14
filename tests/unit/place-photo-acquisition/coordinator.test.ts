import { describe, expect, it, vi } from 'vitest';

import { runPhotoAcquisition } from '../../../scripts/place-photo-acquisition/coordinator';
import type {
  AcquisitionCandidate,
  AcquisitionPlace
} from '../../../scripts/place-photo-acquisition/types';

const place: AcquisitionPlace = {
  placeId: 'a6300000-0000-4000-8000-000000000001',
  lifecycle: 'published',
  nameIs: 'Réttindakaffi',
  nameEn: 'Rights Cafe',
  websiteUrl: 'https://venue.example.invalid',
  latitude: 64.1466,
  longitude: -21.9426,
  existingPhotoHashes: [],
  existingPhotoSourceUrls: []
};

const candidate: AcquisitionCandidate = {
  sourceId: 'wikimedia-commons:123',
  title: 'File:Rights Cafe Reykjavík.jpg',
  sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Rights_Cafe_Reykjavik.jpg',
  downloadUrl: 'https://upload.wikimedia.org/example/1600px-Rights_Cafe.jpg',
  rightsBasis: 'cc_by',
  rightsEvidenceReference: 'Wikimedia Commons page 123',
  licenseReference: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  photographerOrUploader: 'A. Photographer',
  attributionText: 'Rights Cafe by A. Photographer, CC BY 4.0',
  attributionUrl: null,
  sourceOrCaptureDate: '2026-05-30',
  altTextIs: 'Ljósmynd af Réttindakaffi',
  altTextEn: 'Photo of Rights Cafe',
  widthPx: 1600,
  heightPx: 1067,
  expectedMimeType: 'image/jpeg'
};

describe('runPhotoAcquisition', () => {
  it('accounts for every Place without downloading or mutating in dry-run mode', async () => {
    const download = vi.fn();
    const upload = vi.fn();
    const register = vi.fn();

    const report = await runPhotoAcquisition({
      mode: 'dry_run',
      listInventory: async () => [
        place,
        { ...place, placeId: 'place-without-photo', nameEn: 'No Match' }
      ],
      discover: async (item) => (item.placeId === place.placeId ? [candidate] : []),
      download,
      upload,
      remove: vi.fn(),
      register
    });

    expect(report.totalPlaces).toBe(2);
    expect(report.outcomes).toEqual([
      expect.objectContaining({ placeId: place.placeId, status: 'planned', candidateCount: 1 }),
      expect.objectContaining({
        placeId: 'place-without-photo',
        status: 'no_candidate',
        candidateCount: 0
      })
    ]);
    expect(download).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('limits acquisition to candidates that passed explicit review', async () => {
    const rejected = { ...candidate, sourceId: 'wikimedia-commons:999' };
    const report = await runPhotoAcquisition({
      mode: 'dry_run',
      listInventory: async () => [place],
      discover: async () => [rejected, candidate],
      acceptCandidate: (_place, item) => item.sourceId === candidate.sourceId,
      download: vi.fn(),
      upload: vi.fn(),
      remove: vi.fn(),
      register: vi.fn()
    });

    expect(report.outcomes[0]).toMatchObject({
      status: 'planned',
      candidateCount: 1,
      candidates: [expect.objectContaining({ sourceId: candidate.sourceId })]
    });
  });

  it('downloads, hashes, uploads, and registers an accepted live candidate as pending', async () => {
    const bytes = new TextEncoder().encode('rights-safe-photo');
    const upload = vi.fn(async () => undefined);
    const register = vi.fn(async () => ({ status: 'success' as const, mediaId: 'media-1' }));

    const report = await runPhotoAcquisition({
      mode: 'live',
      listInventory: async () => [place],
      discover: async () => [candidate],
      download: async () => ({ bytes, mimeType: 'image/jpeg' as const }),
      upload,
      remove: vi.fn(),
      register
    });

    expect(report.outcomes[0]).toMatchObject({
      placeId: place.placeId,
      status: 'imported',
      candidateCount: 1,
      importedCount: 1
    });
    expect(upload).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        placeId: place.placeId,
        candidate,
        contentSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        peopleReview: 'unknown'
      })
    );
  });

  it('removes an uploaded object when registration fails and records the failure', async () => {
    const remove = vi.fn(async () => undefined);
    const report = await runPhotoAcquisition({
      mode: 'live',
      listInventory: async () => [place],
      discover: async () => [candidate],
      download: async () => ({
        bytes: new TextEncoder().encode('registration-failure'),
        mimeType: 'image/jpeg' as const
      }),
      upload: async () => undefined,
      remove,
      register: async () => ({ status: 'failed' as const, detail: 'database rejected it' })
    });

    expect(remove).toHaveBeenCalledOnce();
    expect(report.outcomes[0]).toMatchObject({ status: 'failed', importedCount: 0 });
  });

  it('continues with later candidates when one download fails', async () => {
    const second = {
      ...candidate,
      sourceId: 'wikimedia-commons:456',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Rights_Cafe_2.jpg'
    };
    const register = vi.fn(async () => ({ status: 'success' as const, mediaId: 'media-2' }));
    const report = await runPhotoAcquisition({
      mode: 'live',
      listInventory: async () => [place],
      discover: async () => [candidate, second],
      download: async (item) => {
        if (item.sourceId === candidate.sourceId) throw new Error('temporary source failure');
        return {
          bytes: new TextEncoder().encode('second-candidate'),
          mimeType: 'image/jpeg' as const
        };
      },
      upload: async () => undefined,
      remove: vi.fn(),
      register
    });

    expect(report.outcomes[0]).toMatchObject({
      status: 'imported',
      importedCount: 1,
      detail: expect.stringContaining('temporary source failure')
    });
    expect(register).toHaveBeenCalledOnce();
  });

  it('skips a source URL already present on the Place', async () => {
    const report = await runPhotoAcquisition({
      mode: 'live',
      listInventory: async () => [{ ...place, existingPhotoSourceUrls: [candidate.sourcePageUrl] }],
      discover: async () => [candidate],
      download: vi.fn(),
      upload: vi.fn(),
      remove: vi.fn(),
      register: vi.fn()
    });

    expect(report.outcomes[0]).toMatchObject({ status: 'already_covered', importedCount: 0 });
  });

  it('accounts for an unpublished Place without disclosing its name when discovery is not allowed', async () => {
    const discover = vi.fn();
    const report = await runPhotoAcquisition({
      mode: 'dry_run',
      listInventory: async () => [{ ...place, lifecycle: 'candidate' }],
      canDiscover: () => false,
      discover,
      download: vi.fn(),
      upload: vi.fn(),
      remove: vi.fn(),
      register: vi.fn()
    });

    expect(discover).not.toHaveBeenCalled();
    expect(report.outcomes[0]).toMatchObject({
      status: 'search_deferred',
      detail: 'Unpublished Place name was not disclosed to the external source'
    });
  });
});
