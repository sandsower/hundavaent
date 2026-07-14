import { describe, expect, it, vi } from 'vitest';

import {
  EVALUATION_FIXTURE_VERSION,
  evaluationFixtureIds,
  evaluationFixtureTimes,
  evaluationModerator
} from '$server/evaluation/fixtures';
import { waitForHealth } from '../../../scripts/wait-for-health';
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

  it('refuses evaluation administration against a remote Supabase origin', () => {
    expect(() => assertLocalEvaluationUrl('http://127.0.0.1:55321')).not.toThrow();
    expect(() => assertLocalEvaluationUrl('https://project.supabase.co')).toThrow(
      'Evaluation administration requires a local origin'
    );
  });
});
