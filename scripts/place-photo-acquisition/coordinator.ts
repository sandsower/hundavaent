import { createHash } from 'node:crypto';

import { scoreCandidateForPlace, stableCandidateRequestId } from './policy.ts';
import type {
  AcquisitionCandidate,
  AcquisitionMimeType,
  AcquisitionOutcome,
  AcquisitionPlace,
  AcquisitionReport,
  DownloadedPhoto,
  RegisterAcquiredPhotoInput,
  RegisterAcquiredPhotoResult
} from './types.ts';

const maximumCandidatesPerPlace = 3;
const minimumCandidateScore = 100;
const maximumPhotoBytes = 15 * 1024 * 1024;

export interface PhotoAcquisitionDependencies {
  mode: 'dry_run' | 'live';
  listInventory: () => Promise<AcquisitionPlace[]>;
  canDiscover?: (place: AcquisitionPlace) => boolean;
  discover: (place: AcquisitionPlace) => Promise<AcquisitionCandidate[]>;
  acceptCandidate?: (place: AcquisitionPlace, candidate: AcquisitionCandidate) => boolean;
  download: (candidate: AcquisitionCandidate) => Promise<DownloadedPhoto>;
  upload: (input: {
    placeId: string;
    candidate: AcquisitionCandidate;
    objectPath: string;
    bytes: Uint8Array;
    mimeType: AcquisitionMimeType;
  }) => Promise<void>;
  remove: (objectPath: string) => Promise<void>;
  register: (input: RegisterAcquiredPhotoInput) => Promise<RegisterAcquiredPhotoResult>;
}

export async function runPhotoAcquisition(
  dependencies: PhotoAcquisitionDependencies
): Promise<AcquisitionReport> {
  const places = await dependencies.listInventory();
  const outcomes: AcquisitionOutcome[] = [];
  const knownHashes = new Set(places.flatMap((place) => place.existingPhotoHashes));

  for (const place of places) {
    outcomes.push(await acquireForPlace(place, dependencies, knownHashes));
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: dependencies.mode,
    totalPlaces: places.length,
    countsByStatus: tally(outcomes),
    outcomes
  };
}

async function acquireForPlace(
  place: AcquisitionPlace,
  dependencies: PhotoAcquisitionDependencies,
  knownHashes: Set<string>
): Promise<AcquisitionOutcome> {
  if (dependencies.canDiscover && !dependencies.canDiscover(place)) {
    return outcome(
      place,
      'search_deferred',
      0,
      0,
      'Unpublished Place name was not disclosed to the external source',
      []
    );
  }

  try {
    const candidates = (await dependencies.discover(place))
      .filter(
        (candidate) =>
          !dependencies.acceptCandidate || dependencies.acceptCandidate(place, candidate)
      )
      .map((candidate) => ({ candidate, score: scoreCandidateForPlace(place, candidate) }))
      .filter((entry) => entry.score >= minimumCandidateScore)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.candidate.sourceId.localeCompare(right.candidate.sourceId)
      )
      .slice(0, maximumCandidatesPerPlace);

    const reportCandidates = candidates.map(({ candidate, score }) => ({
      sourceId: candidate.sourceId,
      sourcePageUrl: candidate.sourcePageUrl,
      rightsBasis: candidate.rightsBasis,
      score
    }));

    if (candidates.length === 0) {
      return outcome(place, 'no_candidate', 0, 0, null, reportCandidates);
    }

    const newCandidates = candidates.filter(
      ({ candidate }) => !place.existingPhotoSourceUrls.includes(candidate.sourcePageUrl)
    );
    if (newCandidates.length === 0) {
      return outcome(place, 'already_covered', candidates.length, 0, null, reportCandidates);
    }

    if (dependencies.mode === 'dry_run') {
      return outcome(place, 'planned', newCandidates.length, 0, null, reportCandidates);
    }

    let importedCount = 0;
    const failures: string[] = [];
    for (const { candidate } of newCandidates) {
      let uploadedPath: string | null = null;
      try {
        const downloaded = await dependencies.download(candidate);
        if (downloaded.mimeType !== candidate.expectedMimeType) {
          failures.push(`${candidate.sourceId}: downloaded MIME type changed`);
          continue;
        }
        if (downloaded.bytes.byteLength === 0 || downloaded.bytes.byteLength > maximumPhotoBytes) {
          failures.push(`${candidate.sourceId}: downloaded byte size is invalid`);
          continue;
        }

        const contentSha256 = createHash('sha256').update(downloaded.bytes).digest('hex');
        if (knownHashes.has(contentSha256)) continue;

        const requestId = stableCandidateRequestId(place.placeId, candidate.sourceId);
        const extension = extensionFor(downloaded.mimeType);
        const objectPath = `${place.placeId}/${requestId}.${extension}`;
        await dependencies.upload({
          placeId: place.placeId,
          candidate,
          objectPath,
          bytes: downloaded.bytes,
          mimeType: downloaded.mimeType
        });
        uploadedPath = objectPath;

        const registration = await dependencies.register({
          placeId: place.placeId,
          candidate,
          objectPath,
          requestId,
          contentSha256,
          byteSize: downloaded.bytes.byteLength,
          mimeType: downloaded.mimeType,
          peopleReview: 'unknown'
        });
        if (registration.status !== 'success') {
          await dependencies.remove(objectPath);
          uploadedPath = null;
          failures.push(`${candidate.sourceId}: ${registration.detail}`);
          continue;
        }
        uploadedPath = null;
        knownHashes.add(contentSha256);
        importedCount += 1;
      } catch (error) {
        let cleanupDetail = '';
        if (uploadedPath) {
          try {
            await dependencies.remove(uploadedPath);
          } catch (cleanupError) {
            cleanupDetail = `; cleanup failed: ${errorMessage(cleanupError)}`;
          }
        }
        failures.push(`${candidate.sourceId}: ${errorMessage(error)}${cleanupDetail}`);
      }
    }

    if (importedCount > 0) {
      return outcome(
        place,
        'imported',
        newCandidates.length,
        importedCount,
        failures.length > 0 ? failures.join('; ') : null,
        reportCandidates
      );
    }
    if (failures.length > 0) {
      return outcome(
        place,
        'failed',
        newCandidates.length,
        0,
        failures.join('; '),
        reportCandidates
      );
    }
    return outcome(place, 'already_covered', newCandidates.length, 0, null, reportCandidates);
  } catch (error) {
    return outcome(
      place,
      'failed',
      0,
      0,
      error instanceof Error ? error.message : 'Unknown acquisition error',
      []
    );
  }
}

function outcome(
  place: AcquisitionPlace,
  status: AcquisitionOutcome['status'],
  candidateCount: number,
  importedCount: number,
  detail: string | null,
  candidates: AcquisitionOutcome['candidates']
): AcquisitionOutcome {
  return {
    placeId: place.placeId,
    lifecycle: place.lifecycle,
    name: place.nameEn,
    status,
    candidateCount,
    importedCount,
    detail,
    candidates
  };
}

function tally(outcomes: AcquisitionOutcome[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of outcomes) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return counts;
}

function extensionFor(mimeType: AcquisitionMimeType): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  return 'webp';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown acquisition error';
}
