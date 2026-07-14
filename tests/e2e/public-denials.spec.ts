import { expect, test } from '@playwright/test';

import { evaluationFixtureIds } from '../evaluation/fixtures';
import { getLocalSupabaseStatus } from './support/local-supabase';

test('a signed-out Visitor cannot open the moderation workspace', async ({ page }) => {
  await page.goto('/is/moderation');

  await expect(page).toHaveURL('/is/moderation/sign-in?returnTo=%2Fis%2Fmoderation');
  await expect(page.getByRole('heading', { name: 'Innskráning umsjónaraðila' })).toBeVisible();
});

test('an anonymous caller cannot invoke publication', async ({ request }) => {
  const status = getLocalSupabaseStatus();
  const response = await request.post(`${status.apiUrl}/rest/v1/rpc/verify_and_publish_place`, {
    headers: {
      apikey: status.publishableKey,
      Authorization: `Bearer ${status.publishableKey}`,
      'Content-Type': 'application/json'
    },
    data: {
      command_payload: {
        place_id: evaluationFixtureIds.places.candidate,
        expected_version: 1,
        access_condition_id: evaluationFixtureIds.publishedAccessCondition,
        evidence_ids: [evaluationFixtureIds.publishedEvidence],
        freshness_until: '2099-01-01T00:00:00.000Z',
        decision_metadata: {}
      },
      command_request_id: '89000000-0000-4000-8000-000000000001'
    }
  });

  expect(response.ok()).toBe(false);
  expect([401, 403, 404]).toContain(response.status());
});

test('a direct public Candidate URL reveals no private Place', async ({ page }) => {
  const response = await page.goto(`/en/places/${evaluationFixtureIds.places.candidate}`);

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByText(/^Reference: [A-Za-z0-9_-]{8,128}$/)).toBeVisible();
});

test('health reports only redacted readiness with a correlated request ID', async ({ request }) => {
  const localSupabase = getLocalSupabaseStatus();
  const response = await request.get('/api/health', {
    headers: { 'x-request-id': 'health-test-123' }
  });

  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(response.headers()['x-request-id']).toBe('health-test-123');
  const body = await response.json();
  expect(body).toEqual({
    service: 'hundavaent',
    status: 'ok',
    checks: { database: 'ready', map: 'fallback' },
    requestId: 'health-test-123'
  });
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain(localSupabase.publishableKey);
  expect(serialized).not.toContain(localSupabase.secretKey);
  expect(serialized).not.toContain(evaluationFixtureIds.places.candidate);
});

test('public and Moderator responses use hardened origin and cache policies', async ({
  request
}) => {
  const localSupabase = getLocalSupabaseStatus();
  const publicResponse = await request.get('/en');
  const publicHeaders = publicResponse.headers();
  const connectSources = publicHeaders['content-security-policy']
    .split(';')
    .map((directive) => directive.trim().split(/\s+/))
    .find(([name]) => name === 'connect-src')
    ?.slice(1);

  expect(publicHeaders['content-security-policy']).toContain("default-src 'self'");
  expect(publicHeaders['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(publicHeaders['content-security-policy']).toContain(new URL(localSupabase.apiUrl).origin);
  expect(connectSources).toContain('https://api.maptiler.com');
  expect(publicHeaders['content-security-policy']).not.toContain('fundid');
  expect(publicHeaders['x-content-type-options']).toBe('nosniff');
  expect(publicHeaders['x-frame-options']).toBe('DENY');
  expect(publicHeaders['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(publicHeaders['permissions-policy']).toBe('camera=(), microphone=(), geolocation=(self)');
  expect(publicHeaders['cache-control']).toBe(
    'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
  );
  expect(publicHeaders['vary']).toContain('Cookie');
  expect(publicHeaders['strict-transport-security']).toBeUndefined();

  const moderatorResponse = await request.get('/en/moderation/sign-in');
  expect(moderatorResponse.headers()['cache-control']).toBe('private, no-store');
});
