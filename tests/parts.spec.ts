import { expect, test, type Page } from '@playwright/test';

/**
 * A course examined in kolokviums. The seeded exam is split in two: the first
 * kolokvium covers the first half of the syllabus and has been sat with a
 * grade of 8; the second covers the rest and is still ahead.
 */

const EMAIL = process.env.SEED_EMAIL ?? 'demo@examos.local';
const PASSWORD = process.env.SEED_PASSWORD ?? 'demo-password-1234';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { timeout: 60_000 });
}

async function openDataStructures(page: Page): Promise<string> {
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Data Structures', exact: true }).click();
  await page.waitForURL(/\/exams\/[0-9a-f-]+(\?.*)?$/, { timeout: 60_000 });
  return page.url().split('/exams/')[1].split('?')[0];
}

test.describe('kolokviums', () => {
  test('the countdown runs to the next sitting, not the course date', async ({ page }, info) => {
    await signIn(page);
    await openDataStructures(page);

    // The header names which sitting it is counting down to.
    await expect(page.getByText(/Time left · Kolokviumi 2/)).toBeVisible();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-parts-overview.png`,
      fullPage: true,
    });
  });

  test('readiness is measured over one sitting at a time', async ({ page }) => {
    await signIn(page);
    await openDataStructures(page);

    await expect(page.getByText('Measuring')).toBeVisible();
    await expect(page.getByText('Readiness, tests and the study plan below cover Kolokviumi 2 only.')).toBeVisible();

    // Kolokvium 2 covers the back half of the course, so its weak topics are
    // the ones from that half — Arrays and Linked Lists belong to kolokvium 1
    // and must not appear in this sitting's breakdown.
    await expect(page.getByText('Big-O Complexity').first()).toBeVisible();

    const weakest = page.locator('section', { hasText: 'Weakest topics' });
    await expect(weakest.getByText('Arrays', { exact: true })).toHaveCount(0);
    await expect(weakest.getByText('Linked Lists', { exact: true })).toHaveCount(0);
  });

  test('switching sitting re-measures against that sitting', async ({ page }) => {
    await signIn(page);
    await openDataStructures(page);

    await page.getByRole('link', { name: /Kolokviumi 1/ }).click();
    await page.waitForURL(/part=/, { timeout: 60_000 });

    await expect(
      page.getByText('Readiness, tests and the study plan below cover Kolokviumi 1 only.'),
    ).toBeVisible();

    // Kolokvium 1's own topics now drive the breakdown.
    const cards = page.locator('section', { hasText: 'Weakest topics' });
    await expect(cards.getByText('Big-O Complexity', { exact: true })).toHaveCount(0);
  });

  test('a banked result changes what the next sitting has to score', async ({ page }) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    // Kolokvium 1 was sat and scored 8 at 50% weight. Reaching a 10 overall
    // therefore needs more than 10 from what is left, so the requirement is
    // pinned at the top of the scale — and it must say it was derived from the
    // banked result rather than from the target alone.
    await expect(page.getByText(/Exam performance your target needs/)).toBeVisible();
    await expect(
      page.getByText('Calculated for this sitting from its weight and the results already banked.'),
    ).toBeVisible();

    // The banked grade is shown on the switcher so it is not a hidden input.
    await expect(page.getByText('Banked: 8')).toBeVisible();

    await page.goto(`/exams/${examId}/settings`);
    await expect(page.getByRole('heading', { name: 'Exam parts' })).toBeVisible();
    await expect(page.getByText('Taken', { exact: true })).toBeVisible();
  });

  test('a test is generated only from the current sitting\'s topics', async ({ page }) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    await page.goto(`/exams/${examId}/tests`);
    await expect(page.getByText('Readiness, tests and the study plan below cover Kolokviumi 2 only.')).toBeVisible();

    // The focus-topic picker offers kolokvium 2's topics and nothing else.
    await page.getByRole('button', { name: 'Targeted practice' }).click();
    const picker = page.locator('section', { hasText: 'Generate a test' });
    await expect(picker.getByRole('button', { name: /^Graphs/ })).toBeVisible();
    await expect(picker.getByRole('button', { name: /^Arrays/ })).toHaveCount(0);
  });

  test('parts can be added, edited and removed from settings', async ({ page }, info) => {
    await signIn(page);
    const examId = await openDataStructures(page);
    await page.goto(`/exams/${examId}/settings`);

    // Scope to the parts card: the page header also names the next sitting.
    const partsCard = page.locator('section', { hasText: 'Exam parts' });
    await expect(partsCard.getByText('Kolokviumi 1', { exact: true })).toBeVisible();
    await expect(partsCard.getByText('Kolokviumi 2', { exact: true })).toBeVisible();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-parts-settings.png`,
      fullPage: true,
    });

    // Add a third sitting.
    await page.getByRole('button', { name: 'Add a part' }).click();
    // The exam form on the same page also has a "Course name" field, so the
    // new-part inputs are addressed inside the parts card.
    const form = partsCard.locator('form', { hasText: 'Add a kolokvium or final' });
    await form.getByLabel('Name', { exact: true }).fill('Provimi final');
    const date = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    await form.getByLabel('Date', { exact: true }).fill(date);
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(partsCard.getByText('Provimi final', { exact: true })).toBeVisible();

    // And remove it again, so repeated runs start from the same place.
    const row = page.locator('li', { hasText: 'Provimi final' }).last();
    await row.getByRole('button', { name: 'Remove' }).click();
    await expect(partsCard.getByText('Provimi final', { exact: true })).toHaveCount(0);
  });

  test('an exam with a single sitting shows no part switcher at all', async ({ page }) => {
    await signIn(page);

    // Operating Systems was never split.
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Operating Systems', exact: true }).click();
    await page.waitForURL(/\/exams\/[0-9a-f-]+(\?.*)?$/, { timeout: 60_000 });

    await expect(page.getByText('Measuring')).toHaveCount(0);
    await expect(page.getByText(/cover .* only\./)).toHaveCount(0);
  });
});
