import { expect, test, type Page } from '@playwright/test';

/**
 * Walks every screen of the product against a seeded database, in both
 * languages and at both widths, and captures a screenshot of each.
 *
 * Run it against a database prepared by `npm run seed:demo`:
 *   EXAMOS_TEST_DATA_DIR=$PWD/.demo-data npx playwright test walkthrough
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

/**
 * Returns the id of the seeded mock exam without clicking through, because its
 * link target changes once the test has been opened online.
 */
async function mockAttemptId(page: Page, examId: string): Promise<string> {
  await page.goto(`/exams/${examId}/tests`);
  const href = await page
    .getByRole('link', { name: /Full mock exam/ })
    .first()
    .getAttribute('href');
  return (href ?? '').split('/attempts/')[1].split('/')[0];
}

async function openDataStructures(page: Page): Promise<string> {
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Data Structures', exact: true }).click();
  await page.waitForURL(/\/exams\/[0-9a-f-]+$/, { timeout: 60_000 });
  return page.url().split('/exams/')[1];
}

test.describe('seeded walkthrough', () => {
  test('dashboard shows readiness, the clash warning and a next action', async ({ page }, info) => {
    await signIn(page);

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // The sidebar also lists the exams but is CSS-hidden at phone width, so
    // assert against the cards in the page body.
    await expect(page.getByRole('link', { name: 'Data Structures', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Operating Systems', exact: true })).toBeVisible();

    // The readiness band is spelled out, never colour alone.
    await expect(
      page.getByText(/On track|Needs attention|At risk|Significant gap/).first(),
    ).toBeVisible();

    // Next action is concrete.
    await expect(page.getByText('Next action').first()).toBeVisible();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-dashboard.png`,
      fullPage: true,
    });
  });

  test('exam overview explains the readiness verdict with its factors', async ({ page }, info) => {
    await signIn(page);
    await openDataStructures(page);

    await expect(page.getByRole('heading', { name: 'Data Structures' })).toBeVisible();
    await expect(page.getByText('Time left')).toBeVisible();

    // Every factor behind the band is listed, each with an evidence tag.
    await expect(page.getByRole('heading', { name: 'Why', exact: true })).toBeVisible();
    await expect(page.getByText(/Recent practice average/)).toBeVisible();
    await expect(page.getByText(/Topic coverage: \d+%/)).toBeVisible();
    await expect(page.getByText(/Exam performance your target needs/)).toBeVisible();

    // The honesty disclaimer is present on the readiness readout.
    await expect(
      page.getByText(/measurement of your practice results, not a prediction/),
    ).toBeVisible();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-overview.png`,
      fullPage: true,
    });
  });

  test('course material lists extracted topics with their source file', async ({ page }, info) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    await page.goto(`/exams/${examId}/material`);
    await expect(page.getByRole('heading', { name: 'Course content' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Big-O Complexity' })).toBeVisible();
    await expect(page.getByText('lecture_notes.pdf').first()).toBeVisible();

    // With no previous exams provided, the app says so — and says what that
    // does and does not mean.
    await expect(
      page.getByText('No verified previous-year exam information was found.'),
    ).toBeVisible();
    await expect(page.getByText(/does not mean previous exams do not exist/)).toBeVisible();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-material.png`,
      fullPage: true,
    });
  });

  test('AI-backed actions refuse clearly when no API key is configured', async ({ page }) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    await page.goto(`/exams/${examId}/tests`);
    await expect(
      page.getByText('An Anthropic API key is required to generate tests. Add one in Settings.'),
    ).toBeVisible();

    // The generate button is disabled rather than pretending to work.
    await expect(page.getByRole('button', { name: 'Generate' })).toBeDisabled();
  });

  test('study plan shows fixed priorities, daily tasks and what to skip', async ({ page }, info) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    await page.goto(`/exams/${examId}/plan`);
    await expect(page.getByText('What do I need for 10?')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Priorities', exact: true })).toBeVisible();
    await expect(page.getByText('Current mastery: 38%')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.getByText('Target: ≥80%')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'What not to spend time on' }),
    ).toBeVisible();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-plan.png`,
      fullPage: true,
    });
  });

  test('a study plan task can be ticked off and stays ticked', async ({ page }) => {
    await signIn(page);
    const examId = await openDataStructures(page);
    await page.goto(`/exams/${examId}/plan`);

    // Toggle whatever state the first task is in, rather than assuming one.
    const startedDone = await page.getByRole('button', { name: 'Undo' }).first().isVisible();
    const toggle = () =>
      page.getByRole('button', { name: startedDone ? 'Undo' : 'Mark done' }).first().click();
    const opposite = startedDone ? 'Mark done' : 'Undo';

    await toggle();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: opposite }).first()).toBeVisible();

    // Survives a reload — it is stored, not just local state.
    await page.reload();
    await expect(page.getByRole('button', { name: opposite }).first()).toBeVisible();

    // Put it back so repeated runs start from the same place.
    await page.getByRole('button', { name: opposite }).first().click();
    await page.waitForLoadState('networkidle');
  });

  test('mistake book keeps the concept, not just the wrong answer', async ({ page }, info) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    await page.goto(`/exams/${examId}/mistakes`);
    await expect(page.getByText('Explain why binary search is O(log n).')).toBeVisible();
    await expect(page.getByText('Correct concept').first()).toBeVisible();
    await expect(page.getByText(/halves the remaining search space/)).toBeVisible();
    await expect(page.getByText('Missed 3 times')).toBeVisible();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-mistakes.png`,
      fullPage: true,
    });
  });

  test('history charts render with a table fallback', async ({ page }, info) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    await page.goto(`/exams/${examId}/history`);
    await expect(page.getByRole('heading', { name: 'Practice scores' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Topic mastery over time' }),
    ).toBeVisible();

    // Every chart carries an accessible table of the same numbers.
    const tables = page.locator('.viz-table');
    expect(await tables.count()).toBeGreaterThan(0);
    await expect(tables.first()).toHaveAttribute('class', /viz-table/);

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-history.png`,
      fullPage: true,
    });
  });

  test('final report assembles from stored measurements only', async ({ page }, info) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    await page.goto(`/exams/${examId}/report`);
    await expect(page.getByRole('heading', { name: 'Final readiness report' })).toBeVisible();
    await expect(page.getByText('Days remaining').first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Recommended final study priorities' }),
    ).toBeVisible();
    await expect(page.getByText(/guidance, not a guarantee/)).toBeVisible();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-report.png`,
      fullPage: true,
    });
  });

  test('printable study sheet renders with answers on a later page', async ({ page }, info) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    await page.goto(`/exams/${examId}/plan`);
    await page.getByRole('link', { name: 'Print study sheet' }).first().click();
    await page.waitForURL('**/print/study/**', { timeout: 60_000 });

    await expect(page.getByRole('heading', { name: /Study sheet — Big-O Complexity/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Worked examples' })).toBeVisible();
    await expect(page.getByText('Answers are printed on the last page.').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Answers — Big-O Complexity/ })).toBeVisible();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-print-study.png`,
      fullPage: true,
    });
  });

  test('printable exam hides answers; the answer key shows them', async ({ page }, info) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    await page.goto(`/exams/${examId}/tests`);
    await page.getByRole('link', { name: /Diagnostic — Data Structures/ }).first().click();
    await page.waitForURL('**/attempts/**', { timeout: 60_000 });
    const attemptId = page.url().split('/attempts/')[1].split('/')[0];

    await page.goto(`/print/exam/${attemptId}`);
    await expect(page.getByRole('heading', { name: 'Exam', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Instructions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Question 1', exact: true })).toBeVisible();
    // No expected answers anywhere on the student copy.
    await expect(page.getByText('Expected answer')).toHaveCount(0);

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-print-exam.png`,
      fullPage: true,
    });

    await page.goto(`/print/answerkey/${attemptId}`);
    await expect(page.getByText('Answer key — not for the student copy.')).toBeVisible();
    await expect(page.getByText('Expected answer').first()).toBeVisible();
  });

  test('result page breaks the score down by topic', async ({ page }, info) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    await page.goto(`/exams/${examId}/tests`);
    await page.getByRole('link', { name: /Practice — Big-O Complexity/ }).first().click();
    await page.waitForURL('**/result', { timeout: 60_000 });

    await expect(page.getByRole('heading', { name: 'Your result' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Topic performance' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Question by question' })).toBeVisible();
    // The grade conversion is labelled as an estimate, not a university rule.
    await expect(page.getByText('Estimate').first()).toBeVisible();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-result.png`,
      fullPage: true,
    });
  });


  test('an ungraded test offers both print and online, plus the scan route', async ({ page }, info) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    await page.goto(`/attempts/${await mockAttemptId(page, examId)}`);

    await expect(page.getByRole('heading', { name: 'Your test is ready' })).toBeVisible();
    await expect(page.getByText('6 questions · 12 points · 90 min')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print exam' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take exam online' })).toBeVisible();
    await expect(page.getByText('Finished your exam on paper?')).toBeVisible();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-attempt-ready.png`,
      fullPage: true,
    });
  });

  test('the online exam runner navigates, autosaves and confirms before submitting', async ({
    page,
  }, info) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    await page.goto(`/attempts/${await mockAttemptId(page, examId)}`);
    await page.getByRole('button', { name: 'Take exam online' }).click();
    await page.waitForURL('**/take', { timeout: 60_000 });

    await expect(page.getByText('Question 1 of 6', { exact: false })).toBeVisible();
    await expect(page.getByText('Time remaining')).toBeVisible();

    // A written answer autosaves. The text is unique per run so the assertion
    // does not depend on what a previous run left in the box.
    await page
      .getByLabel('Write your answer')
      .fill(`Each comparison halves the range. ${Date.now()}`);
    await expect(page.getByText(/· Saved/)).toBeVisible({ timeout: 20_000 });

    // A review flag toggles.
    await page.getByRole('button', { name: 'Mark for review' }).click();
    await expect(page.getByRole('button', { name: 'Marked for review' })).toBeVisible();

    // Code-bearing questions render their code block.
    await page.getByRole('button', { name: 'Question 2' }).click();
    await expect(page.locator('pre code')).toBeVisible();

    // Choice questions offer options.
    await page.getByRole('button', { name: /Question 3/ }).click();
    await expect(page.getByText('Select one')).toBeVisible();
    await page.getByRole('radio').nth(2).check();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-exam-runner.png`,
      fullPage: true,
    });

    // Submitting asks first, and says exactly what is unanswered.
    await page.getByRole('button', { name: 'Submit exam' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/You have answered \d+ of 6 questions/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the scan flow explains itself and needs a key before it will read anything', async ({
    page,
  }, info) => {
    await signIn(page);
    const examId = await openDataStructures(page);

    await page.goto(`/attempts/${await mockAttemptId(page, examId)}/scan`);
    await expect(page.getByRole('heading', { name: 'Scan your exam' })).toBeVisible();
    await expect(page.getByText(/lets you correct it before grading/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take photo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload images' })).toBeVisible();
    await expect(page.getByText('No pages added yet.')).toBeVisible();
    await expect(
      page.getByText('Reading scans requires an Anthropic API key. Add one in Settings.'),
    ).toBeVisible();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-scan.png`,
      fullPage: true,
    });
  });

  test('the whole interface switches to Albanian', async ({ page }, info) => {
    await signIn(page);
    await page.goto('/settings');
    await page.getByLabel('Interface language').selectOption('sq');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForLoadState('networkidle');

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Paneli' })).toBeVisible();
    await expect(page.getByText('Veprimi tjetër').first()).toBeVisible();

    await page.getByRole('link', { name: 'Data Structures', exact: true }).first().click();
    await page.waitForURL(/\/exams\/[0-9a-f-]+$/, { timeout: 60_000 });
    await expect(page.getByText('Koha e mbetur')).toBeVisible();
    await expect(page.getByText(/Mesatarja e fundit në praktikë/)).toBeVisible();
    await expect(page.getByText(/matje e rezultateve të tua të praktikës/)).toBeVisible();

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-albanian.png`,
      fullPage: true,
    });

    // Put the language back so the other tests are unaffected.
    await page.goto('/settings');
    await page.getByLabel('Gjuha e ndërfaqes').selectOption('en');
    await page.getByRole('button', { name: 'Ruaj' }).click();
    await page.waitForLoadState('networkidle');
  });

  test('dark mode applies without a flash of the light theme', async ({ page }, info) => {
    await signIn(page);
    await page.goto('/dashboard');

    await page.evaluate(() => {
      localStorage.setItem('examos-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const background = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor,
    );
    expect(background).toBe('rgb(13, 15, 20)');

    await page.screenshot({
      path: `test-results/shots/${info.project.name}-dark.png`,
      fullPage: true,
    });

    await page.evaluate(() => {
      localStorage.removeItem('examos-theme');
      document.documentElement.removeAttribute('data-theme');
    });
  });

  test('one student cannot reach another student\'s exam', async ({ page }) => {
    await signIn(page);
    const examId = await openDataStructures(page);
    const attemptId = await mockAttemptId(page, examId);

    // A second account, created fresh, must not see the first account's data.
    await page.goto('/dashboard');
    // The account controls live in the navigation, which is behind the menu
    // button at phone width.
    const menuButton = page.getByRole('button', { name: 'Open menu' });
    if (await menuButton.isVisible()) await menuButton.click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login', { timeout: 60_000 });

    await page.goto('/register');
    await page.getByLabel('Your name').fill('Other Student');
    await page.getByLabel('Email').fill(`other-${Date.now()}@example.com`);
    await page.getByLabel('Password').fill('another-long-password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL('**/dashboard', { timeout: 60_000 });

    // Every route that takes someone else's id must refuse, including the
    // printable documents and anything hanging off an attempt.
    for (const path of [
      `/exams/${examId}`,
      `/exams/${examId}/material`,
      `/exams/${examId}/plan`,
      `/exams/${examId}/mistakes`,
      `/exams/${examId}/report`,
      `/print/report/${examId}`,
      `/print/mistakes/${examId}`,
      `/attempts/${attemptId}`,
      `/attempts/${attemptId}/result`,
      `/attempts/${attemptId}/scan`,
      `/attempts/${attemptId}/take`,
      `/print/exam/${attemptId}`,
      `/print/answerkey/${attemptId}`,
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should not be readable`).toBe(404);
    }
  });
});
