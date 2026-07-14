import { expect, type Page } from '@playwright/test';

export async function waitForHydration(page: Page): Promise<void> {
  await expect(page.locator('[data-app-hydrated="true"]')).toBeAttached();
}
