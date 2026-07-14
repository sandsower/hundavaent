import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '../../src/lib/server/db/generated.types.ts';
import type {
  AcquisitionCandidate,
  AcquisitionMimeType,
  AcquisitionPlace,
  DownloadedPhoto,
  RegisterAcquiredPhotoInput,
  RegisterAcquiredPhotoResult
} from './types.ts';

const maximumPhotoBytes = 15 * 1024 * 1024;

export class SupabasePhotoAcquisitionAdapter {
  private readonly client: SupabaseClient<Database>;
  private readonly fetcher: typeof fetch;

  constructor(client: SupabaseClient<Database>, fetcher: typeof fetch = fetch) {
    this.client = client;
    this.fetcher = fetcher;
  }

  async listInventory(): Promise<AcquisitionPlace[]> {
    const { data, error } = await this.client.rpc('get_photo_acquisition_inventory');
    if (error) throw new Error(`Could not list photo acquisition inventory: ${error.message}`);
    return data.map((row) => ({
      placeId: row.place_id,
      lifecycle: row.lifecycle as AcquisitionPlace['lifecycle'],
      nameIs: row.name_is,
      nameEn: row.name_en,
      websiteUrl: row.website_url,
      latitude: row.latitude,
      longitude: row.longitude,
      existingPhotoHashes: row.existing_photo_hashes,
      existingPhotoSourceUrls: row.existing_photo_source_urls
    }));
  }

  async download(candidate: AcquisitionCandidate): Promise<DownloadedPhoto> {
    const response = await this.fetcher(candidate.downloadUrl, {
      headers: {
        'User-Agent':
          'Hundavaent/1.0 (rights-cleared Place photo acquisition; https://hundavaent.is)',
        Accept: 'image/jpeg,image/png,image/webp'
      }
    });
    if (!response.ok) {
      throw new Error(`${candidate.sourceId}: download failed with HTTP ${response.status}`);
    }
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > maximumPhotoBytes) {
      throw new Error(`${candidate.sourceId}: download exceeds the 15 MB limit`);
    }
    const mimeType = normalizeMimeType(response.headers.get('content-type'));
    if (!mimeType) {
      throw new Error(`${candidate.sourceId}: download returned an unsupported MIME type`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumPhotoBytes) {
      throw new Error(`${candidate.sourceId}: download exceeds the 15 MB limit`);
    }
    return { bytes, mimeType };
  }

  async upload(input: {
    objectPath: string;
    bytes: Uint8Array;
    mimeType: AcquisitionMimeType;
  }): Promise<void> {
    const { error } = await this.client.storage
      .from('place-photos')
      .upload(input.objectPath, input.bytes, {
        contentType: input.mimeType,
        upsert: false
      });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  }

  async remove(objectPath: string): Promise<void> {
    const { error } = await this.client.storage.from('place-photos').remove([objectPath]);
    if (error) throw new Error(`Could not remove failed photo upload: ${error.message}`);
  }

  async register(input: RegisterAcquiredPhotoInput): Promise<RegisterAcquiredPhotoResult> {
    const candidate = input.candidate;
    const { data, error } = await this.client.rpc('register_acquired_place_photo', {
      command_payload: {
        place_id: input.placeId,
        kind: 'photo',
        storage_object_path: input.objectPath,
        mime_type: input.mimeType,
        byte_size: input.byteSize,
        width_px: candidate.widthPx,
        height_px: candidate.heightPx,
        source_url: candidate.sourcePageUrl,
        rights_basis: candidate.rightsBasis,
        rights_evidence_reference: candidate.rightsEvidenceReference,
        license_reference: candidate.licenseReference,
        license_url: candidate.licenseUrl,
        photographer_or_uploader: candidate.photographerOrUploader,
        attribution_text: candidate.attributionText,
        attribution_url: candidate.attributionUrl,
        source_or_capture_date: candidate.sourceOrCaptureDate,
        content_sha256: input.contentSha256,
        alt_text_is: candidate.altTextIs,
        alt_text_en: candidate.altTextEn,
        people_review: input.peopleReview
      } as Json,
      command_request_id: input.requestId
    });
    if (error || data.length !== 1 || !data[0]) {
      return { status: 'failed', detail: error?.message ?? 'registration returned no row' };
    }
    return { status: 'success', mediaId: data[0].media_id };
  }
}

function normalizeMimeType(value: string | null): AcquisitionMimeType | null {
  const mime = value?.split(';')[0]?.trim().toLowerCase();
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') return mime;
  return null;
}
