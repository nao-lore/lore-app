import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('threadlog_onboarding_done', '1');
    localStorage.setItem('threadlog_sample_seeded', '1');
  });
  await page.reload();
});

function goToSettings(page: import('@playwright/test').Page) {
  return test.step('navigate to settings', async () => {
    await page.locator('.account-trigger').click();
    await page.getByText('Settings').click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });
}

test('change theme to Dark and verify data-theme attribute', async ({ page }) => {
  await goToSettings(page);

  // Click Dark theme button
  await page.getByRole('button', { name: 'Dark' }).click();

  // Verify the data-theme attribute on html element
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('change theme to Light and verify data-theme attribute', async ({ page }) => {
  await goToSettings(page);

  await page.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('change UI language to Japanese and back to English', async ({ page }) => {
  await goToSettings(page);

  // Switch to Japanese (button shows flag + label)
  await page.locator('button', { hasText: '日本語' }).click();

  // Settings title should now be in Japanese
  await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();

  // The "Back" button should be in Japanese
  await expect(page.getByText('← 戻る')).toBeVisible();

  // Switch back to English
  await page.locator('button', { hasText: 'English' }).click();

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('language preference persists across page reload', async ({ page }) => {
  await goToSettings(page);

  // Switch to Japanese
  await page.locator('button', { hasText: '日本語' }).click();
  await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();

  // Reload the page
  await page.reload();

  // Sidebar should show Japanese text
  await expect(page.getByText('ホーム').first()).toBeVisible();
});
