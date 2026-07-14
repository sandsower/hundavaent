import { describe, expect, it, vi } from 'vitest';

import { createDeploymentContext, createTelemetryLogger } from '$server/telemetry/logger';

describe('redacted telemetry logger', () => {
  it('writes structured objects to the runtime console for field indexing', () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createTelemetryLogger(undefined, () => ({
      environment: 'production',
      release: '7538d1ad8538'
    }));

    logger.healthFailure({ requestId: 'health-request', check: 'database' });

    expect(write).toHaveBeenCalledWith({
      level: 'error',
      event: 'health.unavailable',
      environment: 'production',
      release: '7538d1ad8538',
      requestId: 'health-request',
      check: 'database'
    });
    write.mockRestore();
  });

  it('serializes only the approved request error fields', () => {
    const write = vi.fn();
    const logger = createTelemetryLogger(write, () => ({
      environment: 'production',
      release: '7538d1ad8538'
    }));

    logger.serverError({
      requestId: 'request-123',
      method: 'POST',
      routeId: '/[lang=lang]/moderation/places/[id]',
      status: 500,
      errorType: 'DatabaseError'
    });

    expect(JSON.parse(write.mock.calls[0][0])).toEqual({
      level: 'error',
      event: 'request.error',
      environment: 'production',
      release: '7538d1ad8538',
      requestId: 'request-123',
      method: 'POST',
      routeId: '/[lang=lang]/moderation/places/[id]',
      status: 500,
      errorType: 'DatabaseError'
    });
    expect(write.mock.calls[0][0]).not.toContain('token');
    expect(write.mock.calls[0][0]).not.toContain('message');
  });

  it('records returned server failures and slow requests without request data', () => {
    const write = vi.fn();
    const logger = createTelemetryLogger(write, () => ({
      environment: 'preview',
      release: 'abcdef123456'
    }));

    logger.serverFailure({
      requestId: 'request-503',
      method: 'GET',
      routeId: '/[lang=lang]',
      status: 503,
      durationMs: 42
    });
    logger.slowRequest({
      requestId: 'request-slow',
      method: 'GET',
      routeId: '/[lang=lang]/places/[id]',
      status: 200,
      durationMs: 1_250
    });

    expect(JSON.parse(write.mock.calls[0][0])).toEqual({
      level: 'error',
      event: 'request.failed',
      environment: 'preview',
      release: 'abcdef123456',
      requestId: 'request-503',
      method: 'GET',
      routeId: '/[lang=lang]',
      status: 503,
      durationMs: 42
    });
    expect(JSON.parse(write.mock.calls[1][0])).toEqual({
      level: 'warn',
      event: 'request.slow',
      environment: 'preview',
      release: 'abcdef123456',
      requestId: 'request-slow',
      method: 'GET',
      routeId: '/[lang=lang]/places/[id]',
      status: 200,
      durationMs: 1_250
    });
    expect(write.mock.calls.flat().join(' ')).not.toContain('cookie');
    expect(write.mock.calls.flat().join(' ')).not.toContain('query');
  });

  it('accepts only bounded deployment labels and release identifiers', () => {
    expect(
      createDeploymentContext({
        APP_ENVIRONMENT: 'production',
        APP_RELEASE: '7538d1ad8538436bb2a81d0faf4333adff80c9a8'
      })
    ).toEqual({
      environment: 'production',
      release: '7538d1ad8538436bb2a81d0faf4333adff80c9a8'
    });
    expect(
      createDeploymentContext({
        APP_ENVIRONMENT: 'production secret=value',
        APP_RELEASE: 'not a commit sha'
      })
    ).toEqual({ environment: 'unknown', release: 'unknown' });
  });
});
