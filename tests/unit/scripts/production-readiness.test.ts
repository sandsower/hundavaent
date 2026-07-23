import { describe, expect, it, vi } from 'vitest';

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
      translations: 'published'
    }
  });
}

function redirectResponse(location: string, noindex = true): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      ...(noindex ? { 'x-robots-tag': 'noindex, nofollow' } : {})
    }
  });
}

function workspaceSignInResponse(cacheControl = 'private, no-store'): Response {
  return new Response('<main data-translation-workspace-sign-in><input name="password"></main>', {
    headers: {
      'cache-control': cacheControl,
      'content-type': 'text/html',
      'x-robots-tag': 'noindex, nofollow'
    }
  });
}

describe('production readiness verifier', () => {
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
        return healthAttempt === 3
          ? redirectResponse('/gate')
          : redirectResponse('/translations/sign-in?redirectTo=%2Ftranslations');
      }

      if (url.pathname === '/translations/sign-in') {
        return healthAttempt === 4
          ? workspaceSignInResponse('public, max-age=60')
          : workspaceSignInResponse();
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
      'translation-workspace.redirect',
      'translation-workspace.cache-control'
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
      'GET /translations/sign-in',
      'GET /api/health',
      'HEAD /is',
      'HEAD /translations',
      'GET /translations/sign-in'
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
              translations: 'published'
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
      },
      {
        name: 'health.database',
        detail: 'expected "ready", received "starting"'
      }
    ]);
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
