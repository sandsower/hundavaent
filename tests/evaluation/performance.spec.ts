import type { Page } from '@playwright/test';

import { expect, test, type EvaluationEvidenceRecorder } from './evidence-fixture';
import { evaluationFixtureIds } from './fixtures';

declare global {
  interface Window {
    __hundavaentCls: number;
  }
}

const budgets = {
  directoryTtfbMs: 1_000,
  mapJavaScriptBytes: 1_500_000,
  mapInteractiveMs: 2_500,
  overlayJavaScriptBytes: 100_000,
  overlayInteractiveMs: 500,
  cumulativeLayoutShift: 0.1
} as const;

interface RouteMetrics {
  ttfbMs: number;
  javaScriptBytes: number;
  cumulativeLayoutShift: number;
  mapLibreResources: string[];
}

async function installLayoutShiftObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__hundavaentCls', {
      configurable: true,
      value: 0,
      writable: true
    });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
        };
        if (!shift.hadRecentInput) {
          window.__hundavaentCls += shift.value;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

async function readRouteMetrics(page: Page): Promise<RouteMetrics> {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const scripts = resources.filter((resource) => resource.initiatorType === 'script');
    return {
      ttfbMs: navigation.responseStart - navigation.requestStart,
      javaScriptBytes: scripts.reduce((total, resource) => total + resource.decodedBodySize, 0),
      cumulativeLayoutShift: window.__hundavaentCls ?? 0,
      mapLibreResources: resources
        .map((resource) => resource.name)
        .filter((name) => name.toLowerCase().includes('maplibre'))
    };
  });
}

function trackNetworkFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on('requestfailed', (request) => {
    failures.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failures.push(`${response.request().method()} ${response.url()}: ${response.status()}`);
    }
  });
  return failures;
}

function recordBudget(
  evidence: EvaluationEvidenceRecorder,
  name: string,
  value: number,
  unit: string,
  budget: number
): void {
  evidence.require('timing');
  evidence.recordTiming({ name, value, unit, budget, passed: value <= budget });
}

test('the mobile map-first directory stays within load and interaction budgets', async ({
  page,
  evidence
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installLayoutShiftObserver(page);
  const networkFailures = trackNetworkFailures(page);

  const startedAt = Date.now();
  const response = await page.goto('/en?view=map');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Published Place', exact: true })).toBeVisible();
  const mapInteractiveMs = Date.now() - startedAt;
  await page.waitForLoadState('networkidle');

  const metrics = await readRouteMetrics(page);
  recordBudget(evidence, 'directory-ttfb', metrics.ttfbMs, 'ms', budgets.directoryTtfbMs);
  recordBudget(
    evidence,
    'map-javascript',
    metrics.javaScriptBytes,
    'bytes',
    budgets.mapJavaScriptBytes
  );
  recordBudget(evidence, 'map-interactive', mapInteractiveMs, 'ms', budgets.mapInteractiveMs);
  recordBudget(
    evidence,
    'directory-layout-shift',
    metrics.cumulativeLayoutShift,
    'score',
    budgets.cumulativeLayoutShift
  );
  expect(metrics.ttfbMs).toBeLessThanOrEqual(budgets.directoryTtfbMs);
  expect(metrics.javaScriptBytes).toBeLessThanOrEqual(budgets.mapJavaScriptBytes);
  expect(mapInteractiveMs).toBeLessThanOrEqual(budgets.mapInteractiveMs);
  expect(metrics.cumulativeLayoutShift).toBeLessThanOrEqual(budgets.cumulativeLayoutShift);
  expect(metrics.mapLibreResources.length).toBeGreaterThan(0);
  expect(networkFailures).toEqual([]);
});

test('the selected Place overlay responds without another large JavaScript load', async ({
  page,
  evidence
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const networkFailures = trackNetworkFailures(page);
  await page.goto('/en?view=map');
  const marker = page.getByRole('button', { name: 'Published Place', exact: true });
  await expect(marker).toBeVisible();
  await page.waitForLoadState('networkidle');

  const initialMetrics = await readRouteMetrics(page);
  const startedAt = Date.now();
  await marker.click();
  await expect(page.getByRole('complementary', { name: 'Selected place' })).toBeVisible();
  const overlayInteractiveMs = Date.now() - startedAt;
  await page.waitForLoadState('networkidle');
  const selectedMetrics = await readRouteMetrics(page);
  const overlayJavaScriptBytes = selectedMetrics.javaScriptBytes - initialMetrics.javaScriptBytes;

  recordBudget(
    evidence,
    'overlay-interactive',
    overlayInteractiveMs,
    'ms',
    budgets.overlayInteractiveMs
  );
  recordBudget(
    evidence,
    'overlay-javascript',
    overlayJavaScriptBytes,
    'bytes',
    budgets.overlayJavaScriptBytes
  );
  expect(overlayInteractiveMs).toBeLessThanOrEqual(budgets.overlayInteractiveMs);
  expect(overlayJavaScriptBytes).toBeLessThanOrEqual(budgets.overlayJavaScriptBytes);
  expect(networkFailures).toEqual([]);
});

test('the floating public access details meet the route budget without failed requests', async ({
  page,
  evidence
}) => {
  await installLayoutShiftObserver(page);
  const networkFailures = trackNetworkFailures(page);
  const response = await page.goto(`/en?place=${evaluationFixtureIds.places.published}`);
  expect(response?.status()).toBe(200);
  const selectedCard = page.getByRole('complementary', { name: 'Selected place' });
  await expect(selectedCard).toBeVisible();
  await selectedCard.locator('summary').click();
  await expect(selectedCard.getByRole('heading', { name: 'Dog access' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  const metrics = await readRouteMetrics(page);
  recordBudget(evidence, 'access-details-ttfb', metrics.ttfbMs, 'ms', budgets.directoryTtfbMs);
  recordBudget(
    evidence,
    'access-details-javascript',
    metrics.javaScriptBytes,
    'bytes',
    budgets.mapJavaScriptBytes
  );
  recordBudget(
    evidence,
    'access-details-layout-shift',
    metrics.cumulativeLayoutShift,
    'score',
    budgets.cumulativeLayoutShift
  );
  expect(metrics.ttfbMs).toBeLessThanOrEqual(budgets.directoryTtfbMs);
  expect(metrics.javaScriptBytes).toBeLessThanOrEqual(budgets.mapJavaScriptBytes);
  expect(metrics.cumulativeLayoutShift).toBeLessThanOrEqual(budgets.cumulativeLayoutShift);
  expect(metrics.mapLibreResources.length).toBeGreaterThan(0);
  expect(networkFailures).toEqual([]);
});
