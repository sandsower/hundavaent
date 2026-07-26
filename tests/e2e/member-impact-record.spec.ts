import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  backdateLocalMemberAccountForImpact,
  configureLocalAchievementPolicy,
  disableLocalAchievementPolicy,
  getLocalSupabaseStatus,
  provisionLocalAchievementProgress,
  provisionLocalConfirmedContribution,
  provisionLocalModerator,
  provisionLocalUnavailableContributionSuccessor,
  waitForLocalMagicLink
} from './support/local-supabase';
import { waitForHydration } from './support/hydration';

const moderatorEmail = 'impact-record-moderator@example.invalid';

test.beforeAll(async () => {
  await configureLocalAchievementPolicy();
  await provisionLocalModerator(moderatorEmail);
});

test.afterAll(async () => {
  await disableLocalAchievementPolicy();
});

test('a Member can see a private bilingual impact record with honest durable outcomes', async ({
  page,
  request
}) => {
  test.setTimeout(60_000);
  const email = `impact-record-${Date.now()}@example.invalid`;
  await signInMember(page, email);
  await backdateLocalMemberAccountForImpact(email);
  await provisionLocalAchievementProgress(email);
  const contribution = await provisionLocalConfirmedContribution(email, moderatorEmail);
  await provisionLocalUnavailableContributionSuccessor(contribution, moderatorEmail);

  await page.goto('/en/account');
  const impactLink = page.getByRole('link', { name: 'See my impact' });
  await expect(impactLink).toBeVisible();
  await impactLink.click();

  await expect(page).toHaveURL('/en/account/impact');
  await expect(page.getByRole('heading', { name: 'Your impact', level: 1 })).toBeVisible();
  await expect(page.locator('[data-impact-pillar]')).toHaveCount(4);
  await expect(page.getByText('Only you can see this page.')).toBeVisible();
  await expect(page.getByText('Contribution status fixture')).toBeVisible();
  await expect(page.locator('[data-outcome-state="confirmed"]')).toHaveCount(1);
  await expect(
    page.getByText(
      'Continues as Unpublished successor, which is not currently available in discovery.'
    )
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Unpublished successor/ })).toHaveCount(0);
  await expect(page.getByText('confirmed useful').locator('..').getByText('1')).toBeVisible();
  await expect(page.getByText('credited places').locator('..').getByText('3')).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);

  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/leaderboard|top member|stigatafla|\bXP\b/i);

  await page.goto('/is/account/impact');
  await expect(page.getByRole('heading', { name: 'Áhrifin þín', level: 1 })).toBeVisible();
  await expect(page.getByText('Aðeins þú getur séð þessa síðu.')).toBeVisible();
  await expect(page.getByText('Framlagsstaða prófun')).toBeVisible();
  await expect(
    page.getByText('Framhald: Óbirtur eftirmaður. Staðurinn er ekki tiltækur í leit núna.')
  ).toBeVisible();
  await expect(page.locator('[data-impact-pillar]').last()).toHaveCSS('opacity', '1');

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    axe.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    )
  ).toEqual([]);

  const status = getLocalSupabaseStatus();
  const response = await request.post(`${status.apiUrl}/rest/v1/rpc/get_my_impact_record`, {
    headers: {
      apikey: status.publishableKey,
      Authorization: `Bearer ${status.publishableKey}`,
      'Content-Type': 'application/json'
    },
    data: { requested_locale: 'en' }
  });
  expect(response.ok()).toBe(false);
  expect([401, 403, 404]).toContain(response.status());
});

test('the impact record is responsive and motion-safe at a representative mobile viewport', async ({
  page
}) => {
  test.setTimeout(60_000);
  const email = `impact-mobile-${Date.now()}@example.invalid`;
  await signInMember(page, email);
  await backdateLocalMemberAccountForImpact(email);
  await provisionLocalAchievementProgress(email);
  await provisionLocalConfirmedContribution(email, moderatorEmail);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/en/account/impact');
  await waitForHydration(page);

  await expect(page.getByRole('heading', { name: 'Your impact', level: 1 })).toBeVisible();
  await expect(page.locator('[data-impact-pillar]')).toHaveCount(4);
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  // The page rides the token families: reduced motion zeroes every travelling duration while
  // the hero's fade half keeps appearing at full duration, and the ambient orbits suppress
  // themselves with animation: none at their use sites. Names stay; durations tell the story.
  await expect(page.locator('.hero-mark')).toHaveCSS('animation-duration', '0s, 0.26s');
  for (const orbit of await page.locator('.orbit-one, .orbit-two').all()) {
    await expect(orbit).toHaveCSS('animation-name', 'none');
  }
  for (const pillar of await page.locator('[data-impact-pillar]').all()) {
    await expect(pillar).toHaveCSS('animation-duration', '0s');
    await expect(pillar).toHaveCSS('animation-delay', /^0s/);
  }

  await page.screenshot({
    path: 'test-results/e2e/impact-record-mobile.png',
    fullPage: true,
    animations: 'disabled',
    caret: 'hide'
  });
});

test('Visitors are redirected before private impact data is rendered', async ({ page }) => {
  const path = '/en/account/impact';
  await page.goto(path);
  await expect(page).toHaveURL(`/en?auth=open&authReturnTo=${encodeURIComponent(path)}`);
  await expect(page.getByRole('dialog').getByLabel('Email address')).toBeVisible();
  await expect(page.locator('[data-impact-record]')).toHaveCount(0);
});

async function signInMember(page: Page, email: string): Promise<void> {
  await page.goto('/en/account');
  await waitForHydration(page);
  await page.getByRole('dialog').getByLabel('Email address').fill(email);
  await page.getByRole('dialog').getByRole('button', { name: 'Send me a sign-in link' }).click();
  await page.goto(await waitForLocalMagicLink(email));
  await waitForHydration(page);
}
