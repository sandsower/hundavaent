export type AcquisitionLifecycle = 'candidate' | 'published' | 'inactive';
export type AcquisitionRightsBasis =
  'cc0' | 'public_domain' | 'cc_by' | 'cc_by_sa' | 'official_reuse';
export type AcquisitionMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface AcquisitionPlace {
  placeId: string;
  lifecycle: AcquisitionLifecycle;
  nameIs: string;
  nameEn: string;
  websiteUrl: string | null;
  latitude: number;
  longitude: number;
  existingPhotoHashes: string[];
  existingPhotoSourceUrls: string[];
}

export interface AcquisitionCandidate {
  sourceId: string;
  title: string;
  sourcePageUrl: string;
  downloadUrl: string;
  rightsBasis: AcquisitionRightsBasis;
  rightsEvidenceReference: string;
  licenseReference: string;
  licenseUrl: string;
  photographerOrUploader: string;
  attributionText: string;
  attributionUrl: string | null;
  sourceOrCaptureDate: string;
  altTextIs: string;
  altTextEn: string;
  widthPx: number;
  heightPx: number;
  expectedMimeType: AcquisitionMimeType;
}

export interface DownloadedPhoto {
  bytes: Uint8Array;
  mimeType: AcquisitionMimeType;
}

export interface RegisterAcquiredPhotoInput {
  placeId: string;
  candidate: AcquisitionCandidate;
  objectPath: string;
  requestId: string;
  contentSha256: string;
  byteSize: number;
  mimeType: AcquisitionMimeType;
  peopleReview: 'unknown';
}

export type RegisterAcquiredPhotoResult =
  { status: 'success'; mediaId: string } | { status: 'failed'; detail: string };

export type AcquisitionOutcomeStatus =
  'planned' | 'no_candidate' | 'search_deferred' | 'already_covered' | 'imported' | 'failed';

export interface AcquisitionOutcome {
  placeId: string;
  lifecycle: AcquisitionLifecycle;
  name: string;
  status: AcquisitionOutcomeStatus;
  candidateCount: number;
  importedCount: number;
  detail: string | null;
  candidates: Array<{
    sourceId: string;
    sourcePageUrl: string;
    rightsBasis: AcquisitionRightsBasis;
    score: number;
  }>;
}

export interface AcquisitionReport {
  schemaVersion: 1;
  generatedAt: string;
  mode: 'dry_run' | 'live';
  totalPlaces: number;
  countsByStatus: Record<string, number>;
  outcomes: AcquisitionOutcome[];
}
