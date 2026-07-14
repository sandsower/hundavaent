import type { MemberAuthConfigResolution, MemberProvider } from './member';
import type { RequestSupabaseClient } from '$server/db/clients';

export const supportedMemberProviderPolicyVersion = 'member-single-provider-v1';
export const supportedMemberProviderPolicy = {
  provider: 'email',
  version: supportedMemberProviderPolicyVersion
} as const;

export interface MemberProviderPolicy {
  provider: Exclude<MemberProvider, 'unknown'>;
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
      row.provider !== supportedMemberProviderPolicy.provider ||
      row.policy_version !== supportedMemberProviderPolicyVersion
    ) {
      return { status: 'unavailable' };
    }

    return {
      status: 'ready',
      policy: { provider: row.provider, version: row.policy_version }
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function resolveConfiguredMemberProvider(
  client: RequestSupabaseClient,
  configResolution: MemberAuthConfigResolution
): Promise<Exclude<MemberProvider, 'unknown'> | null> {
  if (configResolution.status !== 'ready') return null;

  const { emailEnabled, facebookEnabled } = configResolution.config;

  if (emailEnabled === facebookEnabled) return null;

  const configuredProvider = emailEnabled ? 'email' : 'facebook';
  const policyResolution = await resolveMemberProviderPolicy(client);

  return policyResolution.status === 'ready' &&
    policyResolution.policy.provider === configuredProvider &&
    policyResolution.policy.version === supportedMemberProviderPolicyVersion
    ? configuredProvider
    : null;
}
