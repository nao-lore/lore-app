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

test('create a new project', async ({ page }) => {
  // Navigate to Projects
  await page.locator('.sidebar-nav-item').filter({ hasText: 'Projects' }).click();
  await expect(page.getByText('No projects yet')).toBeVisible();

  // Click the "Add Project" button in the empty state (there may be two, use first visible)
  await page.getByRole('button', { name: 'Add Project' }).first().click();

  // Type name and submit
  await page.getByPlaceholder('Project name').fill('Test Project Alpha');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // Verify project appears in the list
  await expect(page.getByText('Test Project Alpha')).toBeVisible();
});

test('rename a project', async ({ page }) => {
  // Seed a project via localStorage
  await page.evaluate(() => {
    const project = {
      id: 'proj-1',
      name: 'Original Name',
      createdAt: Date.now(),
    };
    localStorage.setItem('threadlog_projects', JSON.stringify([project]));
    localStorage.setItem('threadlog_onboarding_done', '1');
  });
  await page.reload();

  await page.locator('.sidebar-nav-item').filter({ hasText: 'Projects' }).click();
  await expect(page.getByText('Original Name')).toBeVisible();

  // Open context menu for the project (three-dot button)
  await page.locator('.action-menu-btn').first().click();
  // Click "Rename" in the context menu
  await page.locator('.mn-export-item').filter({ hasText: 'Rename' }).click();

  // The rename input appears inside the project card — it has autoFocus and is inside content-card
  const input = page.locator('.content-card input.input-sm[maxlength="200"]').last();
  await input.fill('Renamed Project');
  await input.press('Enter');

  await expect(page.getByText('Renamed Project')).toBeVisible();
});

test('delete a project', async ({ page }) => {
  // Seed a project
  await page.evaluate(() => {
    const project = {
      id: 'proj-del',
      name: 'Project To Delete',
      createdAt: Date.now(),
    };
    localStorage.setItem('threadlog_projects', JSON.stringify([project]));
    localStorage.setItem('threadlog_onboarding_done', '1');
  });
  await page.reload();

  await page.locator('.sidebar-nav-item').filter({ hasText: 'Projects' }).click();
  await expect(page.getByText('Project To Delete')).toBeVisible();

  // Open context menu and select trash
  await page.locator('.action-menu-btn').first().click();
  await page.locator('.mn-export-item').filter({ hasText: 'Move to Trash' }).click();

  // Confirm deletion - use the danger button in the confirm dialog
  await page.locator('.btn-danger').click();

  // Verify project is gone
  await expect(page.getByText('No projects yet')).toBeVisible();
});
