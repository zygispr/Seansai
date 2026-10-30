import { expect, test } from '@playwright/test';
import {
  answerExternalRequestsLocally,
  expectNoAccessibilityViolations,
  waitForSources,
} from './helpers.ts';

/** FR-017 (quickstart "Language"). */

test.beforeEach(async ({ context, request }) => {
  await answerExternalRequestsLocally(context);
  await waitForSources(request);
});

test('switching to English keeps titles, shows original titles and is remembered', async ({
  page,
}) => {
  await page.goto('/lt/?city=vilnius');
  await expect(page.getByRole('heading', { level: 1, name: 'Dabar rodomi filmai' })).toBeVisible();
  const titles = page.getByRole('article').getByRole('heading');
  await expect(titles.first()).toBeVisible();
  const lithuanianTitles = await titles.allTextContents();

  await page.getByRole('link', { name: 'English' }).click();

  await expect(page).toHaveURL(/\/en\/\?city=vilnius$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1, name: 'Now showing' })).toBeVisible();
  // Movie titles are shown as the cinemas publish them, whatever the interface language.
  await expect(titles).toHaveText(lithuanianTitles);
  await expectNoAccessibilityViolations(page);

  await page.getByRole('link', { name: /Kita mamytė/ }).click();
  await expect(page).toHaveURL(/\/en\/movie\/[\w-]+/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kita mamytė' })).toBeVisible();
  await expect(page.getByText('Other Mommy')).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Choose a date' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('toolbar', { name: 'Choose a date' })).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Now showing' })).toBeVisible();
});
