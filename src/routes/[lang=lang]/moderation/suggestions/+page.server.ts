import { error } from '@sveltejs/kit';

import { catalogues, parseLocale } from '$i18n';
import {
  loadModerationSuggestionQueue,
  parseModerationSuggestionQueueCursor
} from '$server/moderation/suggestion-workspace';
import type { ContributorRpcClient } from '$server/contributors/contributor-status';
import type { SuggestionRpcClient } from '$server/suggestions/suggestions';

import type { PageServerLoad } from './$types';

// The Moderator guard for this load is enforced by the parent moderation +layout.server.ts.
export const load: PageServerLoad = async ({ locals, params, url }) => {
  const lang = parseLocale(params.lang);
  if (!locals.supabase) {
    error(503, { message: catalogues[lang]['error.unexpectedBody'], requestId: locals.requestId });
  }

  const result = await loadModerationSuggestionQueue(
    locals.supabase as unknown as SuggestionRpcClient,
    locals.supabase as unknown as ContributorRpcClient,
    parseModerationSuggestionQueueCursor(url.searchParams)
  );
  if (result.status !== 'success') {
    error(result.status === 'forbidden' ? 403 : 503, {
      message: catalogues[lang]['error.unexpectedBody'],
      requestId: locals.requestId
    });
  }

  return result.value;
};
