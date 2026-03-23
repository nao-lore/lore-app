import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('threadlog_onboarding_done', '1');
    localStorage.setItem('threadlog_sample_seeded', '1');
  });
  await page.reload();
  await page.waitForSelector('.sidebar', { timeout: 10000 });
});

test('app loads with Lore title', async ({ page }) => {
  await expect(page).toHaveTitle(/Lore/);
});

test('sidebar shows app name and New Snapshot button', async ({ page }) => {
  await expect(page.getByText('Lore', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ New Snapshot' })).toBeVisible();
});

test('navigate to Dashboard via sidebar', async ({ page }) => {
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Dashboard' }).click();
  await expect(page.locator('.sidebar-nav-item.active').filter({ hasText: 'Dashboard' })).toBeVisible();
});

test('navigate to TODO via sidebar', async ({ page }) => {
  await page.locator('.sidebar-nav-item').filter({ hasText: 'TODO' }).click();
  await expect(page.locator('.sidebar-nav-item.active').filter({ hasText: 'TODO' })).toBeVisible();
});

test('navigate to Logs via sidebar', async ({ page }) => {
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Logs' }).first().click();
  await page.click('body');
  await expect(page.locator('.sidebar-nav-item.active').filter({ hasText: 'Logs' }).first()).toBeVisible();
});

test('navigate to Projects via sidebar', async ({ page }) => {
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Projects' }).click();
  await expect(page.locator('.sidebar-nav-item.active').filter({ hasText: 'Projects' })).toBeVisible();
});

test('navigate to Settings via account menu', async ({ page }) => {
  await page.locator('.account-trigger').click();
  await page.locator('.account-popover-item').filter({ hasText: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 10000 });
});

test('navigate to Pricing via account menu', async ({ page }) => {
  await page.locator('.account-trigger').click();
  const pricingItem = page.locator('.account-popover-item').filter({ hasText: /Pricing|料金/ });
  await expect(pricingItem).toBeVisible();
});
