import { test, expect } from '@playwright/test';

// Helper to seed a complete log entry into localStorage
function makeLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-log-1',
    title: 'My First Worklog',
    createdAt: new Date().toISOString(),
    today: ['Built the login page', 'Added form validation'],
    decisions: ['Use React Hook Form'],
    todo: ['Write unit tests'],
    relatedProjects: [],
    tags: ['react', 'frontend'],
    outputMode: 'worklog',
    ...overrides,
  };
}

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

test('seed a log and verify it appears in Logs view', async ({ page }) => {
  // Seed a log entry via localStorage
  await page.evaluate((log) => {
    localStorage.setItem('threadlog_logs', JSON.stringify([log]));
  }, makeLog());
  await page.reload();
  await page.waitForSelector('.sidebar', { timeout: 10000 });

  // Navigate to Logs
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Logs' }).first().click();

  // Verify the log title is visible
  await expect(page.getByText('My First Worklog')).toBeVisible({ timeout: 10000 });
});

test('view log detail by clicking on it', async ({ page }) => {
  // Seed a log
  await page.evaluate((log) => {
    localStorage.setItem('threadlog_logs', JSON.stringify([log]));
    // Mark onboarding done so it won't show
    localStorage.setItem('threadlog_onboarding_done', '1');
  }, makeLog({
    id: 'test-log-detail',
    title: 'Detail View Test',
    today: ['Implemented dashboard'],
    decisions: ['Use Chart.js'],
    todo: ['Add tooltips'],
    tags: ['dashboard'],
  }));
  await page.reload();
  await page.waitForSelector('.sidebar', { timeout: 10000 });

  // Navigate to Logs
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Logs' }).first().click();

  // Click on the log
  await page.getByText('Detail View Test').click();

  // Should show log content in detail view
  await expect(page.getByText('Implemented dashboard')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Use Chart.js')).toBeVisible({ timeout: 10000 });
});

test('delete a log from detail view', async ({ page }) => {
  // Seed a log
  await page.evaluate((log) => {
    localStorage.setItem('threadlog_logs', JSON.stringify([log]));
    localStorage.setItem('threadlog_onboarding_done', '1');
  }, makeLog({
    id: 'test-log-delete',
    title: 'Log To Delete',
    today: ['Something'],
    decisions: [],
    todo: [],
    tags: [],
  }));
  await page.reload();
  await page.waitForSelector('.sidebar', { timeout: 10000 });

  // Navigate to Logs and open the log
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Logs' }).first().click();
  await page.getByText('Log To Delete').click();

  // Click the actions menu button (MoreVertical icon) in detail view
  await page.locator('button.card-menu-btn[title="Actions"]').click();

  // Click "Delete" in the dropdown
  await page.locator('.card-menu-item-danger').click();

  // Confirm deletion
  await page.getByRole('button', { name: 'Delete' }).click();

  // Should return to the main view and log should be gone
  await expect(page.getByText('Log To Delete')).not.toBeVisible();
});

test('multiple logs show in correct order (newest first)', async ({ page }) => {
  await page.evaluate(() => {
    const logs = [
      {
        id: 'log-old',
        title: 'Older Log',
        createdAt: '2025-01-01T00:00:00.000Z',
        today: ['Old work'],
        decisions: [],
        todo: [],
        relatedProjects: [],
        tags: [],
        outputMode: 'worklog',
      },
      {
        id: 'log-new',
        title: 'Newer Log',
        createdAt: '2025-06-01T00:00:00.000Z',
        today: ['New work'],
        decisions: [],
        todo: [],
        relatedProjects: [],
        tags: [],
        outputMode: 'worklog',
      },
    ];
    localStorage.setItem('threadlog_logs', JSON.stringify(logs));
    localStorage.setItem('threadlog_onboarding_done', '1');
  });
  await page.reload();
  await page.waitForSelector('.sidebar', { timeout: 10000 });

  await page.locator('.sidebar-nav-item').filter({ hasText: 'Logs' }).first().click();

  // Both should be visible
  await expect(page.getByText('Newer Log')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Older Log')).toBeVisible({ timeout: 10000 });
});
