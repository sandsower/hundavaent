import type { User } from '@supabase/supabase-js';

import type { Locale } from '$i18n';
import type { RequestSupabaseClient } from '$server/db/clients';

export const deletionDisclosureVersion = 'member-deletion-v1';

export interface MemberAuthConfig {
  appOrigin: string;
  emailEnabled: boolean;
  facebookEnabled: boolean;
}

export type MemberAuthConfigUnavailableReason =
  'missing_app_origin' | 'unsafe_app_origin' | 'identity_linking_policy_required';

export type MemberAuthConfigResolution =
  | { status: 'ready'; config: MemberAuthConfig }
  | { status: 'unavailable'; reason: MemberAuthConfigUnavailableReason };

export type MemberProvider = 'email' | 'facebook' | 'unknown';

export interface PrivateMemberIdentity {
  email: string;
  provider: MemberProvider;
}

export type FacebookSignInResult = { status: 'redirect'; url: string } | { status: 'failed' };

export async function startFacebookSignIn(
  client: RequestSupabaseClient,
  callbackUrl: string
): Promise<FacebookSignInResult> {
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'facebook',
      options: { redirectTo: callbackUrl, scopes: 'email' }
    });

    return error || !data.url ? { status: 'failed' } : { status: 'redirect', url: data.url };
  } catch {
    return { status: 'failed' };
  }
}

export async function sendPasswordlessEmail(
  client: RequestSupabaseClient,
  email: string,
  callbackUrl: string
): Promise<'sent' | 'failed'> {
  try {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl, shouldCreateUser: true }
    });

    return error ? 'failed' : 'sent';
  } catch {
    return 'failed';
  }
}

export function getMemberAuthConfig(
  environment: Record<string, string | undefined>
): MemberAuthConfigResolution {
  const appUrl = environment.PUBLIC_APP_URL?.trim();

  if (!appUrl) return { status: 'unavailable', reason: 'missing_app_origin' };

  try {
    const parsed = new URL(appUrl);
    const localHttp =
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '::1');

    if (
      (parsed.protocol !== 'https:' && !localHttp) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      return { status: 'unavailable', reason: 'unsafe_app_origin' };
    }

    const config = {
      appOrigin: parsed.origin,
      emailEnabled: parseFeatureFlag(environment.AUTH_EMAIL_ENABLED, false),
      facebookEnabled: parseFeatureFlag(environment.AUTH_FACEBOOK_ENABLED, false)
    };

    if (config.emailEnabled && config.facebookEnabled) {
      return { status: 'unavailable', reason: 'identity_linking_policy_required' };
    }

    return { status: 'ready', config };
  } catch {
    return { status: 'unavailable', reason: 'unsafe_app_origin' };
  }
}

export function buildMemberCallbackUrl(
  config: MemberAuthConfig,
  locale: Locale,
  returnTo: string,
  method: 'email' | 'facebook'
): string {
  const callback = new URL(`/${locale}/auth/callback`, config.appOrigin);
  callback.searchParams.set('returnTo', returnTo);
  callback.searchParams.set('flow', 'member');
  callback.searchParams.set('method', method);
  return callback.toString();
}

export function getPrivateMemberIdentity(user: User): PrivateMemberIdentity {
  const provider = user.app_metadata?.provider;

  return {
    email: user.email ?? '',
    provider: provider === 'facebook' || provider === 'email' ? provider : 'unknown'
  };
}

function parseFeatureFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === '') return defaultValue;
  return value.trim().toLowerCase() === 'true';
}
