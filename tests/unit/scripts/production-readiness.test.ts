import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  parseProductionReadinessArguments,
  waitForProductionReadiness
} from '../../../scripts/verify-production-readiness';

const releaseSha = 'a'.repeat(40);

function healthResponse(release = releaseSha): Response {
  return Response.json({
    service: 'hundavaent',
    status: 'ok',
    release,
    checks: {
      database: 'ready',
      map: 'configured',
      translations: 'synchronized'
    }
  });
}

function redirectResponse(location: string, noindex = true, status = 302): Response {
  return new Response(null, {
    status,
    headers: {
      location,
      ...(noindex ? { 'x-robots-tag': 'noindex, nofollow' } : {})
    }
  });
}

function readinessFetch({
  gateLocation = '/gate?redirectTo=%2Fis',
  gateStatus = 302,
  legacyTranslationLocation = '/is',
  legacyTranslationNoindex = true,
  legacyTranslationStatus = 302
}: {
  gateLocation?: string;
  gateStatus?: number;
  legacyTranslationLocation?: string;
  legacyTranslationNoindex?: boolean;
  legacyTranslationStatus?: number;
} = {}): typeof fetch {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/health') return healthResponse();
    if (url.pathname === '/is') return redirectResponse(gateLocation, true, gateStatus);
    if (url.pathname === '/translations' && init?.method === 'HEAD') {
      return redirectResponse(
        legacyTranslationLocation,
        legacyTranslationNoindex,
        legacyTranslationStatus
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe('production readiness verifier', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs through the same Node strip-only parser used by production', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        'scripts/verify-production-readiness.ts',
        'https://hundavaent.is',
        releaseSha,
        '--timeout-ms',
        '0',
        '--interval-ms',
        '0'
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8'
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Production readiness timed out: production.request (no readiness attempt completed)'
    );
    expect(result.stderr).not.toContain('ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX');
  });

  it('restarts the complete assertion set until staggered edge convergence is coherent', async () => {
    const requestPaths: string[] = [];
    const pendingAssertions: string[] = [];
    let healthAttempt = 0;

    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      requestPaths.push(`${init?.method ?? 'GET'} ${url.pathname}`);

      if (url.pathname === '/api/health') {
        healthAttempt += 1;
        return healthAttempt === 1 ? healthResponse('b'.repeat(40)) : healthResponse();
      }

      if (url.pathname === '/is') {
        return healthAttempt === 2
          ? redirectResponse('/warming-up')
          : redirectResponse('/gate?redirectTo=%2Fis');
      }

      if (url.pathname === '/translations' && init?.method === 'HEAD') {
        if (healthAttempt === 3) return redirectResponse('/gate');
        return healthAttempt === 4 ? redirectResponse('/is', false) : redirectResponse('/is');
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    await waitForProductionReadiness({
      productionUrl: 'https://hundavaent.is',
      expectedRelease: releaseSha,
      timeoutMs: 10_000,
      intervalMs: 0,
      fetchImplementation,
      sleep: async () => undefined,
      onPending: (assertion) => pendingAssertions.push(assertion.name)
    });

    expect(pendingAssertions).toEqual([
      'health.release',
      'gate.redirect',
      'legacy-translation-route.redirect',
      'legacy-translation-route.noindex'
    ]);
    expect(requestPaths.filter((path) => path === 'GET /api/health')).toHaveLength(5);
    expect(requestPaths).toEqual([
      'GET /api/health',
      'GET /api/health',
      'HEAD /is',
      'GET /api/health',
      'HEAD /is',
      'HEAD /translations',
      'GET /api/health',
      'HEAD /is',
      'HEAD /translations',
      'GET /api/health',
      'HEAD /is',
      'HEAD /translations'
    ]);
  });

  it('reports the exact health assertion that is still pending', async () => {
    const pendingAssertions: Array<{ name: string; detail: string }> = [];
    let now = 0;

    await expect(
      waitForProductionReadiness({
        productionUrl: 'https://hundavaent.is',
        expectedRelease: releaseSha,
        timeoutMs: 1,
        intervalMs: 1,
        fetchImplementation: async () =>
          Response.json({
            service: 'hundavaent',
            status: 'ok',
            release: releaseSha,
            checks: {
              database: 'starting',
              map: 'configured',
              translations: 'synchronized'
            }
          }),
        sleep: async () => {
          now += 1;
        },
        now: () => now,
        onPending: (assertion) => pendingAssertions.push(assertion)
      })
    ).rejects.toThrow('Production readiness timed out: health.database');

    expect(pendingAssertions).toEqual([
      {
        name: 'health.database',
        detail: 'expected "ready", received "starting"'
      }
    ]);
  });

  it('bounds a never-resolving fetch with the remaining global deadline', async () => {
    vi.useFakeTimers();
    let requestWasAborted = false;
    const pendingAssertions: Array<{ name: string; detail: string }> = [];
    const readiness = waitForProductionReadiness({
      productionUrl: 'https://hundavaent.is',
      expectedRelease: releaseSha,
      timeoutMs: 25,
      intervalMs: 100,
      fetchImplementation: vi.fn<typeof fetch>(
        async (_input, init) =>
          new Promise<Response>(() => {
            if (init?.signal instanceof AbortSignal) {
              init.signal.addEventListener('abort', () => {
                requestWasAborted = true;
              });
            }
          })
      ),
      onPending: (assertion) => pendingAssertions.push(assertion)
    });
    const rejection = expect(readiness).rejects.toThrow(
      'Production readiness timed out: health.request (global readiness deadline elapsed)'
    );

    await vi.advanceTimersByTimeAsync(25);
    await rejection;

    expect(requestWasAborted).toBe(true);
    expect(pendingAssertions).toEqual([
      {
        name: 'health.request',
        detail: 'global readiness deadline elapsed'
      }
    ]);
  }, 500);

  it('caps retry sleep to the remaining global budget', async () => {
    let now = 0;
    const sleeps: number[] = [];

    await expect(
      waitForProductionReadiness({
        productionUrl: 'https://hundavaent.is',
        expectedRelease: releaseSha,
        timeoutMs: 5,
        intervalMs: 100,
        fetchImplementation: async () =>
          Response.json({
            service: 'hundavaent',
            status: 'ok',
            release: releaseSha,
            checks: {
              database: 'starting',
              map: 'configured',
              translations: 'synchronized'
            }
          }),
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
          now += milliseconds;
        },
        now: () => now
      })
    ).rejects.toThrow('Production readiness timed out: health.database');

    expect(sleeps).toEqual([5]);
  });

  it.each([
    {
      label: 'relative',
      gateLocation: '/gate?redirectTo=%2Fis',
      legacyTranslationLocation: '/is'
    },
    {
      label: 'absolute same-origin',
      gateLocation: 'https://hundavaent.is/gate?redirectTo=%2Fis',
      legacyTranslationLocation: 'https://hundavaent.is/is'
    }
  ])(
    'accepts $label gate and retired translation-route redirects',
    async ({ gateLocation, legacyTranslationLocation }) => {
      await expect(
        waitForProductionReadiness({
          productionUrl: 'https://hundavaent.is',
          expectedRelease: releaseSha,
          fetchImplementation: readinessFetch({ gateLocation, legacyTranslationLocation })
        })
      ).resolves.toBeUndefined();
    }
  );

  it.each([
    {
      assertion: 'gate.redirect',
      gateLocation: 'https://attacker.invalid/gate?redirectTo=%2Fis',
      legacyTranslationLocation: '/is'
    },
    {
      assertion: 'legacy-translation-route.redirect',
      gateLocation: '/gate?redirectTo=%2Fis',
      legacyTranslationLocation: 'https://attacker.invalid/is'
    }
  ])(
    'rejects a cross-origin redirect at $assertion',
    async ({ assertion, gateLocation, legacyTranslationLocation }) => {
      let now = 0;
      await expect(
        waitForProductionReadiness({
          productionUrl: 'https://hundavaent.is',
          expectedRelease: releaseSha,
          timeoutMs: 1,
          intervalMs: 1,
          fetchImplementation: readinessFetch({ gateLocation, legacyTranslationLocation }),
          sleep: async (milliseconds) => {
            now += milliseconds;
          },
          now: () => now
        })
      ).rejects.toThrow(`Production readiness timed out: ${assertion}`);
    }
  );

  it('requires the retired translation route to remain non-indexable', async () => {
    let now = 0;

    await expect(
      waitForProductionReadiness({
        productionUrl: 'https://hundavaent.is',
        expectedRelease: releaseSha,
        timeoutMs: 1,
        intervalMs: 1,
        fetchImplementation: readinessFetch({
          legacyTranslationNoindex: false
        }),
        sleep: async (milliseconds) => {
          now += milliseconds;
        },
        now: () => now
      })
    ).rejects.toThrow('Production readiness timed out: legacy-translation-route.noindex');
  });

  it('requires the retired translation route to return an actual redirect status', async () => {
    let now = 0;

    await expect(
      waitForProductionReadiness({
        productionUrl: 'https://hundavaent.is',
        expectedRelease: releaseSha,
        timeoutMs: 1,
        intervalMs: 1,
        fetchImplementation: readinessFetch({
          legacyTranslationStatus: 200
        }),
        sleep: async (milliseconds) => {
          now += milliseconds;
        },
        now: () => now
      })
    ).rejects.toThrow('Production readiness timed out: legacy-translation-route.redirect');
  });

  it('requires the site gate to return an actual redirect status', async () => {
    let now = 0;

    await expect(
      waitForProductionReadiness({
        productionUrl: 'https://hundavaent.is',
        expectedRelease: releaseSha,
        timeoutMs: 1,
        intervalMs: 1,
        fetchImplementation: readinessFetch({
          gateStatus: 200
        }),
        sleep: async (milliseconds) => {
          now += milliseconds;
        },
        now: () => now
      })
    ).rejects.toThrow('Production readiness timed out: gate.redirect');
  });

  it('parses the production URL, release, and retry controls without accepting extras', () => {
    expect(
      parseProductionReadinessArguments([
        'https://hundavaent.is/',
        releaseSha,
        '--timeout-ms',
        '90000',
        '--interval-ms',
        '1000'
      ])
    ).toEqual({
      productionUrl: 'https://hundavaent.is/',
      expectedRelease: releaseSha,
      timeoutMs: 90_000,
      intervalMs: 1_000
    });

    expect(() =>
      parseProductionReadinessArguments(['https://hundavaent.is', releaseSha, '--unknown', '1'])
    ).toThrow('Unknown production readiness option: --unknown');
  });
});
