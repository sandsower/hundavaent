import { error, fail, redirect } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import {
  claimMyAchievementContinuations,
  claimMyAchievementCelebrations,
  getMyAchievementCollectionProgress,
  getMyAchievements,
  type AchievementRpcClient
} from '$server/achievements/achievements';
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  RoleRequiredError,
  requireRole
} from '$server/auth/require-role';

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

  const client = locals.supabase as unknown as AchievementRpcClient;
  const [result, progress] = await Promise.all([
    getMyAchievements(client),
    getMyAchievementCollectionProgress(client)
  ]);
  if (result.status !== 'success' || progress.status !== 'success') {
    if (result.status === 'forbidden' || progress.status === 'forbidden') {
      error(403, {
        message: locals.copy['error.unexpectedBody'],
        requestId: locals.requestId
      });
    }
    error(503, {
      message: locals.copy['achievements.unavailable'],
      requestId: locals.requestId
    });
  }

  return { achievements: result.value, collectionProgress: progress.value };
};

export const actions: Actions = {
  claimAchievements: async ({ locals }) => {
    if (!locals.supabase) {
      return fail(503, { action: 'claimAchievements', error: 'unavailable' });
    }

    try {
      await requireRole(locals.supabase, 'member');
    } catch (cause) {
      if (cause instanceof AuthenticationRequiredError || cause instanceof RoleRequiredError) {
        return fail(401, { action: 'claimAchievements', error: 'authentication_required' });
      }
      if (cause instanceof AuthenticationUnavailableError) {
        return fail(503, { action: 'claimAchievements', error: 'unavailable' });
      }
      throw cause;
    }

    const client = locals.supabase as unknown as AchievementRpcClient;
    const [result, continuations] = await Promise.all([
      claimMyAchievementCelebrations(client),
      claimMyAchievementContinuations(client)
    ]);
    if (result.status !== 'success' || continuations.status !== 'success') {
      const forbidden = result.status === 'forbidden' || continuations.status === 'forbidden';
      return fail(forbidden ? 403 : 503, {
        action: 'claimAchievements',
        error: forbidden ? 'forbidden' : 'unavailable'
      });
    }

    return {
      action: 'claimAchievements',
      claimed: result.value,
      continuations: continuations.value
    };
  }
};

function redirectToAccount(lang: 'is' | 'en', returnTo: string): never {
  redirect(303, `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`);
}
