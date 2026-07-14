import { error, fail, redirect } from '@sveltejs/kit';

import { catalogues, parseLocale } from '$i18n';
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  RoleRequiredError,
  requireRole
} from '$server/auth/require-role';
import { getPublishedProfile } from '$server/discovery/public-places';
import {
  parseRatingFormData,
  readRatingNoteInput
} from '$server/dog-friendliness/dog-friendliness-input';
import {
  createReportFromRatingNote,
  getMyRating,
  getPrivateRatingNotePolicy,
  submitRating,
  type CurrentRating,
  type DogFriendlinessRpcClient
} from '$server/dog-friendliness/dog-friendliness';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const lang = parseLocale(params.lang);
  const returnTo = `${url.pathname}${url.search}`;
  const signInUrl = accountRedirectUrl(lang, returnTo);

  if (!locals.supabase) {
    error(503, { message: catalogues[lang]['error.unexpectedBody'], requestId: locals.requestId });
  }

  const profileResult = await getPublishedProfile(locals.supabase, params.id, lang);
  if (profileResult.status === 'not_found') {
    error(404, { message: catalogues[lang]['error.notFoundBody'], requestId: locals.requestId });
  }
  if (profileResult.status !== 'success') {
    error(503, { message: catalogues[lang]['error.unexpectedBody'], requestId: locals.requestId });
  }

  try {
    await requireRole(locals.supabase, 'member');
  } catch (cause) {
    if (cause instanceof AuthenticationRequiredError || cause instanceof RoleRequiredError) {
      return { signInUrl, place: profileResult.value, myRating: null, notePolicy: null };
    }
    if (cause instanceof AuthenticationUnavailableError) {
      return {
        unavailable: true as const,
        signInUrl: null,
        place: profileResult.value,
        myRating: null,
        notePolicy: null
      };
    }
    throw cause;
  }

  const client = locals.supabase as unknown as DogFriendlinessRpcClient;
  const [ratingResult, policyResult] = await Promise.all([
    getMyRating(client, params.id),
    getPrivateRatingNotePolicy(client)
  ]);

  return {
    signInUrl: null,
    place: profileResult.value,
    myRating: ratingResult.status === 'success' ? ratingResult.value : null,
    notePolicy:
      policyResult.status === 'success'
        ? policyResult.value
        : { enabled: false, lowScoreThreshold: null }
  };
};

// A just-saved Rating whose note qualifies for the explicit Report path (and does not already
// have one) pauses the usual redirect so the Member can take that second, deliberate action.
function offersReportPath(rating: CurrentRating): boolean {
  return (
    (rating.privateNoteClassification === 'inaccurate_info' ||
      rating.privateNoteClassification === 'safety_concern') &&
    rating.linkedReportId === null
  );
}

export const actions: Actions = {
  save: async ({ locals, params, request }) => {
    const lang = parseLocale(params.lang);
    if (!locals.supabase) return fail(401, { error: 'authentication_required' as const });

    try {
      await requireRole(locals.supabase, 'member');
    } catch (cause) {
      if (cause instanceof AuthenticationRequiredError || cause instanceof RoleRequiredError) {
        return fail(401, { error: 'authentication_required' as const });
      }
      return fail(503, { error: 'unavailable' as const });
    }

    const formData = await request.formData();
    const parsed = parseRatingFormData(formData);
    if (!parsed.ok) return fail(400, { error: parsed.error });

    const noteInput = readRatingNoteInput(formData);

    const result = await submitRating(
      locals.supabase as unknown as DogFriendlinessRpcClient,
      params.id,
      parsed.payload,
      locals.requestId,
      noteInput
    );
    if (result.status !== 'success') {
      const status =
        result.status === 'forbidden'
          ? 401
          : result.status === 'conflict'
            ? 409
            : result.status === 'invalid'
              ? 400
              : 503;
      return fail(status, { error: result.status });
    }

    if (offersReportPath(result.value)) {
      return { success: true as const, action: 'save' as const, rating: result.value };
    }

    redirect(303, `/${lang}?place=${encodeURIComponent(params.id)}`);
  },
  createReport: async ({ locals, params }) => {
    if (!locals.supabase) return fail(401, { error: 'authentication_required' as const });

    try {
      await requireRole(locals.supabase, 'member');
    } catch (cause) {
      if (cause instanceof AuthenticationRequiredError || cause instanceof RoleRequiredError) {
        return fail(401, { error: 'authentication_required' as const });
      }
      return fail(503, { error: 'unavailable' as const });
    }

    const result = await createReportFromRatingNote(
      locals.supabase as unknown as DogFriendlinessRpcClient,
      params.id,
      locals.requestId
    );
    if (result.status !== 'success') {
      const status =
        result.status === 'forbidden'
          ? 401
          : result.status === 'conflict'
            ? 409
            : result.status === 'invalid'
              ? 400
              : 503;
      return fail(status, { error: result.status, action: 'createReport' as const });
    }

    return { success: true as const, action: 'createReport' as const, flagId: result.value.flagId };
  }
};

function accountRedirectUrl(lang: 'is' | 'en', returnTo: string): string {
  return `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`;
}
