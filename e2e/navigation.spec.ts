import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Clear localStorage before each test, then navigate
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    // Skip onboarding and sample data seeding for clean test state
    localStorage.setItem('threadlog_onboarding_done', '1');
    localStorage.setItem('threadlog_sample_seeded', '1');
  });
  await page.reload();
});

test('app loads with Lore title', async ({ page }) => {
  await expect(page).toHaveTitle(/Lore/);
});

test('sidebar shows app name and Create Log button', async ({ page }) => {
  await expect(page.getByText('Lore', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Create Log' })).toBeVisible();
});

test('navigate to Dashboard via sidebar', async ({ page }) => {
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Dashboard' }).click();
  // Dashboard view should render
  await expect(page.locator('.workspace-content, .workspace-content-wide').first()).toBeVisible();
});

test('navigate to TODO via sidebar', async ({ page }) => {
  await page.locator('.sidebar-nav-item').filter({ hasText: 'TODO' }).click();
  // Verify TODO view loaded by checking the sidebar item is active
  await expect(page.locator('.sidebar-nav-item.active').filter({ hasText: 'TODO' })).toBeVisible();
});

test('navigate to Timeline via sidebar', async ({ page }) => {
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Timeline' }).click();
  await expect(page.locator('.workspace-content, .workspace-content-wide').first()).toBeVisible();
});

test('navigate to Logs via sidebar', async ({ page }) => {
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Logs' }).first().click();
  await expect(page.locator('.workspace-content, .workspace-content-wide').first()).toBeVisible();
});

test('navigate to Projects via sidebar', async ({ page }) => {
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Projects' }).click();
  await expect(page.getByText('No projects yet')).toBeVisible();
});

test('navigate to Settings via account menu', async ({ page }) => {
  // Click account trigger at the bottom of sidebar
  await page.locator('.account-trigger').click();
  await page.locator('.account-popover-item').filter({ hasText: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});
