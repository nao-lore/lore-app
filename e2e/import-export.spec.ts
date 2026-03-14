import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

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
    await page.locator('.account-popover-item').filter({ hasText: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });
}

test('export data downloads a JSON file', async ({ page }) => {
  // Seed some data and mark onboarding as done
  await page.evaluate(() => {
    const log = {
      id: 'export-log-1',
      title: 'Export Test Log',
      createdAt: new Date().toISOString(),
      today: ['Test data'],
      decisions: [],
      todo: [],
      relatedProjects: [],
      tags: [],
      outputMode: 'worklog',
    };
    localStorage.setItem('threadlog_logs', JSON.stringify([log]));
    localStorage.setItem('threadlog_onboarding_done', '1');
  });
  await page.reload();

  await goToSettings(page);

  // Wait for download when clicking export
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Data' }).click();
  const download = await downloadPromise;

  // Verify the download file name
  expect(download.suggestedFilename()).toMatch(/^lore-backup-\d{4}-\d{2}-\d{2}\.json$/);

  // Save and verify content
  const filePath = path.join('/tmp', download.suggestedFilename());
  await download.saveAs(filePath);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // The export format uses { version, exportedAt, data: { threadlog_logs: [...] } }
  expect(content).toHaveProperty('version', 1);
  expect(content).toHaveProperty('data');
  expect(content.data).toHaveProperty('threadlog_logs');
  expect(content.data.threadlog_logs).toHaveLength(1);
  expect(content.data.threadlog_logs[0].title).toBe('Export Test Log');

  // Cleanup
  fs.unlinkSync(filePath);
});

test('import data from a JSON file', async ({ page }) => {
  // Mark onboarding as done
  await page.evaluate(() => {
    localStorage.setItem('threadlog_onboarding_done', '1');
  });
  await page.reload();

  await goToSettings(page);

  // Create a backup file to import using the actual backup format
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      threadlog_logs: [
        {
          id: 'imported-log-1',
          title: 'Imported Log Entry',
          createdAt: new Date().toISOString(),
          today: ['Imported item'],
          decisions: [],
          todo: [],
          relatedProjects: [],
          tags: [],
          outputMode: 'worklog',
        },
      ],
    },
  };

  const importFilePath = path.join('/tmp', 'test-import.json');
  fs.writeFileSync(importFilePath, JSON.stringify(backup));

  // Trigger file import
  const fileInput = page.locator('input[type="file"][accept=".json"]');
  await fileInput.setInputFiles(importFilePath);

  // Confirm import — click the confirm button in the dialog footer
  await page.getByRole('button', { name: 'Merge with current data', exact: true }).click();

  // Go back from Settings, then navigate to Logs
  await page.getByText('← Back').click();
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Logs' }).first().click();

  await expect(page.getByText('Imported Log Entry')).toBeVisible();

  // Cleanup
  fs.unlinkSync(importFilePath);
});
