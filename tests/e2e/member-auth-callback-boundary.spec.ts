import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';
import type { CookieOptions } from '@supabase/ssr';

import { createAuthCallback } from '../../src/lib/server/auth/callback';
import {
  createRequestSupabaseClient,
  type RequestSupabaseClient
} from '../../src/lib/server/db/clients';
import type { MemberAuthConfigResolution } from '../../src/lib/server/auth/member';
import { createMemberActivationProof } from '../../src/lib/server/auth/member-activation-proof';
import {
  clearLocalEvaluationMailbox,
  getLocalAuthPersistenceCounts,
  getLocalMemberIdentityState,
  getLocalSupabaseStatus,
  localMemberActivationSecret,
  waitForLocalMagicLink
} from './support/local-supabase';

const appOrigin = `http://127.0.0.1:${process.env.HUNDAVAENT_E2E_APP_PORT ?? '4173'}`;
const providerPolicyOrigin = `http://127.0.0.1:${process.env.HUNDAVAENT_E2E_PROVIDER_PORT ?? '4175'}`;

const emailConfig: MemberAuthConfigResolution = {
  status: 'ready',
  config: {
    appOrigin,
    emailEnabled: true,
    facebookEnabled: false
  }
};

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
  const verification = await fetch(magicLink, { redirect: 'manual' });
  const location = verification.headers.get('location');

  expect(verification.status).toBeGreaterThanOrEqual(300);
  expect(verification.status).toBeLessThan(400);
  expect(location).toBeTruthy();

  return { callbackUrl: new URL(location!), client, email, jar };
}

async function openCallbackWithRequestCookies(
  browser: Browser,
  callbackUrl: URL,
  jar: RequestCookieJar
) {
  const context = await browser.newContext();
  await context.addCookies(
    jar.getAll().map(({ name, value }) => ({
      name,
      value,
      url: callbackUrl.origin
    }))
  );

  return { context, response: await context.request.get(callbackUrl.href, { maxRedirects: 0 }) };
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
      } satisfies MemberAuthConfigResolution
    },
    {
      name: 'provider conflict',
      resolution: {
        status: 'unavailable',
        reason: 'identity_linking_policy_required'
      } satisfies MemberAuthConfigResolution
    }
  ];

  for (const testCase of unavailableCases) {
    test(`a real email link stays anonymous when ${testCase.name} before consumption`, async ({
      request
    }) => {
      const { callbackUrl, client, email, jar } = await issueRealMagicLink();
      const callback = createAuthCallback({
        resolveMemberAuthConfig: () => testCase.resolution,
        resolveMemberProviderPolicy: async () => ({
          status: 'ready',
          policy: { provider: 'email', version: 'member-single-provider-v1' }
        })
      });

      await expect(
        callback(callbackEvent(callbackUrl, client, jar) as never)
      ).rejects.toMatchObject({
        status: 303,
        location: '/en/account?returnTo=%2Fen&authStatus=unavailable'
      });
      await expectAnonymousAccount(client, email, jar, request);
    });
  }

  test('a tampered method query cannot replace the actual server-returned email identity', async () => {
    const { callbackUrl, client, jar } = await issueRealMagicLink();
    callbackUrl.searchParams.set('method', 'facebook');
    const callback = createAuthCallback({
      resolveMemberAuthConfig: () => emailConfig,
      resolveMemberProviderPolicy: async () => ({
        status: 'ready',
        policy: { provider: 'email', version: 'member-single-provider-v1' }
      }),
      createMemberActivationProof: (userId, requestId) =>
        createMemberActivationProof(localMemberActivationSecret, userId, requestId)
    });

    await expect(callback(callbackEvent(callbackUrl, client, jar) as never)).rejects.toMatchObject({
      status: 303,
      location: '/en'
    });
    const { data, error } = await client.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.identities).toHaveLength(1);
    expect(data.user?.identities?.[0]?.provider).toBe('email');
    await client.auth.signOut({ scope: 'local' });
  });

  test('a Facebook-configured deployment cannot start Auth against the email tenant policy', async ({
    request
  }) => {
    const before = getLocalAuthPersistenceCounts();
    const response = await request.post(`${providerPolicyOrigin}/en/account?/facebook`, {
      form: { returnTo: '/en/places/action-policy-proof' },
      maxRedirects: 0
    });

    expect(response.ok()).toBe(true);
    const actionResult = (await response.json()) as {
      type: string;
      status: number;
      data: string;
    };
    expect(actionResult).toMatchObject({ type: 'failure', status: 503 });
    expect(actionResult.data).toContain('facebook');
    expect(actionResult.data).toContain('unavailable');
    expect(actionResult.data).toContain('/en/places/action-policy-proof');
    expect(getLocalAuthPersistenceCounts()).toEqual(before);
  });

  test('a policy-rejected callback expires HTTP cookies without consuming the code', async ({
    browser
  }) => {
    const initial = await issueRealMagicLink();
    const requestedOnly = await getLocalMemberIdentityState(initial.email);

    expect(requestedOnly).toMatchObject({
      identityProviders: ['email'],
      memberAccountCount: 0,
      memberRoleCount: 0
    });

    const matchingCallback = createAuthCallback({
      resolveMemberAuthConfig: () => emailConfig,
      resolveMemberProviderPolicy: async () => ({
        status: 'ready',
        policy: { provider: 'email', version: 'member-single-provider-v1' }
      }),
      createMemberActivationProof: (userId, requestId) =>
        createMemberActivationProof(localMemberActivationSecret, userId, requestId)
    });
    await expect(
      matchingCallback(callbackEvent(initial.callbackUrl, initial.client, initial.jar) as never)
    ).rejects.toMatchObject({ status: 303, location: '/en' });
    await initial.client.auth.signOut({ scope: 'local' });

    const established = await getLocalMemberIdentityState(initial.email);

    expect(established).toMatchObject({
      identityProviders: ['email'],
      memberAccountCount: 1,
      memberRoleCount: 1
    });

    await clearLocalEvaluationMailbox();
    // Local GoTrue enforces a one-second resend interval for the same address.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const { callbackUrl, client, email, jar } = await issueRealMagicLink(
      providerPolicyOrigin,
      initial.email
    );
    const beforeAttempt = await getLocalMemberIdentityState(email);
    const requestCookieNames = jar.authCookieNames();

    expect(beforeAttempt).toEqual(established);
    expect(requestCookieNames.length).toBeGreaterThan(0);

    const { context, response } = await openCallbackWithRequestCookies(browser, callbackUrl, jar);

    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toBe(
      '/en/account?returnTo=%2Fen&authStatus=unavailable'
    );
    const expiryHeaders = response
      .headersArray()
      .filter(({ name }) => name.toLowerCase() === 'set-cookie')
      .map(({ value }) => value);

    for (const cookieName of requestCookieNames) {
      expect(
        expiryHeaders.some(
          (header) =>
            header.startsWith(`${cookieName}=`) &&
            (/Max-Age=0/i.test(header) || /Expires=Thu, 01 Jan 1970/i.test(header))
        )
      ).toBe(true);
    }
    expect(
      (await context.cookies()).filter(({ name }) => requestCookieNames.includes(name))
    ).toEqual([]);

    const account = await context.request.get(`${providerPolicyOrigin}/en/account`);
    expect(account.ok()).toBe(true);
    const accountHtml = await account.text();
    expect(accountHtml).toContain('Welcome to Hundavænt');
    expect(accountHtml).not.toContain(email);
    await context.close();

    // The original verifier and one-time code remain usable because policy rejection happened
    // before exchange. Consuming them under the matching policy must return the same Member.
    await expect(
      matchingCallback(callbackEvent(callbackUrl, client, jar) as never)
    ).rejects.toMatchObject({ status: 303, location: '/en' });

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
        exchangeCodeForSession: realClient.auth.exchangeCodeForSession.bind(realClient.auth),
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
        resolveMemberProviderPolicy: async () => ({
          status: 'ready',
          policy: { provider: 'email', version: 'member-single-provider-v1' }
        }),
        createMemberActivationProof: (userId, requestId) =>
          createMemberActivationProof(localMemberActivationSecret, userId, requestId)
      });

      await expect(
        callback(callbackEvent(callbackUrl, failingCleanupClient, jar) as never)
      ).rejects.toMatchObject({
        status: 303,
        location: '/en/account?returnTo=%2Fen&authStatus=unavailable'
      });

      const anonymousClient = createRequestSupabaseClient(jar, {
        url: getLocalSupabaseStatus().apiUrl,
        publishableKey: getLocalSupabaseStatus().publishableKey
      });
      await expectAnonymousAccount(anonymousClient, email, jar, request);
    });
  }
});
