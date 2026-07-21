import { error, fail, redirect } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  RoleRequiredError,
  requireRole
} from '$server/auth/require-role';
import { getPublishedProfile } from '$server/discovery/public-places';
import { parseReportFormData } from '$server/place-flags/place-flag-input';
import { submitReport, type PlaceFlagRpcClient } from '$server/place-flags/place-flags';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const lang = parseLocale(params.lang);
  const returnTo = `${url.pathname}${url.search}`;
  const signInUrl = accountRedirectUrl(lang, returnTo);

  if (!locals.supabase) {
    error(503, { message: locals.copy['error.unexpectedBody'], requestId: locals.requestId });
  }

  const profileResult = await getPublishedProfile(locals.supabase, params.id, lang);
  if (profileResult.status === 'not_found') {
    error(404, { message: locals.copy['error.notFoundBody'], requestId: locals.requestId });
  }
  if (profileResult.status !== 'success') {
    error(503, { message: locals.copy['error.unexpectedBody'], requestId: locals.requestId });
  }

  const presetField = url.searchParams.get('field');
  const presetConditionId = url.searchParams.get('conditionId');

  try {
    await requireRole(locals.supabase, 'member');
    return {
      signInUrl: null,
      place: profileResult.value,
      presetField,
      presetConditionId
    };
  } catch (cause) {
    if (cause instanceof AuthenticationRequiredError || cause instanceof RoleRequiredError) {
      return { signInUrl, place: profileResult.value, presetField, presetConditionId };
    }
    if (cause instanceof AuthenticationUnavailableError) {
      return {
        unavailable: true as const,
        signInUrl: null,
        place: profileResult.value,
        presetField,
        presetConditionId
      };
    }
    throw cause;
  }
};

export const actions: Actions = {
  default: async ({ locals, params, request }) => {
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
    formData.set('placeId', params.id);
    const parsed = parseReportFormData(formData);
    if (!parsed.ok) return fail(400, { error: parsed.error });

    const result = await submitReport(
      locals.supabase as unknown as PlaceFlagRpcClient,
      parsed.payload,
      locals.requestId
    );
    if (result.status !== 'success') {
      const status =
        result.status === 'rate_limited'
          ? 429
          : result.status === 'forbidden'
            ? 401
            : result.status === 'conflict'
              ? 409
              : result.status === 'invalid'
                ? 400
                : 503;
      return fail(status, { error: result.status });
    }

    redirect(
      303,
      `/${lang}/account/corrections-and-reports?submitted=${encodeURIComponent(result.value.flagId)}`
    );
  }
};

function accountRedirectUrl(lang: 'is' | 'en', returnTo: string): string {
  return `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`;
}
