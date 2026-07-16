import type { MemberAuthConfigResolution, MemberProvider } from './member';
import type { RequestSupabaseClient } from '$server/db/clients';

export const supportedMemberProviderPolicyVersion = 'member-linked-providers-v2';

export interface MemberProviderPolicy {
  emailEnabled: boolean;
  facebookEnabled: boolean;
  automaticLinkingVerifiedEmail: boolean;
  version: string;
}

export type MemberProviderPolicyResolution =
  { status: 'ready'; policy: MemberProviderPolicy } | { status: 'unavailable' };

export async function resolveMemberProviderPolicy(
  client: RequestSupabaseClient
): Promise<MemberProviderPolicyResolution> {
  try {
    const { data, error } = await client.rpc('get_member_provider_policy');
    const row = data?.[0];

    if (
      error ||
      data.length !== 1 ||
      !row ||
      row.email_enabled !== true ||
      row.facebook_enabled !== true ||
      row.automatic_linking_verified_email !== true ||
      row.policy_version !== supportedMemberProviderPolicyVersion
    ) {
      return { status: 'unavailable' };
    }

    return {
      status: 'ready',
      policy: {
        emailEnabled: row.email_enabled,
        facebookEnabled: row.facebook_enabled,
        automaticLinkingVerifiedEmail: row.automatic_linking_verified_email,
        version: row.policy_version
      }
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function resolveConfiguredMemberProviders(
  client: RequestSupabaseClient,
  configResolution: MemberAuthConfigResolution
): Promise<{ email: boolean; facebook: boolean } | null> {
  if (configResolution.status !== 'ready') return null;

  const { emailEnabled, facebookEnabled } = configResolution.config;

  const policyResolution = await resolveMemberProviderPolicy(client);
  if (policyResolution.status !== 'ready') return null;

  return {
    email: emailEnabled && policyResolution.policy.emailEnabled,
    facebook: facebookEnabled && policyResolution.policy.facebookEnabled
  };
}

export async function resolveConfiguredMemberProvider(
  client: RequestSupabaseClient,
  configResolution: MemberAuthConfigResolution
): Promise<Exclude<MemberProvider, 'unknown'> | null> {
  const providers = await resolveConfiguredMemberProviders(client, configResolution);
  if (!providers || providers.email === providers.facebook) return null;
  return providers.email ? 'email' : 'facebook';
}
