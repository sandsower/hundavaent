import { expect, test, type APIRequestContext } from '@playwright/test';
import type { CookieOptions } from '@supabase/ssr';

import { createAuthCallback } from '../../src/lib/server/auth/callback';
import {
  createRequestSupabaseClient,
  type RequestSupabaseClient
} from '../../src/lib/server/db/clients';
import type { MemberAuthConfigResolution } from '../../src/lib/server/auth/member';
import type { MemberProviderPolicyResolution } from '../../src/lib/server/auth/provider-policy';
import { createMemberActivationProof } from '../../src/lib/server/auth/member-activation-proof';
import {
  getLocalMemberIdentityState,
  getLocalSupabaseStatus,
  localMemberActivationSecret,
  waitForLocalMagicLink
} from './support/local-supabase';

const appOrigin = `http://127.0.0.1:${process.env.HUNDAVAENT_E2E_APP_PORT ?? '4173'}`;

const emailConfig: MemberAuthConfigResolution = {
  status: 'ready',
  config: {
    appOrigin,
    emailEnabled: true,
    facebookEnabled: false
  }
};

const linkedProviderPolicy = (): MemberProviderPolicyResolution => ({
  status: 'ready',
  policy: {
    emailEnabled: true,
    facebookEnabled: true,
    automaticLinkingVerifiedEmail: true,
    version: 'member-linked-providers-v2'
  }
});

class RequestCookieJar {
  readonly #cookies = new Map<string, { value: string; options: CookieOptions }>();

  getAll(): Array<{ name: string; value: string }> {
    return [...this.#cookies].map(([name, cookie]) => ({ name, value: cookie.value }));
  }

  set(name: string, value: string, options: CookieOptions): void {
    if (options.maxAge === 0 || (options.expires && options.expires.getTime() <= Date.now())) {
      this.#cookies.delete(name);
      return;
    }

    this.#cookies.set(name, { value, options });
  }

  delete(name: string): void {
    this.#cookies.delete(name);
  }

  authCookieNames(): string[] {
    return this.getAll()
      .map(({ name }) => name)
      .filter((name) => name.startsWith('sb-') && name.includes('-auth-token'));
  }

  header(): string {
    return this.getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ');
  }
}

async function issueRealMagicLink(
  callbackOrigin = appOrigin,
  existingEmail?: string
): Promise<{
  callbackUrl: URL;
  client: RequestSupabaseClient;
  email: string;
  jar: RequestCookieJar;
}> {
  const status = getLocalSupabaseStatus();
  const jar = new RequestCookieJar();
  const client = createRequestSupabaseClient(jar, {
    url: status.apiUrl,
    publishableKey: status.publishableKey
  });
  const email = existingEmail ?? `callback-boundary-${Date.now()}-${Math.random()}@example.invalid`;
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${callbackOrigin}/en/auth/callback?flow=member&method=email&returnTo=%2Fen`,
      shouldCreateUser: true
    }
  });

  expect(error).toBeNull();
  const magicLink = await waitForLocalMagicLink(email);

  return { callbackUrl: new URL(magicLink), client, email, jar };
}

function callbackEvent(callbackUrl: URL, client: RequestSupabaseClient, jar: RequestCookieJar) {
  return {
    cookies: jar,
    locals: { requestId: `request-${Date.now()}`, supabase: client },
    params: { lang: 'en' },
    url: callbackUrl
  };
}

async function expectAnonymousAccount(
  client: RequestSupabaseClient,
  email: string,
  jar: RequestCookieJar,
  request: APIRequestContext
): Promise<void> {
  const { data } = await client.auth.getUser();
  expect(data.user).toBeNull();
  expect(jar.authCookieNames()).toEqual([]);

  const response = await request.get('/en/account', {
    headers: jar.header() ? { cookie: jar.header() } : undefined
  });
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).not.toContain(email);
  expect(html).toContain('Welcome to Hundavænt');
}

test.describe('Member callback identity boundary', () => {
  const unavailableCases = [
    {
      name: 'email disabled',
      resolution: {
        status: 'ready',
        config: {
          appOrigin,
          emailEnabled: false,
          facebookEnabled: false
        }
      } satisfies MemberAuthConfigResolution,
      providerPolicy: linkedProviderPolicy()
    },
    {
      name: 'provider policy unavailable',
      resolution: {
        status: 'unavailable',
        reason: 'missing_app_origin'
      } satisfies MemberAuthConfigResolution,
      providerPolicy: { status: 'unavailable' } satisfies MemberProviderPolicyResolution
    }
  ];

  for (const testCase of unavailableCases) {
    test(`a real email link stays anonymous when ${testCase.name} before consumption`, async ({
      request
    }) => {
      const { callbackUrl, client, email, jar } = await issueRealMagicLink();
      const callback = createAuthCallback({
        resolveMemberAuthConfig: () => testCase.resolution,
        resolveMemberProviderPolicy: async () => testCase.providerPolicy
      });

      await expect(
        callback(callbackEvent(callbackUrl, client, jar) as never)
      ).rejects.toMatchObject({
        status: 303,
        location: '/en?auth=open&authStatus=unavailable'
      });
      await expectAnonymousAccount(client, email, jar, request);
    });
  }

  test('a tampered method query cannot replace the actual server-returned email identity', async ({
    request
  }) => {
    const { callbackUrl, client, email, jar } = await issueRealMagicLink();
    callbackUrl.searchParams.set('method', 'facebook');
    const callback = createAuthCallback({
      resolveMemberAuthConfig: () => emailConfig,
      resolveMemberProviderPolicy: async () => linkedProviderPolicy(),
      createMemberActivationProof: (userId, requestId) =>
        createMemberActivationProof(localMemberActivationSecret, userId, requestId)
    });

    await expect(callback(callbackEvent(callbackUrl, client, jar) as never)).rejects.toMatchObject({
      status: 303,
      location: '/en?auth=open&authStatus=unavailable'
    });
    await expectAnonymousAccount(client, email, jar, request);

    callbackUrl.searchParams.set('method', 'email');
    await expect(callback(callbackEvent(callbackUrl, client, jar) as never)).rejects.toMatchObject({
      status: 303,
      location: '/en?authResult=success&authMethod=email'
    });
    const { data, error } = await client.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.identities?.map((identity) => identity.provider)).toEqual(['email']);
    await client.auth.signOut({ scope: 'local' });
  });

  test('a policy-rejected token remains usable and creates only one Member', async () => {
    const initial = await issueRealMagicLink();
    const requestedOnly = await getLocalMemberIdentityState(initial.email);

    expect(requestedOnly).toMatchObject({
      identityProviders: ['email'],
      memberAccountCount: 0,
      memberRoleCount: 0
    });

    const matchingCallback = createAuthCallback({
      resolveMemberAuthConfig: () => emailConfig,
      resolveMemberProviderPolicy: async () => linkedProviderPolicy(),
      createMemberActivationProof: (userId, requestId) =>
        createMemberActivationProof(localMemberActivationSecret, userId, requestId)
    });

    const rejectingCallback = createAuthCallback({
      resolveMemberAuthConfig: () => emailConfig,
      resolveMemberProviderPolicy: async () => ({ status: 'unavailable' })
    });

    await expect(
      rejectingCallback(callbackEvent(initial.callbackUrl, initial.client, initial.jar) as never)
    ).rejects.toMatchObject({ status: 303, location: '/en?auth=open&authStatus=unavailable' });

    expect(await getLocalMemberIdentityState(initial.email)).toEqual(requestedOnly);

    await expect(
      matchingCallback(callbackEvent(initial.callbackUrl, initial.client, initial.jar) as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en?authResult=success&authMethod=email'
    });

    const established = await getLocalMemberIdentityState(initial.email);

    expect(established).toMatchObject({
      identityProviders: ['email'],
      memberAccountCount: 1,
      memberRoleCount: 1
    });

    // Local GoTrue enforces a one-second resend interval for the same address.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const { callbackUrl, client, email, jar } = await issueRealMagicLink(appOrigin, initial.email);
    await expect(
      matchingCallback(callbackEvent(callbackUrl, client, jar) as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en?authResult=success&authMethod=email'
    });

    const after = await getLocalMemberIdentityState(email);
    expect(after).toEqual(established);
    const { data, error } = await client.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.id).toBe(established.id);
    expect(data.user?.identities?.map((identity) => identity.provider)).toEqual(['email']);
    await client.auth.signOut({ scope: 'local' });
  });

  for (const cleanupMode of ['rejects', 'returns an error'] as const) {
    test(`real SSR cookies are expired when provider cleanup ${cleanupMode}`, async ({
      request
    }) => {
      const { callbackUrl, client: realClient, email, jar } = await issueRealMagicLink();
      const auth = {
        verifyOtp: realClient.auth.verifyOtp.bind(realClient.auth),
        getUser: realClient.auth.getUser.bind(realClient.auth),
        signOut:
          cleanupMode === 'rejects'
            ? async () => Promise.reject(new Error('forced cleanup rejection'))
            : async () => ({ error: { message: 'forced cleanup error' } })
      };
      const failingCleanupClient = {
        auth,
        rpc: async () => ({ data: null, error: { message: 'forced audit failure' } })
      } as unknown as RequestSupabaseClient;
      const callback = createAuthCallback({
        resolveMemberAuthConfig: () => emailConfig,
        resolveMemberProviderPolicy: async () => linkedProviderPolicy(),
        createMemberActivationProof: (userId, requestId) =>
          createMemberActivationProof(localMemberActivationSecret, userId, requestId)
      });

      await expect(
        callback(callbackEvent(callbackUrl, failingCleanupClient, jar) as never)
      ).rejects.toMatchObject({
        status: 303,
        location: '/en?auth=open&authStatus=unavailable'
      });

      const anonymousClient = createRequestSupabaseClient(jar, {
        url: getLocalSupabaseStatus().apiUrl,
        publishableKey: getLocalSupabaseStatus().publishableKey
      });
      await expectAnonymousAccount(anonymousClient, email, jar, request);
    });
  }
});
