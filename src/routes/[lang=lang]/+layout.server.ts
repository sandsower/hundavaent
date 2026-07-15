import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

import { catalogues, parseLocale } from '$i18n';
import { clearRequestAuthSession } from '$server/auth/callback';
import { getMemberAuthConfig } from '$server/auth/member';
import { resolveConfiguredMemberProviders } from '$server/auth/provider-policy';
import { AuthenticationExpiredError, getMemberSession } from '$server/auth/session';

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

  if (locals.supabase && !signedIn) {
    const resolution = getMemberAuthConfig({ ...env, ...privateEnv });
    const configured = await resolveConfiguredMemberProviders(locals.supabase, resolution);
    if (configured) providers = configured;

    const continuationToken = url.searchParams.get('pendingIntent');
    if (continuationToken) {
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

  return {
    lang,
    copy: catalogues[lang],
    ...(providers.email || providers.facebook ? { providers } : {}),
    ...(pendingAuthRequest ? { pendingAuthRequest } : {}),
    ...(signedIn ? { signedIn: true as const } : {})
  };
};
