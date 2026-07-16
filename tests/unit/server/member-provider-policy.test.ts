import { describe, expect, it } from 'vitest';

import {
  resolveConfiguredMemberProviders,
  resolveMemberProviderPolicy,
  supportedMemberProviderPolicyVersion
} from '../../../src/lib/server/auth/provider-policy';

describe('Member provider policy', () => {
  it('accepts the approved linked-provider tenant policy', async () => {
    const client = {
      rpc: async () => ({
        data: [
          {
            email_enabled: true,
            facebook_enabled: true,
            automatic_linking_verified_email: true,
            policy_version: supportedMemberProviderPolicyVersion
          }
        ],
        error: null
      })
    };

    await expect(resolveMemberProviderPolicy(client as never)).resolves.toEqual({
      status: 'ready',
      policy: {
        emailEnabled: true,
        facebookEnabled: true,
        automaticLinkingVerifiedEmail: true,
        version: supportedMemberProviderPolicyVersion
      }
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
    {
      data: [
        {
          email_enabled: true,
          facebook_enabled: true,
          automatic_linking_verified_email: false,
          policy_version: supportedMemberProviderPolicyVersion
        }
      ]
    },
    {
      data: [
        {
          email_enabled: true,
          facebook_enabled: true,
          automatic_linking_verified_email: true,
          policy_version: 'member-linked-providers-v1-stale'
        }
      ]
    }
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

  it('allows each configured provider only when it is approved by the persistent policy', async () => {
    const emailPolicyClient = {
      rpc: async () => ({
        data: [
          {
            email_enabled: true,
            facebook_enabled: true,
            automatic_linking_verified_email: true,
            policy_version: supportedMemberProviderPolicyVersion
          }
        ],
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
      resolveConfiguredMemberProviders(emailPolicyClient as never, emailConfig)
    ).resolves.toEqual({ email: true, facebook: false });
    await expect(
      resolveConfiguredMemberProviders(emailPolicyClient as never, facebookConfig)
    ).resolves.toEqual({ email: false, facebook: true });
  });
});
