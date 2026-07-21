import { describe, expect, it, vi } from 'vitest';

import {
  EVALUATION_FIXTURE_VERSION,
  evaluationFixtureIds,
  evaluationFixtureTimes,
  evaluationModerator
} from '$server/evaluation/fixtures';
import { parseWaitForHealthArguments, waitForHealth } from '../../../scripts/wait-for-health';
import { assertLocalEvaluationUrl } from '../../e2e/support/local-supabase';

describe('deterministic evaluation provisioning', () => {
  it('keeps stable fixture identifiers, time, and local Moderator identity', () => {
    expect(EVALUATION_FIXTURE_VERSION).toBe('evaluation-fixtures/v1');
    expect(evaluationFixtureIds.places.published).toBe('30000000-0000-4000-8000-000000000003');
    expect(evaluationFixtureTimes.observedAt).toBe('2026-07-09T10:00:00.000Z');
    expect(evaluationModerator.email).toBe('moderator@example.invalid');
  });

  it('retries startup until the application is healthy', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const response = await waitForHealth({
      url: 'http://127.0.0.1:4173/api/health',
      timeoutMs: 1_000,
      fetchImplementation,
      sleep: async () => undefined
    });

    expect(response.status).toBe(200);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('rejects a healthy response from a different managed evaluation server', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'x-hundavaent-evaluation-server': 'foreign-server' }
        })
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'x-hundavaent-evaluation-server': 'expected-server' }
        })
      );

    const response = await waitForHealth({
      url: 'http://127.0.0.1:4173/api/health',
      timeoutMs: 1_000,
      fetchImplementation,
      sleep: async () => undefined,
      acceptResponse: (candidate) =>
        candidate.headers.get('x-hundavaent-evaluation-server') === 'expected-server'
    });

    expect(response.headers.get('x-hundavaent-evaluation-server')).toBe('expected-server');
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('retries until the exact release and required health checks are ready', async () => {
    const healthResponse = (release: string, translations: string) =>
      Response.json({
        release,
        checks: { database: 'ready', map: 'configured', translations }
      });
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(healthResponse('stale-release', 'published'))
      .mockResolvedValueOnce(healthResponse('expected-release', 'fallback'))
      .mockResolvedValueOnce(healthResponse('expected-release', 'published'));

    const response = await waitForHealth({
      url: 'https://hundavaent.is/api/health',
      expectedRelease: 'expected-release',
      expectedChecks: {
        database: 'ready',
        map: 'configured',
        translations: 'published'
      },
      timeoutMs: 1_000,
      fetchImplementation,
      sleep: async () => undefined
    });

    expect(await response.json()).toMatchObject({ release: 'expected-release' });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it('parses explicit release requirements without changing the default local caller', () => {
    expect(parseWaitForHealthArguments([], {})).toEqual({
      url: 'http://127.0.0.1:4173/api/health'
    });
    expect(
      parseWaitForHealthArguments([
        'https://hundavaent.is/api/health',
        '--expected-release',
        'release-sha',
        '--expected-check',
        'database=ready',
        '--expected-check',
        'translations=published'
      ])
    ).toEqual({
      url: 'https://hundavaent.is/api/health',
      expectedRelease: 'release-sha',
      expectedChecks: { database: 'ready', translations: 'published' }
    });
  });

  it('refuses evaluation administration against a remote Supabase origin', () => {
    expect(() => assertLocalEvaluationUrl('http://127.0.0.1:55321')).not.toThrow();
    expect(() => assertLocalEvaluationUrl('https://project.supabase.co')).toThrow(
      'Evaluation administration requires a local origin'
    );
  });

  it('binds fail-closed auth flags and the database capability into exact-SHA production releases', () => {
    const workflow = readFileSync(
      resolve(import.meta.dirname, '../../../.github/workflows/production.yml'),
      'utf8'
    );

    expect(workflow).toContain('HUNDAVAENT_PRODUCTION_AUTH_EMAIL_ENABLED');
    expect(workflow).toContain('HUNDAVAENT_PRODUCTION_AUTH_FACEBOOK_ENABLED');
    expect(workflow).toContain('HUNDAVAENT_PRODUCTION_MEMBER_ACTIVATION_SECRET');
    expect(workflow).toContain('configure_member_activation_capability');
    expect(workflow).not.toContain('PGOPTIONS=');
    expect(workflow).not.toContain("current_setting('app.member_activation_secret')");
    expect(workflow).toContain(
      'psql -v ON_ERROR_STOP=1 -v activation_secret="${MEMBER_ACTIVATION_SECRET}" "${db_url}" <<\'SQL\''
    );
    expect(workflow).toContain(
      "select public.configure_member_activation_capability(:'activation_secret');"
    );
    expect(workflow).toContain('app_fingerprint');
    expect(workflow).toContain('db_fingerprint');
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "${RELEASE_SHA}"');
  });
});
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
