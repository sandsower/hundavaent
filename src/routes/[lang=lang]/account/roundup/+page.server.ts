import { error, fail, redirect } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  RoleRequiredError,
  requireRole
} from '$server/auth/require-role';
import {
  getWeeklyRoundup,
  saveRoundupPreferences,
  type RoundupRpcClient
} from '$server/roundup/roundup';
import { parseRoundupPreferencesFormData } from '$server/roundup/roundup-input';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const lang = parseLocale(params.lang);
  const returnTo = `${url.pathname}${url.search}`;
  if (!locals.supabase) redirectToAccount(lang, returnTo);

  try {
    await requireRole(locals.supabase, 'member');
  } catch (cause) {
    if (cause instanceof AuthenticationRequiredError || cause instanceof RoleRequiredError) {
      redirectToAccount(lang, returnTo);
    }
    if (cause instanceof AuthenticationUnavailableError) {
      error(503, {
        message: locals.copy['error.unexpectedBody'],
        requestId: locals.requestId
      });
    }
    throw cause;
  }

  const result = await getWeeklyRoundup(locals.supabase as unknown as RoundupRpcClient);
  return {
    roundup: result.status === 'success' ? result.value : { status: 'unavailable' as const }
  };
};

export const actions: Actions = {
  savePreferences: async ({ locals, request }) => {
    if (!locals.supabase) {
      return fail(503, { action: 'savePreferences', error: 'unavailable' });
    }

    try {
      await requireRole(locals.supabase, 'member');
    } catch (cause) {
      if (cause instanceof AuthenticationRequiredError || cause instanceof RoleRequiredError) {
        return fail(401, { action: 'savePreferences', error: 'authentication_required' });
      }
      if (cause instanceof AuthenticationUnavailableError) {
        return fail(503, { action: 'savePreferences', error: 'unavailable' });
      }
      throw cause;
    }

    const parsed = parseRoundupPreferencesFormData(await request.formData());
    if (!parsed.ok) {
      return fail(400, { action: 'savePreferences', error: parsed.error });
    }

    const result = await saveRoundupPreferences(
      locals.supabase as unknown as RoundupRpcClient,
      parsed.value
    );
    if (result.status !== 'success') {
      return fail(503, { action: 'savePreferences', error: 'unavailable' });
    }

    return {
      action: 'savePreferences',
      success: true,
      preferences: result.value
    };
  }
};

function redirectToAccount(lang: 'is' | 'en', returnTo: string): never {
  redirect(303, `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`);
}
