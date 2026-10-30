import { expect, test } from '@playwright/test';
import {
  answerExternalRequestsLocally,
  expectNoAccessibilityViolations,
  waitForSources,
} from './helpers.ts';
import { RESILIENCE_PORT } from './ports.ts';

/**
 * FR-015 / SC-005 (quickstart "Resilience"): the API behind this server cannot refresh Vue
 * (FIXTURE_FAIL=vue) and last succeeded 4 hours ago. Vue stands in for Forum here: Forum has no
 * adapter yet (its fixtures could not be captured), so it is always reported stale and would not
 * prove that a failing refresh is handled.
 */
const baseURL = `http://localhost:${String(RESILIENCE_PORT)}`;
test.use({ baseURL });

test.beforeEach(async ({ context, request }) => {
  await answerExternalRequestsLocally(context);
  await waitForSources(request);
});

test('a failing cinema is named while the others are still shown', async ({ page }) => {
  await page.goto('/lt/?city=vilnius');

  await expect(page.getByRole('article').first()).toBeVisible();
  const notice = page.getByText('Kai kurie duomenys gali būti pasenę').locator('..');
  await expect(notice).toContainText('Vue Vilnius');
  await expect(page.getByRole('contentinfo')).toContainText(/Atnaujinta \d{2}:\d{2}/);
  await expectNoAccessibilityViolations(page);

  // A movie shown at Vue and elsewhere: the other cinemas' screenings remain, Vue's are missing.
  await page.getByRole('link', { name: /Kita mamytė/ }).click();
  const list = page.getByRole('list', { name: 'Seansai' });
  await expect(list.getByRole('listitem').first()).toBeVisible();
  await expect(list).toContainText('Apollo');
  await expect(list).not.toContainText('Vue Vilnius');
  await expect(page.getByText('Kai kurie duomenys gali būti pasenę').locator('..')).toContainText(
    'Vue Vilnius',
  );
  await expect(page.getByRole('contentinfo')).toContainText(/Atnaujinta \d{2}:\d{2}/);
});
