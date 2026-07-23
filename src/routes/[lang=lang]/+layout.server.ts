import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

import { parseLocale } from '$i18n';
import {
  getMyAchievementStatus,
  type AchievementRpcClient
} from '$server/achievements/achievements';
import { clearRequestAuthSession } from '$server/auth/callback';
import { getMemberAuthConfig } from '$server/auth/member';
import {
  authPendingIntentTokenPattern,
  completePendingAuthIntent
} from '$server/auth/pending-intent';
import { resolveConfiguredMemberProviders } from '$server/auth/provider-policy';
import { AuthenticationExpiredError, getMemberSession } from '$server/auth/session';
import { getWeeklyRhythm } from '$server/member-activity/weekly-rhythm';

export const load: LayoutServerLoad = async ({ cookies, locals, params, url }) => {
  const lang = parseLocale(params.lang);
  let signedIn = false;
  let providers = { email: false, facebook: false };
  let pendingAuthRequest: {
    origin: 'favourite' | 'rating';
    continuationToken: string;
    intent:
      | { action: 'favourite'; placeId: string; placeName: string }
      | {
          action: 'rating';
          placeId: string;
          placeName: string;
          overallRating: number;
        };
  } | null = null;
  const hasSessionCookie = cookies
    .getAll()
    .some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'));

  if (locals.supabase && hasSessionCookie) {
    try {
      const session = await getMemberSession(locals.supabase);
      signedIn = session.status === 'member';
      if (session.status === 'orphaned') {
        await clearRequestAuthSession(locals.supabase, cookies);
      }
    } catch (error) {
      if (error instanceof AuthenticationExpiredError) {
        await clearRequestAuthSession(locals.supabase, cookies);
      }
      signedIn = false;
    }
  }

  if (locals.supabase && signedIn && url.searchParams.get('pendingResult') === 'retryable') {
    const continuationToken = url.searchParams.get('pendingIntent');
    if (continuationToken && authPendingIntentTokenPattern.test(continuationToken)) {
      const completion = await completePendingAuthIntent(
        locals.supabase,
        continuationToken,
        locals.requestId
      );
      if (completion.status !== 'retryable') {
        redirect(303, resolvedPendingIntentUrl(url, completion));
      }
    } else {
      redirect(303, resolvedPendingIntentUrl(url, { status: 'unavailable' }));
    }
  }

  if (locals.supabase && !signedIn) {
    const resolution = getMemberAuthConfig({ ...env, ...privateEnv });
    const configured = await resolveConfiguredMemberProviders(locals.supabase, resolution);
    if (configured) providers = configured;

    const continuationToken = url.searchParams.get('pendingIntent');
    if (continuationToken && authPendingIntentTokenPattern.test(continuationToken)) {
      try {
        const { data } = await locals.supabase.rpc('get_auth_pending_intent', {
          pending_token: continuationToken,
          requested_locale: lang
        });
        const pending = data?.[0];
        if (pending?.action === 'favourite') {
          pendingAuthRequest = {
            origin: 'favourite',
            continuationToken,
            intent: {
              action: 'favourite',
              placeId: pending.place_id,
              placeName: pending.place_name
            }
          };
        } else if (
          pending?.action === 'rating' &&
          pending.overall_rating !== null &&
          pending.overall_rating >= 1 &&
          pending.overall_rating <= 5
        ) {
          pendingAuthRequest = {
            origin: 'rating',
            continuationToken,
            intent: {
              action: 'rating',
              placeId: pending.place_id,
              placeName: pending.place_name,
              overallRating: pending.overall_rating
            }
          };
        }
      } catch {
        pendingAuthRequest = null;
      }
    }
  }

  const [weeklyRhythm, achievementStatusResult] =
    locals.supabase && signedIn
      ? await Promise.all([
          getWeeklyRhythm(locals.supabase),
          getMyAchievementStatus(locals.supabase as unknown as AchievementRpcClient)
        ])
      : [null, null];
  const achievementStatus =
    achievementStatusResult?.status === 'success'
      ? achievementStatusResult.value
      : { enabled: false, hasUnread: false };

  return {
    lang,
    copy: locals.copy,
    ...(providers.email || providers.facebook ? { providers } : {}),
    ...(pendingAuthRequest ? { pendingAuthRequest } : {}),
    ...(signedIn
      ? {
          signedIn: true as const,
          weeklyRhythm,
          achievementStatus
        }
      : {})
  };
};

function resolvedPendingIntentUrl(
  source: URL,
  completion:
    | {
        status: 'completed';
        action: 'favourite';
        placeId: string;
        completionStatus: string;
        recognition: {
          firstTimeForPlace: boolean;
          activatedCurrentWeek: boolean;
          currentWeek: { startsOn: string; endsOn: string; active: boolean };
        };
      }
    | { status: 'completed'; action: 'rating'; completionStatus: string }
    | { status: 'unavailable' }
): string {
  const target = new URL(source);
  target.searchParams.delete('pendingIntent');
  target.searchParams.delete('pendingAction');
  target.searchParams.set(
    'pendingResult',
    completion.status === 'completed' ? completion.completionStatus : 'unavailable'
  );
  if (completion.status === 'completed') {
    target.searchParams.set('pendingAction', completion.action);
    if (completion.action === 'favourite') {
      target.searchParams.set('pendingPlaceId', completion.placeId);
      target.searchParams.set(
        'pendingFirstTimeForPlace',
        completion.recognition.firstTimeForPlace ? '1' : '0'
      );
      target.searchParams.set(
        'pendingActivatedCurrentWeek',
        completion.recognition.activatedCurrentWeek ? '1' : '0'
      );
      target.searchParams.set(
        'pendingCurrentWeekStartsOn',
        completion.recognition.currentWeek.startsOn
      );
      target.searchParams.set(
        'pendingCurrentWeekEndsOn',
        completion.recognition.currentWeek.endsOn
      );
      target.searchParams.set(
        'pendingCurrentWeekActive',
        completion.recognition.currentWeek.active ? '1' : '0'
      );
    }
  }
  target.searchParams.set('pendingRetryResolved', '1');
  return `${target.pathname}${target.search}${target.hash}`;
}
