import { error, fail } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import { getPublishedProfile } from '$server/discovery/public-places';
import {
  excludeRating,
  listModerationRatingNoteDispositions,
  listModerationRatingNoteHistory,
  listModerationRatings,
  recordRatingNoteDisposition,
  reinstateRating,
  type DogFriendlinessRpcClient,
  type RatingNoteDisposition,
  type RatingNoteHistoryEntry
} from '$server/dog-friendliness/dog-friendliness';
import {
  parseRatingExclusionFormData,
  parseRatingNoteDispositionFormData,
  parseRatingReinstatementFormData
} from '$server/dog-friendliness/dog-friendliness-input';

import type { Actions, PageServerLoad } from './$types';

export interface RatingNoteDetail {
  history: RatingNoteHistoryEntry[];
  dispositions: RatingNoteDisposition[];
}

// The Moderator guard for this load is enforced by the parent moderation +layout.server.ts.
export const load: PageServerLoad = async ({ locals, params }) => {
  const lang = parseLocale(params.lang);
  if (!locals.supabase) {
    error(503, { message: locals.copy['error.unexpectedBody'], requestId: locals.requestId });
  }

  const client = locals.supabase as unknown as DogFriendlinessRpcClient;
  const [profileResult, ratingsResult] = await Promise.all([
    getPublishedProfile(locals.supabase, params.placeId, lang),
    listModerationRatings(client, params.placeId)
  ]);

  if (ratingsResult.status !== 'success') {
    error(503, { message: locals.copy['error.unexpectedBody'], requestId: locals.requestId });
  }

  // Only fetch the deeper note history/disposition detail for Ratings that currently carry a
  // Private Rating Note, extending the existing moderation workspace surface rather than adding a
  // separate route.
  const notedRatings = ratingsResult.value.filter((rating) => rating.privateNote !== null);
  const noteDetailEntries = await Promise.all(
    notedRatings.map(async (rating) => {
      const [historyResult, dispositionsResult] = await Promise.all([
        listModerationRatingNoteHistory(client, rating.memberId, params.placeId),
        listModerationRatingNoteDispositions(client, rating.memberId, params.placeId)
      ]);
      const detail: RatingNoteDetail = {
        history: historyResult.status === 'success' ? historyResult.value : [],
        dispositions: dispositionsResult.status === 'success' ? dispositionsResult.value : []
      };
      return [rating.memberId, detail] as const;
    })
  );

  return {
    placeId: params.placeId,
    placeName: profileResult.status === 'success' ? profileResult.value.name : null,
    ratings: ratingsResult.value,
    noteDetails: Object.fromEntries(noteDetailEntries) as Record<string, RatingNoteDetail>
  };
};

// Each action below is itself enforced by security.require_moderator() inside the RPC.
export const actions: Actions = {
  exclude: async ({ locals, params, request }) => {
    if (!locals.supabase) return fail(503, { error: 'unavailable' as const });

    const form = await request.formData();
    const memberId = String(form.get('memberId') ?? '').trim();
    if (!memberId) return fail(400, { error: 'incomplete' as const });

    const parsed = parseRatingExclusionFormData(form);
    if (!parsed.ok) return fail(400, { error: parsed.error });

    const result = await excludeRating(
      locals.supabase as unknown as DogFriendlinessRpcClient,
      memberId,
      params.placeId,
      parsed.payload.exclusionKind,
      parsed.payload.reason,
      locals.requestId
    );
    if (result.status !== 'success') {
      return fail(mapStatusToHttpCode(result.status), { error: result.status });
    }

    return { success: true as const, action: 'exclude' as const };
  },
  reinstate: async ({ locals, params, request }) => {
    if (!locals.supabase) return fail(503, { error: 'unavailable' as const });

    const form = await request.formData();
    const memberId = String(form.get('memberId') ?? '').trim();
    if (!memberId) return fail(400, { error: 'incomplete' as const });

    const parsed = parseRatingReinstatementFormData(form);
    if (!parsed.ok) return fail(400, { error: parsed.error });

    const result = await reinstateRating(
      locals.supabase as unknown as DogFriendlinessRpcClient,
      memberId,
      params.placeId,
      parsed.payload.reason,
      locals.requestId
    );
    if (result.status !== 'success') {
      return fail(mapStatusToHttpCode(result.status), { error: result.status });
    }

    return { success: true as const, action: 'reinstate' as const };
  },
  recordDisposition: async ({ locals, params, request }) => {
    if (!locals.supabase) return fail(503, { error: 'unavailable' as const });

    const form = await request.formData();
    const memberId = String(form.get('memberId') ?? '').trim();
    if (!memberId) return fail(400, { error: 'incomplete' as const });

    const parsed = parseRatingNoteDispositionFormData(form);
    if (!parsed.ok) return fail(400, { error: parsed.error });

    const result = await recordRatingNoteDisposition(
      locals.supabase as unknown as DogFriendlinessRpcClient,
      memberId,
      params.placeId,
      parsed.payload.dispositionKind,
      parsed.payload.notes,
      locals.requestId
    );
    if (result.status !== 'success') {
      return fail(mapStatusToHttpCode(result.status), { error: result.status });
    }

    return { success: true as const, action: 'recordDisposition' as const };
  }
};

function mapStatusToHttpCode(
  status: 'forbidden' | 'invalid' | 'conflict' | 'infrastructure_error'
): number {
  if (status === 'forbidden') return 403;
  if (status === 'conflict') return 409;
  if (status === 'invalid') return 400;
  return 503;
}
