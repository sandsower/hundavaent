import { describe, expect, it } from 'vitest';

import {
  resolveConfiguredMemberProvider,
  resolveMemberProviderPolicy,
  supportedMemberProviderPolicyVersion
} from '../../../src/lib/server/auth/provider-policy';

describe('Member provider policy', () => {
  it('accepts the one supported persistent tenant policy', async () => {
    const client = {
      rpc: async () => ({
        data: [{ provider: 'email', policy_version: supportedMemberProviderPolicyVersion }],
        error: null
      })
    };

    await expect(resolveMemberProviderPolicy(client as never)).resolves.toEqual({
      status: 'ready',
      policy: { provider: 'email', version: supportedMemberProviderPolicyVersion }
    });
  });

  it.each([
    { data: [] },
    {
      data: [
        { provider: 'email', policy_version: supportedMemberProviderPolicyVersion },
        { provider: 'facebook', policy_version: supportedMemberProviderPolicyVersion }
      ]
    },
    { data: [{ provider: 'unknown', policy_version: supportedMemberProviderPolicyVersion }] },
    { data: [{ provider: 'facebook', policy_version: supportedMemberProviderPolicyVersion }] },
    { data: [{ provider: 'email', policy_version: 'member-single-provider-v2' }] }
  ])(
    'fails closed for a missing, ambiguous, unsupported, or stale policy: $data',
    async ({ data }) => {
      const client = { rpc: async () => ({ data, error: null }) };
      await expect(resolveMemberProviderPolicy(client as never)).resolves.toEqual({
        status: 'unavailable'
      });
    }
  );

  it('fails closed when the policy projection returns or throws an error', async () => {
    const returned = { rpc: async () => ({ data: [], error: { message: 'offline' } }) };
    const rejected = { rpc: async () => Promise.reject(new Error('offline')) };

    await expect(resolveMemberProviderPolicy(returned as never)).resolves.toEqual({
      status: 'unavailable'
    });
    await expect(resolveMemberProviderPolicy(rejected as never)).resolves.toEqual({
      status: 'unavailable'
    });
  });

  it('allows only the sole configured provider that matches the supported tuple', async () => {
    const emailPolicyClient = {
      rpc: async () => ({
        data: [{ provider: 'email', policy_version: supportedMemberProviderPolicyVersion }],
        error: null
      })
    };
    const emailConfig = {
      status: 'ready' as const,
      config: {
        appOrigin: 'https://hundavaent.example',
        emailEnabled: true,
        facebookEnabled: false
      }
    };
    const facebookConfig = {
      status: 'ready' as const,
      config: {
        appOrigin: 'https://hundavaent.example',
        emailEnabled: false,
        facebookEnabled: true
      }
    };

    await expect(
      resolveConfiguredMemberProvider(emailPolicyClient as never, emailConfig)
    ).resolves.toBe('email');
    await expect(
      resolveConfiguredMemberProvider(emailPolicyClient as never, facebookConfig)
    ).resolves.toBeNull();
  });
});
