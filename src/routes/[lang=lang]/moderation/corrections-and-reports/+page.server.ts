import { error } from '@sveltejs/kit';

import {
  loadModerationCorrectionQueue,
  parseModerationCorrectionQueueCursor
} from '$server/moderation/correction-workspace';
import type { PlaceFlagRpcClient } from '$server/place-flags/place-flags';

import type { PageServerLoad } from './$types';

// The Moderator guard for this load is enforced by the parent moderation +layout.server.ts.
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.supabase) {
    error(503, { message: locals.copy['error.unexpectedBody'], requestId: locals.requestId });
  }

  const result = await loadModerationCorrectionQueue(
    locals.supabase as unknown as PlaceFlagRpcClient,
    parseModerationCorrectionQueueCursor(url.searchParams)
  );
  if (result.status !== 'success') {
    error(result.status === 'forbidden' ? 403 : 503, {
      message: locals.copy['error.unexpectedBody'],
      requestId: locals.requestId
    });
  }

  return {
    flags: result.value.flags,
    nextCursor: result.value.nextCursor,
    hasPrevious: result.value.hasPrevious
  };
};
