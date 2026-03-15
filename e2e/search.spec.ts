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

test('open command palette with Cmd+K', async ({ page }) => {
  await page.locator('body').click();
  await page.keyboard.press('Meta+k');
  await expect(page.getByPlaceholder('Search logs, projects, todos...')).toBeVisible();
});

test('command palette shows recent logs', async ({ page }) => {
  // Seed some logs and mark onboarding done
  await page.evaluate(() => {
    const logs = [
      {
        id: 'log-1',
        title: 'Database Migration Plan',
        createdAt: new Date().toISOString(),
        today: ['Planned DB migration'],
        decisions: ['Use PostgreSQL'],
        todo: [],
        relatedProjects: [],
        tags: [],
        outputMode: 'worklog',
      },
      {
        id: 'log-2',
        title: 'API Endpoint Review',
        createdAt: new Date().toISOString(),
        today: ['Reviewed endpoints'],
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

  // Ensure page has focus before keyboard shortcut
  await page.locator('body').click();
  await page.keyboard.press('Meta+k');
  await expect(page.getByPlaceholder('Search logs, projects, todos...')).toBeVisible({ timeout: 10000 });

  // Should show recent logs without typing
  await expect(page.getByText('Database Migration Plan')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('API Endpoint Review')).toBeVisible({ timeout: 10000 });
});

test('command palette filters results by search query', async ({ page }) => {
  // Seed logs
  await page.evaluate(() => {
    const logs = [
      {
        id: 'log-a',
        title: 'Frontend Refactor',
        createdAt: new Date().toISOString(),
        today: ['Refactored components'],
        decisions: [],
        todo: [],
        relatedProjects: [],
        tags: ['react'],
        outputMode: 'worklog',
      },
      {
        id: 'log-b',
        title: 'Backend API Fix',
        createdAt: new Date().toISOString(),
        today: ['Fixed API bug'],
        decisions: [],
        todo: [],
        relatedProjects: [],
        tags: ['nodejs'],
        outputMode: 'worklog',
      },
    ];
    localStorage.setItem('threadlog_logs', JSON.stringify(logs));
    localStorage.setItem('threadlog_onboarding_done', '1');
  });
  await page.reload();
  await page.waitForSelector('.sidebar', { timeout: 10000 });

  // Ensure page has focus before keyboard shortcut
  await page.locator('body').click();
  await page.keyboard.press('Meta+k');
  await expect(page.getByPlaceholder('Search logs, projects, todos...')).toBeVisible({ timeout: 10000 });

  // Type search query
  await page.getByPlaceholder('Search logs, projects, todos...').fill('Frontend');

  // Should show matching log
  await expect(page.getByText('Frontend Refactor')).toBeVisible();
  // Should not show non-matching log
  await expect(page.getByText('Backend API Fix')).not.toBeVisible();
});

test('command palette closes on Escape', async ({ page }) => {
  await page.locator('body').click();
  await page.keyboard.press('Meta+k');
  await expect(page.getByPlaceholder('Search logs, projects, todos...')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByPlaceholder('Search logs, projects, todos...')).not.toBeVisible();
});
