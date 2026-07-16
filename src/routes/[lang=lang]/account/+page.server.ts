import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { fail, redirect } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import { clearRequestAuthSession } from '$server/auth/callback';
import {
  buildMemberCallbackUrl,
  deletionDisclosureVersion,
  getMemberAuthConfig,
  getPrivateMemberIdentity,
  sendPasswordlessEmail,
  startFacebookSignIn
} from '$server/auth/member';
import { resolveConfiguredMemberProviders } from '$server/auth/provider-policy';
import { hasOptionalRole } from '$server/auth/role-capability';
import { isValidEmail, normalizeMemberReturnTo } from '$server/auth/return-to';
import { AuthenticationExpiredError, getMemberSession } from '$server/auth/session';

import type { Actions, PageServerLoad } from './$types';
import type { MemberAuthConfigResolution } from '$server/auth/member';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authConfig(): MemberAuthConfigResolution {
  return getMemberAuthConfig({ ...publicEnv, ...privateEnv });
}

function configError(): 'unavailable' {
  return 'unavailable';
}

export function _createLoad(
  resolveAuthConfig: () => MemberAuthConfigResolution = authConfig
): PageServerLoad {
  return async ({ cookies, locals, params, url }) => {
    const lang = parseLocale(params.lang);
    const resolution = resolveAuthConfig();
    const config = resolution.status === 'ready' ? resolution.config : null;
    const returnTo = normalizeMemberReturnTo(url.searchParams.get('returnTo'), lang);
    const authStatus = url.searchParams.get('authStatus');
    const hasConfiguredProvider = Boolean(config?.emailEnabled || config?.facebookEnabled);
    const configurationStatus =
      resolution.status === 'unavailable'
        ? configError()
        : hasConfiguredProvider
          ? null
          : 'unavailable';

    if (!locals.supabase) {
      return {
        member: null,
        returnTo,
        authStatus: authStatus ?? configurationStatus,
        providers: { email: false, facebook: false },
        canModerate: false
      };
    }

    const providers = (await resolveConfiguredMemberProviders(locals.supabase, resolution)) ?? {
      email: false,
      facebook: false
    };
    const resolvedConfigurationStatus =
      configurationStatus ?? (providers.email || providers.facebook ? null : 'unavailable');

    let session: Awaited<ReturnType<typeof getMemberSession>>;

    try {
      session = await getMemberSession(locals.supabase);
    } catch (error) {
      if (error instanceof AuthenticationExpiredError) {
        await clearRequestAuthSession(locals.supabase, cookies);
      }
      return {
        member: null,
        returnTo,
        authStatus: error instanceof AuthenticationExpiredError ? 'session_expired' : 'unavailable',
        providers,
        canModerate: false
      };
    }

    if (session.status === 'anonymous') {
      return {
        member: null,
        returnTo,
        authStatus: authStatus ?? resolvedConfigurationStatus,
        providers,
        canModerate: false
      };
    }

    if (session.status === 'orphaned') {
      await clearRequestAuthSession(locals.supabase, cookies);
      return {
        member: null,
        returnTo,
        authStatus: 'unavailable',
        providers,
        canModerate: false
      };
    }

    const canModerate = await hasOptionalRole(locals.supabase, 'moderator');

    return {
      member: {
        ...getPrivateMemberIdentity(session.user),
        createdAt: session.account.created_at,
        deletionStatus: session.account.deletion_status,
        deletionRequestedAt: session.account.deletion_requested_at
      },
      returnTo,
      authStatus: null,
      providers,
      canModerate
    };
  };
}

const loadAccount = _createLoad();

export const load: PageServerLoad = async (event) => {
  const result = await loadAccount(event);
  if (!result) return result;
  if (!result.member) {
    const destination = new URL(`/${parseLocale(event.params.lang)}`, 'https://hundavaent.local');
    destination.searchParams.set('auth', 'open');
    destination.searchParams.set('authReturnTo', result.returnTo);
    if (result.authStatus) destination.searchParams.set('authStatus', result.authStatus);
    if (
      event.url.searchParams.get('intentAction') === 'favourite' &&
      uuidPattern.test(event.url.searchParams.get('placeId') ?? '')
    ) {
      destination.searchParams.set('authIntent', 'favourite');
      destination.searchParams.set('authPlace', event.url.searchParams.get('placeId')!);
    }
    redirect(303, `${destination.pathname}${destination.search}${destination.hash}`);
  }
  return result;
};

export function _createFacebookAction(
  resolveAuthConfig: () => MemberAuthConfigResolution = authConfig
): Actions['facebook'] {
  return async ({ locals, params, request }) => {
    const lang = parseLocale(params.lang);
    const formData = await request.formData();
    const returnTo = normalizeMemberReturnTo(formData.get('returnTo'), lang);
    const resolution = resolveAuthConfig();

    if (!locals.supabase || resolution.status === 'unavailable') {
      return fail(503, { action: 'facebook', error: configError(), returnTo });
    }

    const { config } = resolution;

    if (!config.facebookEnabled) {
      return fail(503, { action: 'facebook', error: 'unavailable', returnTo });
    }

    if (!(await resolveConfiguredMemberProviders(locals.supabase, resolution))?.facebook) {
      return fail(503, { action: 'facebook', error: 'unavailable', returnTo });
    }

    const callbackUrl = buildMemberCallbackUrl(config, lang, returnTo, 'facebook');
    const result = await startFacebookSignIn(locals.supabase, callbackUrl);

    if (result.status === 'failed') {
      return fail(503, { action: 'facebook', error: 'provider_failed', returnTo });
    }

    redirect(303, result.url);
  };
}

export function _createEmailAction(
  resolveAuthConfig: () => MemberAuthConfigResolution = authConfig
): Actions['email'] {
  return async ({ locals, params, request }) => {
    const lang = parseLocale(params.lang);
    const formData = await request.formData();
    const email = String(formData.get('email') ?? '').trim();
    const returnTo = normalizeMemberReturnTo(formData.get('returnTo'), lang);
    const resolution = resolveAuthConfig();

    if (!email) {
      return fail(400, { action: 'email', email, error: 'email_required', returnTo });
    }

    if (!isValidEmail(email)) {
      return fail(400, { action: 'email', email, error: 'email_invalid', returnTo });
    }

    if (!locals.supabase || resolution.status === 'unavailable') {
      return fail(503, {
        action: 'email',
        email,
        error: configError(),
        returnTo
      });
    }

    const { config } = resolution;

    if (!config.emailEnabled) {
      return fail(503, { action: 'email', email, error: 'unavailable', returnTo });
    }

    if (!(await resolveConfiguredMemberProviders(locals.supabase, resolution))?.email) {
      return fail(503, { action: 'email', email, error: 'unavailable', returnTo });
    }

    const callbackUrl = buildMemberCallbackUrl(config, lang, returnTo, 'email');
    const result = await sendPasswordlessEmail(locals.supabase, email, callbackUrl);

    if (result === 'failed') {
      return fail(503, { action: 'email', email, error: 'provider_failed', returnTo });
    }

    return { action: 'email', email, success: 'link_sent', returnTo };
  };
}

export const actions: Actions = {
  facebook: _createFacebookAction(),
  email: _createEmailAction(),
  signOut: async ({ cookies, locals, params, request }) => {
    const lang = parseLocale(params.lang);
    const formData = await request.formData();
    const returnTo = normalizeMemberReturnTo(formData.get('returnTo'), lang);

    if (locals.supabase) {
      try {
        const { data, error } = await locals.supabase.auth.getUser();

        if (data.user && !error) {
          try {
            await locals.supabase.rpc('record_member_auth_event', {
              event_action: 'session.sign_out_requested',
              event_request_id: locals.requestId
            });
          } catch {
            // Audit availability must never prevent local logout.
          }
        }
      } catch {
        // Session lookup availability must never prevent local logout.
      }
    }

    await clearRequestAuthSession(locals.supabase, cookies);
    redirect(303, returnTo);
  },

  requestDeletion: async ({ locals, params }) => {
    const lang = parseLocale(params.lang);

    if (!locals.supabase) {
      return fail(503, { action: 'requestDeletion', error: 'unavailable' });
    }

    let authResult: Awaited<ReturnType<typeof locals.supabase.auth.getUser>>;

    try {
      authResult = await locals.supabase.auth.getUser();
    } catch {
      return fail(503, { action: 'requestDeletion', error: 'unavailable' });
    }

    const { data: authData, error: authError } = authResult;

    if (authError || !authData.user) {
      return fail(401, { action: 'requestDeletion', error: 'authentication_required' });
    }

    let deletionError: unknown;

    try {
      ({ error: deletionError } = await locals.supabase.rpc('begin_current_account_deletion', {
        command_disclosure_version: deletionDisclosureVersion,
        command_locale: lang,
        command_request_id: locals.requestId
      }));
    } catch {
      return fail(503, { action: 'requestDeletion', error: 'unavailable' });
    }

    if (deletionError) {
      return fail(503, { action: 'requestDeletion', error: 'unavailable' });
    }

    return { action: 'requestDeletion', success: 'deletion_requested' };
  }
};
