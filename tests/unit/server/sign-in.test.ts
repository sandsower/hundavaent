import { describe, expect, it } from 'vitest';

import {
  isValidEmail,
  normalizeMemberReturnTo,
  normalizeModerationReturnTo
} from '$server/auth/return-to';
import {
  buildMemberCallbackUrl,
  getMemberAuthConfig,
  getPrivateMemberIdentity,
  sendPasswordlessEmail,
  startFacebookSignIn
} from '$server/auth/member';

describe('Moderator sign-in inputs', () => {
  it('preserves a local locale-matching moderation return path', () => {
    expect(normalizeModerationReturnTo('/en/moderation/places/new?draft=1', 'en')).toBe(
      '/en/moderation/places/new?draft=1'
    );
  });

  it.each([
    'https://attacker.example/en/moderation',
    '//attacker.example/en/moderation',
    '/is/moderation',
    '/en/directory',
    '/en/moderation-elsewhere'
  ])('rejects unsafe return path %s', (unsafeReturnTo) => {
    expect(normalizeModerationReturnTo(unsafeReturnTo, 'en')).toBe('/en/moderation');
  });

  it('accepts practical email addresses and rejects malformed values', () => {
    expect(isValidEmail('moderator@example.is')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('space @example.is')).toBe(false);
  });
});

describe('Member sign-in boundaries', () => {
  it('preserves a locale-matching Place and its discovery state', () => {
    expect(normalizeMemberReturnTo('/en/places/place-1?category=park#selected', 'en')).toBe(
      '/en/places/place-1?category=park#selected'
    );
  });

  it('preserves a known private account destination through sign-in', () => {
    expect(normalizeMemberReturnTo('/en/account/achievements', 'en')).toBe(
      '/en/account/achievements'
    );
    expect(normalizeMemberReturnTo('/en/account/roundup', 'en')).toBe('/en/account/roundup');
    expect(normalizeMemberReturnTo('/en/account/impact', 'en')).toBe('/en/account/impact');
  });

  it.each([
    'https://attacker.example/en',
    '//attacker.example/en',
    '/is/places/place-1',
    '/en/auth/callback?code=secret',
    '/en/account?returnTo=/en',
    '/en/account/',
    '/en/account/security',
    '/en/moderation/places/new'
  ])('rejects unsafe Member return path %s', (unsafeReturnTo) => {
    expect(normalizeMemberReturnTo(unsafeReturnTo, 'en')).toBe('/en');
  });

  it('requires a secure configured application origin outside local development', () => {
    expect(getMemberAuthConfig({ PUBLIC_APP_URL: 'http://hundavaent.example' })).toEqual({
      status: 'unavailable',
      reason: 'unsafe_app_origin'
    });
    expect(getMemberAuthConfig({ PUBLIC_APP_URL: 'not a url' })).toEqual({
      status: 'unavailable',
      reason: 'unsafe_app_origin'
    });
    expect(getMemberAuthConfig({ PUBLIC_APP_URL: 'https://hundavaent.example/path' })).toEqual({
      status: 'unavailable',
      reason: 'unsafe_app_origin'
    });
    expect(
      getMemberAuthConfig({
        PUBLIC_APP_URL: 'https://hundavaent.example',
        AUTH_FACEBOOK_ENABLED: 'true'
      })
    ).toEqual({
      status: 'ready',
      config: {
        appOrigin: 'https://hundavaent.example',
        emailEnabled: false,
        facebookEnabled: true
      }
    });
  });

  it('defaults every provider off and allows the approved linked providers together', () => {
    expect(getMemberAuthConfig({ PUBLIC_APP_URL: 'https://hundavaent.example' })).toEqual({
      status: 'ready',
      config: {
        appOrigin: 'https://hundavaent.example',
        emailEnabled: false,
        facebookEnabled: false
      }
    });
    expect(
      getMemberAuthConfig({
        PUBLIC_APP_URL: 'https://hundavaent.example',
        AUTH_EMAIL_ENABLED: 'true',
        AUTH_FACEBOOK_ENABLED: 'true'
      })
    ).toEqual({
      status: 'ready',
      config: {
        appOrigin: 'https://hundavaent.example',
        emailEnabled: true,
        facebookEnabled: true
      }
    });
  });

  it('builds one allowlisted callback without exposing the return state as an origin', () => {
    const resolution = getMemberAuthConfig({
      PUBLIC_APP_URL: 'https://hundavaent.example',
      AUTH_EMAIL_ENABLED: 'true'
    });
    expect(resolution.status).toBe('ready');

    if (resolution.status === 'ready') {
      expect(
        buildMemberCallbackUrl(resolution.config, 'en', '/en/places/place-1?category=park', 'email')
      ).toBe(
        'https://hundavaent.example/en/auth/callback?returnTo=%2Fen%2Fplaces%2Fplace-1%3Fcategory%3Dpark&flow=member&method=email'
      );
    }
  });

  it('carries only an opaque pending-intent token into the callback', () => {
    const resolution = getMemberAuthConfig({
      PUBLIC_APP_URL: 'https://hundavaent.example',
      AUTH_EMAIL_ENABLED: 'true'
    });
    expect(resolution.status).toBe('ready');

    if (resolution.status === 'ready') {
      const callback = buildMemberCallbackUrl(
        resolution.config,
        'en',
        '/en?place=place-1',
        'email',
        'opaque-token'
      );
      expect(callback).toContain('pendingIntent=opaque-token');
      expect(callback).not.toContain('favourite');
      expect(callback).not.toContain('rating');
    }
  });

  it('projects only the private email and known provider label from an Auth user', () => {
    const identity = getPrivateMemberIdentity({
      id: 'user-1',
      email: 'member@example.is',
      app_metadata: { provider: 'facebook', provider_id: 'private-provider-subject' },
      user_metadata: {
        full_name: 'Private profile name',
        avatar_url: 'https://private.example/avatar'
      },
      aud: 'authenticated',
      created_at: '2026-07-10T00:00:00Z'
    } as never);

    expect(identity).toEqual({ email: 'member@example.is', provider: 'facebook' });
    expect(JSON.stringify(identity)).not.toContain('private-provider-subject');
    expect(JSON.stringify(identity)).not.toContain('Private profile name');
  });

  it('requests the least-privilege Facebook redirect through the provider adapter', async () => {
    const requests: unknown[] = [];
    const client = {
      auth: {
        signInWithOAuth: async (request: unknown) => {
          requests.push(request);
          return { data: { url: 'https://facebook.example/oauth' }, error: null };
        }
      }
    };

    await expect(
      startFacebookSignIn(
        client as never,
        'https://hundavaent.example/en/auth/callback?flow=member'
      )
    ).resolves.toEqual({ status: 'redirect', url: 'https://facebook.example/oauth' });
    expect(requests).toEqual([
      {
        provider: 'facebook',
        options: {
          redirectTo: 'https://hundavaent.example/en/auth/callback?flow=member',
          scopes: 'email'
        }
      }
    ]);
  });

  it('requests a creating, passwordless, expiring-link flow through the email adapter', async () => {
    const requests: unknown[] = [];
    const client = {
      auth: {
        signInWithOtp: async (request: unknown) => {
          requests.push(request);
          return { data: {}, error: null };
        }
      }
    };

    await expect(
      sendPasswordlessEmail(
        client as never,
        'member@example.is',
        'https://hundavaent.example/en/auth/callback?flow=member'
      )
    ).resolves.toBe('sent');
    expect(requests).toEqual([
      {
        email: 'member@example.is',
        options: {
          emailRedirectTo: 'https://hundavaent.example/en/auth/callback?flow=member',
          shouldCreateUser: true
        }
      }
    ]);
  });

  it('maps rejected provider operations to typed failures', async () => {
    const facebook = {
      auth: { signInWithOAuth: async () => Promise.reject(new Error('provider offline')) }
    };
    const email = {
      auth: { signInWithOtp: async () => Promise.reject(new Error('provider offline')) }
    };

    await expect(
      startFacebookSignIn(facebook as never, 'https://example.test/callback')
    ).resolves.toEqual({ status: 'failed' });
    await expect(
      sendPasswordlessEmail(email as never, 'member@example.is', 'https://example.test/callback')
    ).resolves.toBe('failed');
  });
});
