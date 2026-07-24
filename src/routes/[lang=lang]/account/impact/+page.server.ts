import { error, redirect } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import { getMyAchievements, type AchievementRpcClient } from '$server/achievements/achievements';
import {
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  RoleRequiredError,
  requireRole
} from '$server/auth/require-role';
import {
  getMyContributorStatus,
  type ContributorRpcClient
} from '$server/contributors/contributor-status';
import { getMyImpactRecord, type ImpactRpcClient } from '$server/impact/impact-record';
import { getWeeklyRhythmHistory } from '$server/member-activity/weekly-rhythm';

import type { PageServerLoad } from './$types';

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

  const [impact, rhythm, contributor, achievements] = await Promise.all([
    getMyImpactRecord(locals.supabase as unknown as ImpactRpcClient, lang),
    getWeeklyRhythmHistory(locals.supabase),
    getMyContributorStatus(locals.supabase as unknown as ContributorRpcClient),
    getMyAchievements(locals.supabase as unknown as AchievementRpcClient)
  ]);

  if (impact.status !== 'success') {
    if (impact.status === 'forbidden') {
      error(403, {
        message: locals.copy['error.unexpectedBody'],
        requestId: locals.requestId
      });
    }
    error(503, {
      message: locals.copy['error.unexpectedBody'],
      requestId: locals.requestId
    });
  }

  return {
    impact: impact.value,
    rhythm,
    contributor:
      contributor.status === 'success'
        ? { status: 'available' as const, value: contributor.value }
        : { status: 'unavailable' as const },
    achievements:
      achievements.status === 'success'
        ? { status: 'available' as const, value: achievements.value }
        : { status: 'unavailable' as const }
  };
};

function redirectToAccount(lang: 'is' | 'en', returnTo: string): never {
  redirect(303, `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`);
}
