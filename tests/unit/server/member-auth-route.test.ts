import { describe, expect, it, vi } from 'vitest';

import { clearRequestAuthSession, createAuthCallback } from '../../../src/lib/server/auth/callback';
import {
  actions,
  _createLoad,
  _createEmailAction,
  _createFacebookAction,
  load
} from '../../../src/routes/[lang=lang]/account/+page.server';

const testActivationProof = async () => 'a'.repeat(64);

const emailCallbackHandler = createAuthCallback({
  resolveMemberAuthConfig: () => ({
    status: 'ready',
    config: {
      appOrigin: 'http://localhost',
      emailEnabled: true,
      facebookEnabled: false
    }
  }),
  resolveMemberProviderPolicy: async () => ({
    status: 'ready',
    policy: { provider: 'email', version: 'member-single-provider-v1' }
  }),
  createMemberActivationProof: testActivationProof
});
const facebookCallbackHandler = createAuthCallback({
  resolveMemberAuthConfig: () => ({
    status: 'ready',
    config: {
      appOrigin: 'http://localhost',
      emailEnabled: false,
      facebookEnabled: true
    }
  }),
  resolveMemberProviderPolicy: async () => ({ status: 'unavailable' }),
  createMemberActivationProof: testActivationProof
});

function callback(event: Parameters<typeof emailCallbackHandler>[0]) {
  return emailCallbackHandler({
    ...event,
    cookies: event.cookies ?? { getAll: () => [], delete: vi.fn() }
  });
}

function facebookCallback(event: Parameters<typeof facebookCallbackHandler>[0]) {
  return facebookCallbackHandler({
    ...event,
    cookies: event.cookies ?? { getAll: () => [], delete: vi.fn() }
  });
}

function emailIdentityUser() {
  return {
    data: {
      user: {
        id: 'member-1',
        identities: [{ id: 'email-identity', provider: 'email' }]
      }
    },
    error: null
  };
}

function formRequest(values: Record<string, string>): Request {
  const body = new URLSearchParams(values);
  return new Request('http://localhost/en/account', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' }
  });
}

describe('Member auth routes', () => {
  it('validates email before contacting an unavailable provider', async () => {
    const result = await actions.email({
      locals: { requestId: 'request-email', supabase: null },
      params: { lang: 'en' },
      request: formRequest({ email: 'not-an-email', returnTo: '/en/places/place-1' })
    } as never);

    expect(result).toMatchObject({
      status: 400,
      data: {
        action: 'email',
        email: 'not-an-email',
        error: 'email_invalid',
        returnTo: '/en/places/place-1'
      }
    });
  });

  it('fails Facebook closed when the server provider is unavailable', async () => {
    const result = await actions.facebook({
      locals: { requestId: 'request-facebook', supabase: null },
      params: { lang: 'en' },
      request: formRequest({ returnTo: '/en/places/place-1' })
    } as never);

    expect(result).toMatchObject({
      status: 503,
      data: { action: 'facebook', error: 'unavailable', returnTo: '/en/places/place-1' }
    });
  });

  it('checks the persistent provider tuple before starting Facebook Auth', async () => {
    const signInWithOAuth = vi.fn();
    const rpc = vi.fn(async () => ({
      data: [{ provider: 'email', policy_version: 'member-single-provider-v1' }],
      error: null
    }));

    const configuredFacebookAction = _createFacebookAction(() => ({
      status: 'ready',
      config: {
        appOrigin: 'http://localhost',
        emailEnabled: false,
        facebookEnabled: true
      }
    }));
    const result = await configuredFacebookAction({
      locals: {
        requestId: 'request-facebook-policy-mismatch',
        supabase: { auth: { signInWithOAuth }, rpc }
      },
      params: { lang: 'en' },
      request: formRequest({ returnTo: '/en' })
    } as never);

    expect(result).toMatchObject({
      status: 503,
      data: { action: 'facebook', error: 'unavailable', returnTo: '/en' }
    });
    expect(rpc).toHaveBeenCalledWith('get_member_provider_policy');
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it('checks the persistent provider tuple before requesting passwordless email', async () => {
    const signInWithOtp = vi.fn();
    const rpc = vi.fn(async () => ({
      data: [{ provider: 'facebook', policy_version: 'member-single-provider-v1' }],
      error: null
    }));
    const configuredEmailAction = _createEmailAction(() => ({
      status: 'ready',
      config: {
        appOrigin: 'http://localhost',
        emailEnabled: true,
        facebookEnabled: false
      }
    }));
    const result = await configuredEmailAction({
      locals: {
        requestId: 'request-email-policy-mismatch',
        supabase: { auth: { signInWithOtp }, rpc }
      },
      params: { lang: 'en' },
      request: formRequest({ email: 'member@example.is', returnTo: '/en' })
    } as never);

    expect(result).toMatchObject({
      status: 503,
      data: {
        action: 'email',
        email: 'member@example.is',
        error: 'unavailable',
        returnTo: '/en'
      }
    });
    expect(rpc).toHaveBeenCalledWith('get_member_provider_policy');
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('expires local auth cookies and completes sign-out when provider revocation returns an error', async () => {
    const events: unknown[] = [];
    const deleteCookie = vi.fn();
    await expect(
      actions.signOut({
        cookies: {
          getAll: () => [{ name: 'sb-local-auth-token.0', value: 'session-part' }],
          delete: deleteCookie
        },
        locals: {
          requestId: 'request-sign-out',
          supabase: {
            auth: {
              getUser: async () => ({ data: { user: { id: 'member-1' } }, error: null }),
              signOut: async () => ({ error: { message: 'provider unavailable' } })
            },
            rpc: async (name: string, parameters: unknown) => {
              events.push({ name, parameters });
              return { data: 'event-1', error: null };
            }
          }
        },
        params: { lang: 'en' },
        request: formRequest({ returnTo: '/en/places/place-1' })
      } as never)
    ).rejects.toMatchObject({ status: 303, location: '/en/places/place-1' });
    expect(deleteCookie).toHaveBeenCalledWith('sb-local-auth-token.0', { path: '/' });
    expect(events).toEqual([
      {
        name: 'record_member_auth_event',
        parameters: {
          event_action: 'session.sign_out_requested',
          event_request_id: 'request-sign-out'
        }
      }
    ]);
  });

  it('expires every auth-cookie chunk when sign-out lookup, audit, or provider operations reject', async () => {
    const baseEvent = {
      locals: { requestId: 'request-sign-out-rejected' },
      params: { lang: 'en' }
    };
    const clients = [
      {
        auth: { getUser: async () => Promise.reject(new Error('auth offline')) }
      },
      {
        auth: {
          getUser: async () => ({ data: { user: { id: 'member-1' } }, error: null })
        },
        rpc: async () => Promise.reject(new Error('audit offline'))
      },
      {
        auth: {
          getUser: async () => ({ data: { user: { id: 'member-1' } }, error: null }),
          signOut: async () => Promise.reject(new Error('provider offline'))
        },
        rpc: async () => ({ data: 'event-1', error: null })
      }
    ];

    for (const supabase of clients) {
      const deleteCookie = vi.fn();
      await expect(
        actions.signOut({
          ...baseEvent,
          cookies: {
            getAll: () => [
              { name: 'sb-local-auth-token.0', value: 'session-part-1' },
              { name: 'sb-local-auth-token.1', value: 'session-part-2' }
            ],
            delete: deleteCookie
          },
          locals: { ...baseEvent.locals, supabase },
          request: formRequest({ returnTo: '/en' })
        } as never)
      ).rejects.toMatchObject({ status: 303, location: '/en' });
      expect(deleteCookie).toHaveBeenCalledTimes(2);
    }
  });

  it('expires request auth cookies even when no provider client is available', async () => {
    const deleteCookie = vi.fn();

    await expect(
      actions.signOut({
        cookies: {
          getAll: () => [{ name: 'sb-local-auth-token', value: 'session' }],
          delete: deleteCookie
        },
        locals: { requestId: 'request-no-client', supabase: null },
        params: { lang: 'en' },
        request: formRequest({ returnTo: '/en' })
      } as never)
    ).rejects.toMatchObject({ status: 303, location: '/en' });
    expect(deleteCookie).toHaveBeenCalledWith('sb-local-auth-token', { path: '/' });
  });

  it('starts deletion with a versioned disclosure and caller-derived request ID', async () => {
    const commands: unknown[] = [];
    const result = await actions.requestDeletion({
      locals: {
        requestId: 'request-delete',
        supabase: {
          auth: {
            getUser: async () => ({ data: { user: { id: 'member-1' } }, error: null })
          },
          rpc: async (name: string, parameters: unknown) => {
            commands.push({ name, parameters });
            return { data: [{ deletion_status: 'requested' }], error: null };
          }
        }
      },
      params: { lang: 'is' }
    } as never);

    expect(result).toEqual({ action: 'requestDeletion', success: 'deletion_requested' });
    expect(commands).toEqual([
      {
        name: 'begin_current_account_deletion',
        parameters: {
          command_disclosure_version: 'member-deletion-v1',
          command_locale: 'is',
          command_request_id: 'request-delete'
        }
      }
    ]);
  });

  it('recovers when a deletion RPC rejects instead of returning an error result', async () => {
    const result = await actions.requestDeletion({
      locals: {
        requestId: 'request-delete-rejected',
        supabase: {
          auth: {
            getUser: async () => ({ data: { user: { id: 'member-1' } }, error: null })
          },
          rpc: async () => Promise.reject(new Error('database offline'))
        }
      },
      params: { lang: 'en' }
    } as never);

    expect(result).toMatchObject({
      status: 503,
      data: { action: 'requestDeletion', error: 'unavailable' }
    });
  });

  it('turns an expired session into a recoverable anonymous account state', async () => {
    const result = await load({
      locals: {
        requestId: 'request-expired',
        supabase: {
          auth: {
            getUser: async () => ({
              data: { user: null },
              error: { name: 'AuthApiError', message: 'Refresh token expired' }
            })
          }
        }
      },
      params: { lang: 'en' },
      url: new URL('http://localhost/en/account?returnTo=%2Fen%2Fplaces%2Fplace-1')
    } as never);

    expect(result).toMatchObject({
      member: null,
      returnTo: '/en/places/place-1',
      authStatus: 'session_expired'
    });
  });

  it('preserves the explicit provider configuration conflict with a Supabase client', async () => {
    const conflictingLoad = _createLoad(() => ({
      status: 'unavailable',
      reason: 'identity_linking_policy_required'
    }));
    const result = await conflictingLoad({
      locals: {
        requestId: 'request-configuration-conflict',
        supabase: {
          auth: {
            getUser: async () => ({ data: { user: null }, error: null })
          }
        }
      },
      params: { lang: 'en' },
      url: new URL('http://localhost/en/account?returnTo=%2Fen')
    } as never);

    expect(result).toMatchObject({
      member: null,
      authStatus: 'configuration_conflict',
      providers: { email: false, facebook: false }
    });
  });

  it('recovers when account session or caller-projection operations reject', async () => {
    const url = new URL('http://localhost/en/account?returnTo=%2Fen');
    const sessionFailure = await load({
      locals: {
        requestId: 'request-session-rejected',
        supabase: { auth: { getUser: async () => Promise.reject(new Error('auth offline')) } }
      },
      params: { lang: 'en' },
      url
    } as never);
    expect(sessionFailure).toMatchObject({ member: null, authStatus: 'unavailable' });

    const projectionFailure = await load({
      locals: {
        requestId: 'request-projection-rejected',
        supabase: {
          auth: {
            getUser: async () => ({
              data: {
                user: {
                  id: 'member-1',
                  email: 'member@example.is',
                  app_metadata: { provider: 'email' }
                }
              },
              error: null
            })
          },
          rpc: async () => Promise.reject(new Error('database offline'))
        }
      },
      params: { lang: 'en' },
      url
    } as never);
    expect(projectionFailure).toMatchObject({ member: null, authStatus: 'unavailable' });
  });

  it.each([
    { label: 'literal true', result: { data: true, error: null }, expected: true },
    { label: 'false', result: { data: false, error: null }, expected: false },
    { label: 'null', result: { data: null, error: null }, expected: false },
    {
      label: 'an RPC error',
      result: { data: true, error: { message: 'role lookup unavailable' } },
      expected: false
    }
  ])(
    'exposes Moderator capability for $label without changing the account',
    async ({ result, expected }) => {
      const rpc = vi.fn(async (name: string) => {
        if (name === 'get_current_member_account') {
          return {
            data: [
              {
                created_at: '2026-07-01T12:00:00Z',
                deletion_status: 'active',
                deletion_requested_at: null
              }
            ],
            error: null
          };
        }

        if (name === 'has_current_user_role') return result;
        throw new Error(`Unexpected RPC: ${name}`);
      });
      const accountLoad = _createLoad(() => ({
        status: 'unavailable',
        reason: 'missing_app_origin'
      }));

      const loaded = await accountLoad({
        locals: {
          requestId: `request-capability-${expected}`,
          supabase: {
            auth: {
              getUser: async () => ({
                data: {
                  user: {
                    id: 'member-1',
                    email: 'member@example.is',
                    app_metadata: { provider: 'email' }
                  }
                },
                error: null
              })
            },
            rpc
          }
        },
        params: { lang: 'en' },
        url: new URL('http://localhost/en/account?returnTo=%2Fen')
      } as never);

      expect(loaded).toMatchObject({
        member: { email: 'member@example.is' },
        authStatus: null,
        canModerate: expected
      });
      expect(rpc).toHaveBeenCalledWith('has_current_user_role', {
        required_role: 'moderator'
      });
    }
  );

  it('keeps the ordinary account available when the Moderator capability lookup rejects', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'get_current_member_account') {
        return {
          data: [
            {
              created_at: '2026-07-01T12:00:00Z',
              deletion_status: 'active',
              deletion_requested_at: null
            }
          ],
          error: null
        };
      }

      throw new Error('role lookup offline');
    });
    const accountLoad = _createLoad(() => ({
      status: 'unavailable',
      reason: 'missing_app_origin'
    }));

    const loaded = await accountLoad({
      locals: {
        requestId: 'request-capability-rejected',
        supabase: {
          auth: {
            getUser: async () => ({
              data: {
                user: {
                  id: 'member-1',
                  email: 'member@example.is',
                  app_metadata: { provider: 'email' }
                }
              },
              error: null
            })
          },
          rpc
        }
      },
      params: { lang: 'en' },
      url: new URL('http://localhost/en/account?returnTo=%2Fen')
    } as never);

    expect(loaded).toMatchObject({
      member: { email: 'member@example.is' },
      authStatus: null,
      canModerate: false
    });
  });

  it('returns denied Facebook consent to bilingual Member recovery', async () => {
    await expect(
      facebookCallback({
        locals: { requestId: 'request-denied', supabase: null },
        params: { lang: 'en' },
        url: new URL(
          'http://localhost/en/auth/callback?flow=member&method=facebook&returnTo=%2Fen%2Fplaces%2Fplace-1&error=access_denied'
        )
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en/account?returnTo=%2Fen%2Fplaces%2Fplace-1&authStatus=denied'
    });
  });

  it('classifies an email-provider denial as an invalid or replayed link', async () => {
    await expect(
      callback({
        locals: { requestId: 'request-replayed', supabase: null },
        params: { lang: 'en' },
        url: new URL(
          'http://localhost/en/auth/callback?flow=member&method=email&returnTo=%2Fen&error=access_denied&error_code=otp_expired'
        )
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en/account?returnTo=%2Fen&authStatus=link_invalid'
    });
  });

  it('returns an expired or replayed code to link recovery without leaking details', async () => {
    await expect(
      callback({
        locals: {
          requestId: 'request-expired-link',
          supabase: { auth: { exchangeCodeForSession: async () => ({ error: null }) } }
        },
        params: { lang: 'is' },
        url: new URL('http://localhost/is/auth/callback?flow=member&returnTo=%2Fis')
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/is/account?returnTo=%2Fis&authStatus=link_invalid'
    });
  });

  it('rejects a Member callback before exchange when no single provider is enabled', async () => {
    const exchangeCodeForSession = vi.fn();
    const deleteCookie = vi.fn();
    const unavailableCallback = createAuthCallback({
      resolveMemberAuthConfig: () => ({
        status: 'ready',
        config: {
          appOrigin: 'http://localhost',
          emailEnabled: false,
          facebookEnabled: false
        }
      })
    });

    await expect(
      unavailableCallback({
        cookies: {
          getAll: () => [{ name: 'sb-local-auth-token-code-verifier', value: 'verifier' }],
          delete: deleteCookie
        },
        locals: {
          requestId: 'request-disabled-provider',
          supabase: {
            auth: {
              exchangeCodeForSession,
              signOut: async () => ({ error: null })
            }
          }
        },
        params: { lang: 'en' },
        url: new URL(
          'http://localhost/en/auth/callback?flow=member&method=email&returnTo=%2Fen&code=one-time-code'
        )
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en/account?returnTo=%2Fen&authStatus=unavailable'
    });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(deleteCookie).toHaveBeenCalledWith('sb-local-auth-token-code-verifier', { path: '/' });
  });

  it('rejects a sequential provider change against persistent tenant policy before exchange', async () => {
    const exchangeCodeForSession = vi.fn();
    const policyChecked = vi.fn(async () => ({
      status: 'ready',
      policy: { provider: 'email', version: 'member-single-provider-v1' }
    }));
    const facebookAgainstEmailPolicy = createAuthCallback({
      resolveMemberAuthConfig: () => ({
        status: 'ready',
        config: {
          appOrigin: 'http://localhost',
          emailEnabled: false,
          facebookEnabled: true
        }
      }),
      resolveMemberProviderPolicy: policyChecked
    } as never);

    await expect(
      facebookAgainstEmailPolicy({
        cookies: { getAll: () => [], delete: vi.fn() },
        locals: {
          requestId: 'request-sequential-provider-change',
          supabase: {
            auth: {
              exchangeCodeForSession,
              signOut: async () => ({ error: null })
            }
          }
        },
        params: { lang: 'en' },
        url: new URL(
          'http://localhost/en/auth/callback?flow=member&method=facebook&returnTo=%2Fen&code=facebook-code'
        )
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en/account?returnTo=%2Fen&authStatus=unavailable'
    });
    expect(policyChecked).toHaveBeenCalledOnce();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('clears an exchanged session when provider configuration changes during callback', async () => {
    const deleteCookie = vi.fn();
    const resolutions = [
      {
        status: 'ready' as const,
        config: {
          appOrigin: 'http://localhost',
          emailEnabled: true,
          facebookEnabled: false
        }
      },
      {
        status: 'unavailable' as const,
        reason: 'identity_linking_policy_required' as const
      }
    ];
    const changingCallback = createAuthCallback({
      resolveMemberAuthConfig: () => resolutions.shift() ?? resolutions[0]!,
      resolveMemberProviderPolicy: async () => ({
        status: 'ready',
        policy: { provider: 'email', version: 'member-single-provider-v1' }
      })
    });

    await expect(
      changingCallback({
        cookies: {
          getAll: () => [{ name: 'sb-local-auth-token.0', value: 'session-part' }],
          delete: deleteCookie
        },
        locals: {
          requestId: 'request-provider-changed',
          supabase: {
            auth: {
              exchangeCodeForSession: async () => ({ error: null }),
              signOut: async () => ({ error: null })
            }
          }
        },
        params: { lang: 'en' },
        url: new URL(
          'http://localhost/en/auth/callback?flow=member&method=email&returnTo=%2Fen&code=one-time-code'
        )
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en/account?returnTo=%2Fen&authStatus=unavailable'
    });
    expect(deleteCookie).toHaveBeenCalledWith('sb-local-auth-token.0', { path: '/' });
  });

  it('clears an exchanged session when the persistent policy version changes during callback', async () => {
    const deleteCookie = vi.fn();
    const getUser = vi.fn();
    const policies = [
      {
        status: 'ready' as const,
        policy: { provider: 'email' as const, version: 'member-single-provider-v1' }
      },
      {
        status: 'ready' as const,
        policy: { provider: 'email' as const, version: 'member-single-provider-v2' }
      }
    ];
    const changingPolicyCallback = createAuthCallback({
      resolveMemberAuthConfig: () => ({
        status: 'ready',
        config: {
          appOrigin: 'http://localhost',
          emailEnabled: true,
          facebookEnabled: false
        }
      }),
      resolveMemberProviderPolicy: async () => policies.shift() ?? policies[0]!
    });

    await expect(
      changingPolicyCallback({
        cookies: {
          getAll: () => [{ name: 'sb-local-auth-token.0', value: 'session-part' }],
          delete: deleteCookie
        },
        locals: {
          requestId: 'request-policy-changed',
          supabase: {
            auth: {
              exchangeCodeForSession: async () => ({ error: null }),
              getUser,
              signOut: async () => ({ error: null })
            }
          }
        },
        params: { lang: 'en' },
        url: new URL(
          'http://localhost/en/auth/callback?flow=member&method=email&returnTo=%2Fen&code=one-time-code'
        )
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en/account?returnTo=%2Fen&authStatus=unavailable'
    });
    expect(getUser).not.toHaveBeenCalled();
    expect(deleteCookie).toHaveBeenCalledWith('sb-local-auth-token.0', { path: '/' });
  });

  it('records a completed Member sign-in before returning to the originating Place', async () => {
    const events: unknown[] = [];
    const supabase = {
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => emailIdentityUser(),
        signOut: async () => ({ error: null })
      },
      rpc: async (name: string, parameters: unknown) => {
        events.push({ name, parameters });
        return { data: 'event-1', error: null };
      }
    };

    await expect(
      callback({
        locals: { requestId: 'request-success', supabase },
        params: { lang: 'en' },
        url: new URL(
          'http://localhost/en/auth/callback?flow=member&method=email&returnTo=%2Fen%2Fplaces%2Fplace-1&code=one-time-code'
        )
      } as never)
    ).rejects.toMatchObject({ status: 303, location: '/en/places/place-1' });

    expect(events).toEqual([
      {
        name: 'activate_current_member',
        parameters: {
          activation_proof: 'a'.repeat(64),
          activation_request_id: 'request-success'
        }
      }
    ]);
  });

  it('rejects a session whose server-returned identity does not match the enabled provider', async () => {
    const supabase = {
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => ({
          data: {
            user: {
              id: 'member-1',
              identities: [{ id: 'facebook-identity', provider: 'facebook' }]
            }
          },
          error: null
        }),
        signOut: async () => ({ error: null })
      },
      rpc: async () => ({ data: 'event-1', error: null })
    };

    await expect(
      callback({
        cookies: { getAll: () => [], delete: vi.fn() },
        locals: { requestId: 'request-provider-mismatch', supabase },
        params: { lang: 'en' },
        url: new URL(
          'http://localhost/en/auth/callback?flow=member&method=facebook&returnTo=%2Fen&code=one-time-code'
        )
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en/account?returnTo=%2Fen&authStatus=unavailable'
    });
  });

  it.each([
    ['missing', undefined],
    [
      'multiple',
      [
        { id: 'email-identity', provider: 'email' },
        { id: 'facebook-identity', provider: 'facebook' }
      ]
    ]
  ])('rejects %s server-returned identities', async (_label, identities) => {
    const supabase = {
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => ({
          data: { user: { id: 'member-1', identities } },
          error: null
        }),
        signOut: async () => ({ error: null })
      },
      rpc: async () => ({ data: 'event-1', error: null })
    };

    await expect(
      callback({
        locals: { requestId: 'request-invalid-identities', supabase },
        params: { lang: 'en' },
        url: new URL(
          'http://localhost/en/auth/callback?flow=member&method=email&returnTo=%2Fen&code=one-time-code'
        )
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en/account?returnTo=%2Fen&authStatus=unavailable'
    });
  });

  it('recovers when callback exchange or atomic activation operations reject', async () => {
    const callbackUrl = new URL(
      'http://localhost/en/auth/callback?flow=member&method=email&returnTo=%2Fen&code=one-time-code'
    );
    const exchangeFailure = {
      auth: { exchangeCodeForSession: async () => Promise.reject(new Error('auth offline')) }
    };
    await expect(
      callback({
        locals: { requestId: 'request-exchange-rejected', supabase: exchangeFailure },
        params: { lang: 'en' },
        url: callbackUrl
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en/account?returnTo=%2Fen&authStatus=unavailable'
    });

    let cleanedUp = false;
    const activationFailure = {
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => emailIdentityUser(),
        signOut: async () => {
          cleanedUp = true;
          return { error: null };
        }
      },
      rpc: async () => Promise.reject(new Error('activation offline'))
    };
    await expect(
      callback({
        locals: { requestId: 'request-activation-rejected', supabase: activationFailure },
        params: { lang: 'en' },
        url: callbackUrl
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en/account?returnTo=%2Fen&authStatus=unavailable'
    });
    expect(cleanedUp).toBe(true);
  });

  it('never calls activation when the server callback capability is unavailable', async () => {
    const rpc = vi.fn();
    const protectedCallback = createAuthCallback({
      resolveMemberAuthConfig: () => ({
        status: 'ready',
        config: {
          appOrigin: 'http://localhost',
          emailEnabled: true,
          facebookEnabled: false
        }
      }),
      resolveMemberProviderPolicy: async () => ({
        status: 'ready',
        policy: { provider: 'email', version: 'member-single-provider-v1' }
      }),
      createMemberActivationProof: async () => null
    });

    await expect(
      protectedCallback({
        cookies: { getAll: () => [], delete: vi.fn() },
        locals: {
          requestId: 'request-no-capability',
          supabase: {
            auth: {
              exchangeCodeForSession: async () => ({ error: null }),
              getUser: async () => emailIdentityUser(),
              signOut: async () => ({ error: null })
            },
            rpc
          }
        },
        params: { lang: 'en' },
        url: new URL(
          'http://localhost/en/auth/callback?flow=member&method=email&returnTo=%2Fen&code=one-time-code'
        )
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en/account?returnTo=%2Fen&authStatus=unavailable'
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed when the atomic activation and sign-in audit command returns an error', async () => {
    let signedOut = false;
    const supabase = {
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => emailIdentityUser(),
        signOut: async () => {
          signedOut = true;
          return { error: null };
        }
      },
      rpc: async () => ({ data: null, error: { message: 'atomic activation unavailable' } })
    };

    await expect(
      callback({
        locals: { requestId: 'request-audit-failure', supabase },
        params: { lang: 'is' },
        url: new URL(
          'http://localhost/is/auth/callback?flow=member&method=email&returnTo=%2Fis&code=one-time-code'
        )
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/is/account?returnTo=%2Fis&authStatus=unavailable'
    });
    expect(signedOut).toBe(true);
  });

  it('still reaches recovery when required session cleanup rejects', async () => {
    const deleteCookie = vi.fn();
    const supabase = {
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => emailIdentityUser(),
        signOut: async () => Promise.reject(new Error('cleanup offline'))
      },
      rpc: async () => ({ data: null, error: { message: 'atomic activation unavailable' } })
    };

    await expect(
      callback({
        cookies: {
          getAll: () => [
            { name: 'sb-local-auth-token.0', value: 'session-part' },
            { name: 'unrelated', value: 'keep-me' }
          ],
          delete: deleteCookie
        },
        locals: { requestId: 'request-cleanup-rejected', supabase },
        params: { lang: 'en' },
        url: new URL(
          'http://localhost/en/auth/callback?flow=member&method=email&returnTo=%2Fen&code=one-time-code'
        )
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en/account?returnTo=%2Fen&authStatus=unavailable'
    });
    expect(deleteCookie).toHaveBeenCalledTimes(1);
    expect(deleteCookie).toHaveBeenCalledWith('sb-local-auth-token.0', { path: '/' });
  });

  it('expires every local auth-cookie chunk when cleanup returns an error', async () => {
    const deleteCookie = vi.fn();
    const supabase = {
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        getUser: async () => emailIdentityUser(),
        signOut: async () => ({ error: { message: 'provider refused cleanup' } })
      },
      rpc: async () => ({ data: null, error: { message: 'atomic activation unavailable' } })
    };

    await expect(
      callback({
        cookies: {
          getAll: () => [
            { name: 'sb-local-auth-token.0', value: 'session-part-1' },
            { name: 'sb-local-auth-token.1', value: 'session-part-2' },
            { name: 'unrelated', value: 'keep-me' }
          ],
          delete: deleteCookie
        },
        locals: { requestId: 'request-cleanup-error', supabase },
        params: { lang: 'en' },
        url: new URL(
          'http://localhost/en/auth/callback?flow=member&method=email&returnTo=%2Fen&code=one-time-code'
        )
      } as never)
    ).rejects.toMatchObject({
      status: 303,
      location: '/en/account?returnTo=%2Fen&authStatus=unavailable'
    });
    expect(deleteCookie).toHaveBeenCalledTimes(2);
    expect(deleteCookie).toHaveBeenNthCalledWith(1, 'sb-local-auth-token.0', { path: '/' });
    expect(deleteCookie).toHaveBeenNthCalledWith(2, 'sb-local-auth-token.1', { path: '/' });
  });

  it('reports provider cleanup failure separately from guaranteed local cookie expiry', async () => {
    const deleteCookie = vi.fn();
    const outcome = await clearRequestAuthSession(
      {
        auth: {
          signOut: async () => ({ error: { message: 'provider refused cleanup' } })
        }
      } as never,
      {
        getAll: () => [
          { name: 'sb-local-auth-token.0', value: 'session-part' },
          { name: 'not-auth', value: 'untouched' }
        ],
        delete: deleteCookie
      } as never
    );

    expect(outcome).toEqual({ providerSignOut: 'failed', expiredCookieCount: 1 });
    expect(deleteCookie).toHaveBeenCalledWith('sb-local-auth-token.0', { path: '/' });
  });
});
