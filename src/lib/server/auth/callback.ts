import { redirect, type Cookies, type RequestHandler } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';

import { parseLocale } from '$i18n';
import type { MemberAuthConfigResolution, MemberProvider } from '$server/auth/member';
import type { MemberProviderPolicyResolution } from '$server/auth/provider-policy';
import {
  authPendingIntentTokenPattern,
  completePendingAuthIntent
} from '$server/auth/pending-intent';
import { normalizeMemberReturnTo, normalizeModerationReturnTo } from '$server/auth/return-to';
import type { RequestSupabaseClient } from '$server/db/clients';
import type { FavouriteRecognition } from '$server/member-activity/weekly-rhythm';

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

export { authPendingIntentTokenPattern } from '$server/auth/pending-intent';

export function createAuthCallback(dependencies: AuthCallbackDependencies): RequestHandler {
  return async ({ cookies, locals, params, url }) => {
    const lang = parseLocale(params.lang);
    const isMemberFlow = url.searchParams.get('flow') === 'member';
    const returnTo = isMemberFlow
      ? normalizeMemberReturnTo(url.searchParams.get('returnTo'), lang)
      : normalizeModerationReturnTo(url.searchParams.get('returnTo'), lang);
    const code = url.searchParams.get('code');
    const tokenHash = url.searchParams.get('token_hash');
    const otpType = url.searchParams.get('type');
    const pendingIntent = url.searchParams.get('pendingIntent');
    const providerError = url.searchParams.get('error');
    const requestedMethod = memberMethod(url.searchParams.get('method'));
    const initialConfig = dependencies.resolveMemberAuthConfig();
    const initialMemberProviders = isMemberFlow ? enabledMemberProviders(initialConfig) : null;

    if (
      isMemberFlow &&
      (!initialMemberProviders || !requestedMethod || !initialMemberProviders[requestedMethod])
    ) {
      await clearRequestAuthSession(locals.supabase, cookies);
      redirectToRecovery(lang, returnTo, true, 'unavailable', pendingIntent);
    }

    if (providerError) {
      if (isMemberFlow) {
        await clearRequestAuthSession(locals.supabase, cookies);
      }

      redirectToRecovery(
        lang,
        returnTo,
        isMemberFlow,
        isMemberFlow && requestedMethod === 'email'
          ? 'link_invalid'
          : providerError === 'access_denied'
            ? 'denied'
            : 'provider_failed',
        pendingIntent
      );
    }

    const hasEmailToken =
      tokenHash && otpType === 'email' && (!isMemberFlow || requestedMethod === 'email');
    if ((!code && !hasEmailToken) || !locals.supabase) {
      if (isMemberFlow) {
        await clearRequestAuthSession(locals.supabase, cookies);
      }

      redirectToRecovery(
        lang,
        returnTo,
        isMemberFlow,
        !locals.supabase ? 'unavailable' : 'link_invalid',
        pendingIntent
      );
    }

    const initialProviderPolicy = isMemberFlow
      ? await resolveProviderPolicy(dependencies, locals.supabase)
      : null;

    if (
      isMemberFlow &&
      (initialProviderPolicy?.status !== 'ready' ||
        !policyAllowsMethod(initialProviderPolicy, requestedMethod))
    ) {
      await clearRequestAuthSession(locals.supabase, cookies);
      redirectToRecovery(lang, returnTo, true, 'unavailable', pendingIntent);
    }
    const initialProviderPolicyVersion =
      initialProviderPolicy?.status === 'ready' ? initialProviderPolicy.policy.version : null;

    let exchangeError: unknown;

    try {
      if (hasEmailToken) {
        ({ error: exchangeError } = await locals.supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'email'
        }));
      } else {
        ({ error: exchangeError } = await locals.supabase.auth.exchangeCodeForSession(code!));
      }
    } catch {
      if (isMemberFlow) {
        await clearRequestAuthSession(locals.supabase, cookies);
      }
      redirectToRecovery(lang, returnTo, isMemberFlow, 'unavailable', pendingIntent);
    }

    if (exchangeError) {
      if (isMemberFlow) {
        await clearRequestAuthSession(locals.supabase, cookies);
      }
      redirectToRecovery(lang, returnTo, isMemberFlow, 'link_invalid', pendingIntent);
    }

    if (isMemberFlow) {
      const currentMemberProviders = enabledMemberProviders(dependencies.resolveMemberAuthConfig());
      const currentProviderPolicy = await resolveProviderPolicy(dependencies, locals.supabase);

      if (
        !currentMemberProviders ||
        !requestedMethod ||
        !currentMemberProviders[requestedMethod] ||
        currentProviderPolicy.status !== 'ready' ||
        !policyAllowsMethod(currentProviderPolicy, requestedMethod) ||
        currentProviderPolicy.policy.version !== initialProviderPolicyVersion
      ) {
        await clearRequestAuthSession(locals.supabase, cookies);
        redirectToRecovery(lang, returnTo, true, 'unavailable', pendingIntent);
      }

      let userResult: Awaited<ReturnType<typeof locals.supabase.auth.getUser>>;

      try {
        userResult = await locals.supabase.auth.getUser();
      } catch {
        await clearRequestAuthSession(locals.supabase, cookies);
        redirectToRecovery(lang, returnTo, true, 'unavailable', pendingIntent);
      }

      if (
        userResult.error ||
        !userResult.data.user ||
        !hasApprovedIdentities(userResult.data.user, requestedMethod)
      ) {
        await clearRequestAuthSession(locals.supabase, cookies);
        redirectToRecovery(lang, returnTo, true, 'unavailable', pendingIntent);
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
        redirectToRecovery(lang, returnTo, true, 'unavailable', pendingIntent);
      }

      if (!activationProof) {
        await clearRequestAuthSession(locals.supabase, cookies);
        redirectToRecovery(lang, returnTo, true, 'unavailable', pendingIntent);
      }

      let activationError: unknown;
      let pendingAction: string | null = null;
      let pendingResult: string | null = pendingIntent ? 'unavailable' : null;
      let retryPendingIntent: string | null = null;
      let pendingRecognition: FavouriteRecognition | null = null;

      try {
        ({ error: activationError } = await locals.supabase.rpc('activate_current_member', {
          activation_proof: activationProof,
          activation_request_id: locals.requestId
        }));
      } catch {
        await clearRequestAuthSession(locals.supabase, cookies);
        redirectToRecovery(lang, returnTo, true, 'unavailable', pendingIntent);
      }

      if (activationError) {
        await clearRequestAuthSession(locals.supabase, cookies);
        redirectToRecovery(lang, returnTo, true, 'unavailable', pendingIntent);
      }

      if (pendingIntent && authPendingIntentTokenPattern.test(pendingIntent)) {
        const completion = await completePendingAuthIntent(
          locals.supabase,
          pendingIntent,
          locals.requestId
        );
        if (completion.status === 'completed') {
          pendingAction = completion.action;
          pendingResult = completion.completionStatus;
          pendingRecognition = completion.action === 'favourite' ? completion.recognition : null;
        } else if (completion.status === 'retryable') {
          pendingResult = 'retryable';
          retryPendingIntent = pendingIntent;
        }
      }

      redirect(
        303,
        withAuthResult(returnTo, {
          authResult: 'success',
          authMethod: requestedMethod,
          pendingAction,
          pendingResult,
          pendingIntent: retryPendingIntent,
          pendingRecognition
        })
      );
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

function enabledMemberProviders(
  resolution: MemberAuthConfigResolution
): { email: boolean; facebook: boolean } | null {
  if (resolution.status === 'unavailable') return null;
  return {
    email: resolution.config.emailEnabled,
    facebook: resolution.config.facebookEnabled
  };
}

function memberMethod(value: string | null): Exclude<MemberProvider, 'unknown'> | null {
  return value === 'email' || value === 'facebook' ? value : null;
}

function policyAllowsMethod(
  resolution: MemberProviderPolicyResolution | null,
  method: Exclude<MemberProvider, 'unknown'> | null
): boolean {
  if (resolution?.status !== 'ready' || !method) return false;
  return method === 'email' ? resolution.policy.emailEnabled : resolution.policy.facebookEnabled;
}

function hasApprovedIdentities(user: User, expectedProvider: MemberProvider): boolean {
  const canonicalEmail = normalizeEmail(user.email);
  const identities = user.identities;
  return (
    canonicalEmail !== null &&
    identities !== undefined &&
    identities.length > 0 &&
    identities.some((identity) => identity.provider === expectedProvider) &&
    identities.every(
      (identity) =>
        (identity.provider === 'email' || identity.provider === 'facebook') &&
        normalizeEmail(identity.identity_data?.email) === canonicalEmail
    )
  );
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function withAuthResult(
  returnTo: string,
  result: {
    authResult: string;
    authMethod: string;
    pendingAction: string | null;
    pendingResult: string | null;
    pendingIntent: string | null;
    pendingRecognition: FavouriteRecognition | null;
  }
): string {
  const target = new URL(returnTo, 'https://hundavaent.local');
  target.searchParams.set('authResult', result.authResult);
  target.searchParams.set('authMethod', result.authMethod);
  if (result.pendingAction) target.searchParams.set('pendingAction', result.pendingAction);
  if (result.pendingResult) target.searchParams.set('pendingResult', result.pendingResult);
  if (result.pendingAction === 'favourite' && result.pendingRecognition) {
    target.searchParams.set(
      'pendingFirstTimeForPlace',
      result.pendingRecognition.firstTimeForPlace ? '1' : '0'
    );
    target.searchParams.set(
      'pendingActivatedCurrentWeek',
      result.pendingRecognition.activatedCurrentWeek ? '1' : '0'
    );
    target.searchParams.set(
      'pendingCurrentWeekStartsOn',
      result.pendingRecognition.currentWeek.startsOn
    );
    target.searchParams.set(
      'pendingCurrentWeekEndsOn',
      result.pendingRecognition.currentWeek.endsOn
    );
    target.searchParams.set(
      'pendingCurrentWeekActive',
      result.pendingRecognition.currentWeek.active ? '1' : '0'
    );
  }
  if (
    result.pendingResult === 'retryable' &&
    result.pendingIntent &&
    authPendingIntentTokenPattern.test(result.pendingIntent)
  ) {
    target.searchParams.set('pendingIntent', result.pendingIntent);
  }
  return `${target.pathname}${target.search}${target.hash}`;
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
  authStatus: string,
  pendingIntent?: string | null
): never {
  if (!memberFlow) {
    redirect(303, `/${lang}/moderation/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const recovery = new URL(returnTo, 'https://hundavaent.local');
  recovery.searchParams.set('auth', 'open');
  recovery.searchParams.set('authStatus', authStatus);
  if (pendingIntent && authPendingIntentTokenPattern.test(pendingIntent)) {
    recovery.searchParams.set('pendingIntent', pendingIntent);
  }
  redirect(303, `${recovery.pathname}${recovery.search}${recovery.hash}`);
}
