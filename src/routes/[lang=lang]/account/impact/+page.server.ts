import { error, fail, redirect } from '@sveltejs/kit';

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
import {
  getMyTrustedVerificationFeedback,
  listMyTrustedVerificationSubmissions,
  markMyTrustedVerificationFeedbackRead,
  type TrustedVerificationRpcClient
} from '$server/trusted-verification/trusted-verification';

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

  const trustedClient = locals.supabase as unknown as TrustedVerificationRpcClient;
  const [impact, rhythm, contributor, achievements, trustedHistory, trustedFeedback] =
    await Promise.all([
      getMyImpactRecord(locals.supabase as unknown as ImpactRpcClient, lang),
      getWeeklyRhythmHistory(locals.supabase),
      getMyContributorStatus(locals.supabase as unknown as ContributorRpcClient),
      getMyAchievements(locals.supabase as unknown as AchievementRpcClient),
      listMyTrustedVerificationSubmissions(trustedClient, lang, 30),
      getMyTrustedVerificationFeedback(trustedClient)
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
        : { status: 'unavailable' as const },
    trustedVerificationHistory: trustedHistory.status === 'success' ? trustedHistory.value : [],
    trustedVerificationFeedback:
      trustedFeedback.status === 'success'
        ? { status: 'available' as const, value: trustedFeedback.value }
        : { status: 'unavailable' as const }
  };
};

export const actions: Actions = {
  markTrustedVerificationRead: async ({ locals, request }) => {
    if (!locals.supabase) {
      return fail(503, { action: 'markTrustedVerificationRead', error: 'unavailable' });
    }

    try {
      await requireRole(locals.supabase, 'member');
    } catch (cause) {
      if (cause instanceof AuthenticationRequiredError || cause instanceof RoleRequiredError) {
        return fail(401, {
          action: 'markTrustedVerificationRead',
          error: 'authentication_required'
        });
      }
      if (cause instanceof AuthenticationUnavailableError) {
        return fail(503, { action: 'markTrustedVerificationRead', error: 'unavailable' });
      }
      throw cause;
    }

    const formData = await request.formData();
    const readThrough = String(formData.get('readThrough') ?? '');
    if (!Number.isFinite(Date.parse(readThrough))) {
      return fail(400, { action: 'markTrustedVerificationRead', error: 'invalid' });
    }

    const result = await markMyTrustedVerificationFeedbackRead(
      locals.supabase as unknown as TrustedVerificationRpcClient,
      readThrough
    );
    if (result.status !== 'success') {
      return fail(result.status === 'forbidden' ? 403 : 503, {
        action: 'markTrustedVerificationRead',
        error: result.status === 'forbidden' ? 'forbidden' : 'unavailable'
      });
    }

    return { action: 'markTrustedVerificationRead', acknowledged: true };
  }
};

function redirectToAccount(lang: 'is' | 'en', returnTo: string): never {
  redirect(303, `/${lang}/account?returnTo=${encodeURIComponent(returnTo)}`);
}
