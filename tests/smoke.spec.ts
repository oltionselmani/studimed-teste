import { expect, test } from '@playwright/test';

/**
 * Registration → exam creation. This is the path every other flow depends on,
 * and it exercises the database, session cookies, server actions and the
 * responsive shell in one pass.
 */
test('a student can register and create an exam', async ({ page }, testInfo) => {
  const email = `student-${testInfo.project.name}-${Date.now()}@example.com`;

  await page.goto('/register');
  await expect(page.getByRole('heading', { name: /Create your ExamOS account/i })).toBeVisible();

  await page.getByLabel('Your name').fill('Test Student');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-long-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.waitForURL('**/dashboard', { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('No exams yet')).toBeVisible();

  await page.getByRole('link', { name: /Create your first exam/i }).click();
  await page.waitForURL('**/exams/new');

  await page.getByLabel('Course name').fill('Data Structures');
  const examDate = new Date(Date.now() + 17 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('Exam date').fill(examDate);
  await page.getByLabel('Current course grade').fill('8.2');
  await page.getByLabel('Exam weight').fill('50');
  await page.getByRole('button', { name: 'Create exam' }).click();

  await page.waitForURL('**/material', { timeout: 60_000 });
});

test('the interface switches to Albanian', async ({ page }, testInfo) => {
  const email = `sq-${testInfo.project.name}-${Date.now()}@example.com`;

  await page.goto('/register');
  await page.getByRole('button', { name: 'SQ' }).click();
  await expect(page.getByRole('heading', { name: /Krijo llogarinë/i })).toBeVisible();

  await page.getByLabel('Emri yt').fill('Studenti');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Fjalëkalimi').fill('a-long-enough-password');
  await page.getByRole('button', { name: 'Krijo llogari' }).click();

  await page.waitForURL('**/dashboard', { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Paneli' })).toBeVisible();
});
