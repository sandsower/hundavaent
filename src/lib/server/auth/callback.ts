import { redirect, type Cookies, type RequestHandler } from '@sveltejs/kit';

import { parseLocale } from '$i18n';
import type { MemberAuthConfigResolution, MemberProvider } from '$server/auth/member';
import type { MemberProviderPolicyResolution } from '$server/auth/provider-policy';
import { normalizeMemberReturnTo, normalizeModerationReturnTo } from '$server/auth/return-to';
import type { RequestSupabaseClient } from '$server/db/clients';

export interface AuthCallbackDependencies {
  resolveMemberAuthConfig(): MemberAuthConfigResolution;
  resolveMemberProviderPolicy?: (
    client: RequestSupabaseClient
  ) => Promise<MemberProviderPolicyResolution>;
  createMemberActivationProof?: (userId: string, requestId: string) => Promise<string | null>;
}

export interface SessionCleanupOutcome {
  providerSignOut: 'succeeded' | 'failed' | 'not_attempted';
  expiredCookieCount: number;
}

export function createAuthCallback(dependencies: AuthCallbackDependencies): RequestHandler {
  return async ({ cookies, locals, params, url }) => {
    const lang = parseLocale(params.lang);
    const isMemberFlow = url.searchParams.get('flow') === 'member';
    const returnTo = isMemberFlow
      ? normalizeMemberReturnTo(url.searchParams.get('returnTo'), lang)
      : normalizeModerationReturnTo(url.searchParams.get('returnTo'), lang);
    const code = url.searchParams.get('code');
    const providerError = url.searchParams.get('error');
    const initialMemberProvider = isMemberFlow
      ? enabledMemberProvider(dependencies.resolveMemberAuthConfig())
      : null;

    if (isMemberFlow && !initialMemberProvider) {
      await clearRequestAuthSession(locals.supabase, cookies);
      redirectToRecovery(lang, returnTo, true, 'unavailable');
    }

    if (providerError) {
      if (isMemberFlow) {
        await clearRequestAuthSession(locals.supabase, cookies);
      }

      redirectToRecovery(
        lang,
        returnTo,
        isMemberFlow,
        isMemberFlow && initialMemberProvider === 'email'
          ? 'link_invalid'
          : providerError === 'access_denied'
            ? 'denied'
            : 'provider_failed'
      );
    }

    if (!code || !locals.supabase) {
      if (isMemberFlow) {
        await clearRequestAuthSession(locals.supabase, cookies);
      }

      redirectToRecovery(
        lang,
        returnTo,
        isMemberFlow,
        !locals.supabase ? 'unavailable' : 'link_invalid'
      );
    }

    const initialProviderPolicy = isMemberFlow
      ? await resolveProviderPolicy(dependencies, locals.supabase)
      : null;

    if (
      isMemberFlow &&
      (initialProviderPolicy?.status !== 'ready' ||
        initialProviderPolicy.policy.provider !== initialMemberProvider)
    ) {
      await clearRequestAuthSession(locals.supabase, cookies);
      redirectToRecovery(lang, returnTo, true, 'unavailable');
    }
    const initialProviderPolicyVersion =
      initialProviderPolicy?.status === 'ready' ? initialProviderPolicy.policy.version : null;

    let exchangeError: unknown;

    try {
      ({ error: exchangeError } = await locals.supabase.auth.exchangeCodeForSession(code));
    } catch {
      if (isMemberFlow) {
        await clearRequestAuthSession(locals.supabase, cookies);
      }
      redirectToRecovery(lang, returnTo, isMemberFlow, 'unavailable');
    }

    if (exchangeError) {
      if (isMemberFlow) {
        await clearRequestAuthSession(locals.supabase, cookies);
      }
      redirectToRecovery(lang, returnTo, isMemberFlow, 'link_invalid');
    }

    if (isMemberFlow) {
      const currentMemberProvider = enabledMemberProvider(dependencies.resolveMemberAuthConfig());
      const currentProviderPolicy = await resolveProviderPolicy(dependencies, locals.supabase);

      if (
        !currentMemberProvider ||
        currentMemberProvider !== initialMemberProvider ||
        currentProviderPolicy.status !== 'ready' ||
        currentProviderPolicy.policy.provider !== currentMemberProvider ||
        currentProviderPolicy.policy.version !== initialProviderPolicyVersion
      ) {
        await clearRequestAuthSession(locals.supabase, cookies);
        redirectToRecovery(lang, returnTo, true, 'unavailable');
      }

      let userResult: Awaited<ReturnType<typeof locals.supabase.auth.getUser>>;

      try {
        userResult = await locals.supabase.auth.getUser();
      } catch {
        await clearRequestAuthSession(locals.supabase, cookies);
        redirectToRecovery(lang, returnTo, true, 'unavailable');
      }

      if (
        userResult.error ||
        !userResult.data.user ||
        !hasOnlyExpectedIdentity(userResult.data.user.identities, currentMemberProvider)
      ) {
        await clearRequestAuthSession(locals.supabase, cookies);
        redirectToRecovery(lang, returnTo, true, 'unavailable');
      }

      let activationProof: string | null = null;

      try {
        activationProof = dependencies.createMemberActivationProof
          ? await dependencies.createMemberActivationProof(
              userResult.data.user.id,
              locals.requestId
            )
          : null;
      } catch {
        await clearRequestAuthSession(locals.supabase, cookies);
        redirectToRecovery(lang, returnTo, true, 'unavailable');
      }

      if (!activationProof) {
        await clearRequestAuthSession(locals.supabase, cookies);
        redirectToRecovery(lang, returnTo, true, 'unavailable');
      }

      let activationError: unknown;

      try {
        ({ error: activationError } = await locals.supabase.rpc('activate_current_member', {
          activation_proof: activationProof,
          activation_request_id: locals.requestId
        }));
      } catch {
        await clearRequestAuthSession(locals.supabase, cookies);
        redirectToRecovery(lang, returnTo, true, 'unavailable');
      }

      if (activationError) {
        await clearRequestAuthSession(locals.supabase, cookies);
        redirectToRecovery(lang, returnTo, true, 'unavailable');
      }
    }

    redirect(303, returnTo);
  };
}

async function resolveProviderPolicy(
  dependencies: AuthCallbackDependencies,
  client: RequestSupabaseClient
): Promise<MemberProviderPolicyResolution> {
  return dependencies.resolveMemberProviderPolicy
    ? dependencies.resolveMemberProviderPolicy(client)
    : { status: 'unavailable' };
}

function enabledMemberProvider(resolution: MemberAuthConfigResolution): MemberProvider | null {
  if (resolution.status === 'unavailable') return null;

  const { emailEnabled, facebookEnabled } = resolution.config;

  if (emailEnabled === facebookEnabled) return null;
  return emailEnabled ? 'email' : 'facebook';
}

function hasOnlyExpectedIdentity(
  identities: Array<{ provider?: string }> | undefined,
  expectedProvider: MemberProvider
): boolean {
  return identities?.length === 1 && identities[0]?.provider === expectedProvider;
}

export async function clearRequestAuthSession(
  client: RequestSupabaseClient | null,
  cookies: Pick<Cookies, 'delete' | 'getAll'>
): Promise<SessionCleanupOutcome> {
  const authCookieNames = cookies
    .getAll()
    .map(({ name }) => name)
    .filter(isSupabaseAuthCookieName);
  let providerSignOut: SessionCleanupOutcome['providerSignOut'] = 'not_attempted';

  if (client) {
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      providerSignOut = error ? 'failed' : 'succeeded';
    } catch {
      providerSignOut = 'failed';
    }
  }

  for (const name of authCookieNames) {
    cookies.delete(name, { path: '/' });
  }

  return { providerSignOut, expiredCookieCount: authCookieNames.length };
}

function isSupabaseAuthCookieName(name: string): boolean {
  return name.startsWith('sb-') && name.includes('-auth-token');
}

function redirectToRecovery(
  lang: 'is' | 'en',
  returnTo: string,
  memberFlow: boolean,
  authStatus: string
): never {
  if (!memberFlow) {
    redirect(303, `/${lang}/moderation/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const accountUrl = new URL(`/${lang}/account`, 'https://hundavaent.local');
  accountUrl.searchParams.set('returnTo', returnTo);
  accountUrl.searchParams.set('authStatus', authStatus);
  redirect(303, `${accountUrl.pathname}${accountUrl.search}`);
}
