// Thin, self-contained wrappers around the same public.create_candidate_place and
// public.get_moderation_place_review RPCs that src/lib/server/moderation/place-moderation.ts
// calls for the product's own Moderator UI - matching its command shape and error-code mapping.
//
// This is a deliberate, small duplication rather than a runtime import of place-moderation.ts:
// that file transitively imports SvelteKit path aliases ($domain/*, $server/*) that only Vite's
// bundler resolves. A plain `node --experimental-strip-types` script has no bundler, so importing
// it at runtime (not just for its types) fails with ERR_MODULE_NOT_FOUND. Type-only imports of
// that module remain safe (and are used in lead-schema.ts) because Node's type-stripping elides
// `import type` without ever resolving the module graph.

import type { Database, Json } from '../../src/lib/server/db/generated.types.ts';
import type { CandidatePlaceCommand } from '../../src/lib/server/moderation/place-moderation.ts';

export interface CreatedCandidate {
  placeId: string;
  version: number;
}

export type CommandResult<T> =
  | { status: 'success'; value: T }
  | { status: 'validation_error' }
  | { status: 'forbidden' }
  | { status: 'conflict' }
  | { status: 'infrastructure_error' };

export async function createCandidatePlace(
  client: import('@supabase/supabase-js').SupabaseClient<Database>,
  command: CandidatePlaceCommand,
  requestId: string
): Promise<CommandResult<CreatedCandidate>> {
  try {
    const { data, error } = await client.rpc('create_candidate_place', {
      command_payload: command as unknown as Json,
      command_request_id: requestId
    });

    if (error) return mapCommandError(error.code);
    if (data.length !== 1) return { status: 'infrastructure_error' };
    const row = data[0]!;
    if (!row.place_id || !Number.isInteger(row.version) || row.version <= 0) {
      return { status: 'infrastructure_error' };
    }

    return { status: 'success', value: { placeId: row.place_id, version: row.version } };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export interface CandidateReviewEvidence {
  sourceUrl: string | null;
  sourceCitation: string | null;
  observedAt: string | null;
}

export interface CandidateReview {
  lifecycle: string;
  evidenceRecords: CandidateReviewEvidence[];
}

export type CandidateReviewResult =
  | { status: 'success'; value: CandidateReview }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'infrastructure_error' };

export async function getCandidatePublicationReview(
  client: import('@supabase/supabase-js').SupabaseClient<Database>,
  placeId: string
): Promise<CandidateReviewResult> {
  try {
    const { data, error } = await client.rpc('get_moderation_place_review', {
      requested_place_id: placeId
    });

    if (error) {
      return error.code === '42501' ? { status: 'forbidden' } : { status: 'infrastructure_error' };
    }
    if (data.length === 0) return { status: 'not_found' };
    if (data.length !== 1) return { status: 'infrastructure_error' };

    const row = data[0]!;
    if (!Array.isArray(row.evidence_records)) return { status: 'infrastructure_error' };

    return {
      status: 'success',
      value: {
        lifecycle: row.lifecycle,
        evidenceRecords: row.evidence_records.map((entry): CandidateReviewEvidence => {
          const record = entry as Record<string, unknown>;
          return {
            sourceUrl: typeof record.sourceUrl === 'string' ? record.sourceUrl : null,
            sourceCitation:
              typeof record.sourceCitation === 'string' ? record.sourceCitation : null,
            observedAt: typeof record.observedAt === 'string' ? record.observedAt : null
          };
        })
      }
    };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

export interface RegisterEvidenceScreenshotCommand {
  placeId: string;
  storageObjectPath: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  byteSize: number;
  widthPx: number;
  heightPx: number;
  sourceUrl: string;
  capturedAt: string;
}

export interface RegisteredEvidenceMedia {
  mediaId: string;
}

// Registers an Evidence screenshot already uploaded to the place-evidence Storage bucket
// (see src/lib/server/place-media/place-media.ts for the same two-step upload-then-register
// shape the product's own Moderator UI uses). The current lead schema carries no screenshot
// data, so ingest-launch-leads.ts does not call this today. It
// exists so a future lead-schema change carrying a captured screenshot can attach it with full
// provenance without duplicating this RPC wrapper again.
export async function registerPlaceMediaEvidence(
  client: import('@supabase/supabase-js').SupabaseClient<Database>,
  command: RegisterEvidenceScreenshotCommand,
  requestId: string
): Promise<CommandResult<RegisteredEvidenceMedia>> {
  try {
    const { data, error } = await client.rpc('register_place_media', {
      command_payload: {
        place_id: command.placeId,
        kind: 'evidence_screenshot',
        storage_object_path: command.storageObjectPath,
        mime_type: command.mimeType,
        byte_size: command.byteSize,
        width_px: command.widthPx,
        height_px: command.heightPx,
        source_url: command.sourceUrl,
        captured_at: command.capturedAt
      } as unknown as Json,
      command_request_id: requestId
    });

    if (error) return mapCommandError(error.code);
    if (data.length !== 1) return { status: 'infrastructure_error' };
    const row = data[0]!;
    if (!row.media_id) return { status: 'infrastructure_error' };

    return { status: 'success', value: { mediaId: row.media_id } };
  } catch {
    return { status: 'infrastructure_error' };
  }
}

function mapCommandError(code: string): CommandResult<never> {
  if (code === '42501') return { status: 'forbidden' };
  if (code === '22023' || code === '23502' || code === '23514')
    return { status: 'validation_error' };
  if (code === '23505' || code === '55006' || code === '40001') return { status: 'conflict' };
  return { status: 'infrastructure_error' };
}
