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
import { resolveConfiguredMemberProvider } from '$server/auth/provider-policy';
import { hasOptionalRole } from '$server/auth/role-capability';
import { isValidEmail, normalizeMemberReturnTo } from '$server/auth/return-to';

import type { Actions, PageServerLoad } from './$types';
import type { MemberAuthConfigResolution } from '$server/auth/member';

function authConfig(): MemberAuthConfigResolution {
  return getMemberAuthConfig({ ...publicEnv, ...privateEnv });
}

function configError(
  resolution: MemberAuthConfigResolution
): 'configuration_conflict' | 'unavailable' {
  return resolution.status === 'unavailable' &&
    resolution.reason === 'identity_linking_policy_required'
    ? 'configuration_conflict'
    : 'unavailable';
}

export function _createLoad(
  resolveAuthConfig: () => MemberAuthConfigResolution = authConfig
): PageServerLoad {
  return async ({ locals, params, url }) => {
    const lang = parseLocale(params.lang);
    const resolution = resolveAuthConfig();
    const config = resolution.status === 'ready' ? resolution.config : null;
    const returnTo = normalizeMemberReturnTo(url.searchParams.get('returnTo'), lang);
    const authStatus = url.searchParams.get('authStatus');
    const hasConfiguredProvider = Boolean(config?.emailEnabled || config?.facebookEnabled);
    const configurationStatus =
      resolution.status === 'unavailable'
        ? configError(resolution)
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

    const enabledProvider = await resolveConfiguredMemberProvider(locals.supabase, resolution);
    const providers = {
      email: enabledProvider === 'email',
      facebook: enabledProvider === 'facebook'
    };
    const resolvedConfigurationStatus =
      configurationStatus ?? (enabledProvider ? null : 'unavailable');

    let authResult: Awaited<ReturnType<typeof locals.supabase.auth.getUser>>;

    try {
      authResult = await locals.supabase.auth.getUser();
    } catch {
      return {
        member: null,
        returnTo,
        authStatus: 'unavailable',
        providers,
        canModerate: false
      };
    }

    const { data: authData, error: authError } = authResult;

    if (authError || !authData.user) {
      return {
        member: null,
        returnTo,
        authStatus:
          authError && authError.name !== 'AuthSessionMissingError'
            ? 'session_expired'
            : (authStatus ?? resolvedConfigurationStatus),
        providers,
        canModerate: false
      };
    }

    let accountResult: Awaited<
      ReturnType<typeof locals.supabase.rpc<'get_current_member_account'>>
    >;

    try {
      accountResult = await locals.supabase.rpc('get_current_member_account');
    } catch {
      return {
        member: null,
        returnTo,
        authStatus: 'unavailable',
        providers,
        canModerate: false
      };
    }

    const { data: accounts, error: accountError } = accountResult;

    if (accountError || !accounts?.[0]) {
      return {
        member: null,
        returnTo,
        authStatus: 'unavailable',
        providers: {
          email: config?.emailEnabled ?? false,
          facebook: config?.facebookEnabled ?? false
        },
        canModerate: false
      };
    }

    const canModerate = await hasOptionalRole(locals.supabase, 'moderator');

    return {
      member: {
        ...getPrivateMemberIdentity(authData.user),
        createdAt: accounts[0].created_at,
        deletionStatus: accounts[0].deletion_status,
        deletionRequestedAt: accounts[0].deletion_requested_at
      },
      returnTo,
      authStatus: null,
      providers,
      canModerate
    };
  };
}

export const load: PageServerLoad = _createLoad();

export function _createFacebookAction(
  resolveAuthConfig: () => MemberAuthConfigResolution = authConfig
): Actions['facebook'] {
  return async ({ locals, params, request }) => {
    const lang = parseLocale(params.lang);
    const formData = await request.formData();
    const returnTo = normalizeMemberReturnTo(formData.get('returnTo'), lang);
    const resolution = resolveAuthConfig();

    if (!locals.supabase || resolution.status === 'unavailable') {
      return fail(503, { action: 'facebook', error: configError(resolution), returnTo });
    }

    const { config } = resolution;

    if (!config.facebookEnabled) {
      return fail(503, { action: 'facebook', error: 'unavailable', returnTo });
    }

    if ((await resolveConfiguredMemberProvider(locals.supabase, resolution)) !== 'facebook') {
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
        error: configError(resolution),
        returnTo
      });
    }

    const { config } = resolution;

    if (!config.emailEnabled) {
      return fail(503, { action: 'email', email, error: 'unavailable', returnTo });
    }

    if ((await resolveConfiguredMemberProvider(locals.supabase, resolution)) !== 'email') {
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
