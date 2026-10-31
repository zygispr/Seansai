import { MovieDetailResponseSchema } from '@seansai/shared';
import { expect, test } from '@playwright/test';
import {
  answerExternalRequestsLocally,
  expectNoAccessibilityViolations,
  waitForSources,
} from './helpers.ts';

/** Quickstart US2 against the fixture data (see helpers.ts for the fixture clock). */

test.beforeEach(async ({ context, request }) => {
  await answerExternalRequestsLocally(context);
  await waitForSources(request);
});

test('US2: choosing a future date, sharing it and the date picker', async ({ page, context }) => {
  await page.goto('/lt/?city=vilnius');
  await page.getByRole('link', { name: /Kita mamytė/ }).click();
  await expect(page).toHaveURL(/\/lt\/movie\/[\w-]+$/);
  const picker = page.getByRole('toolbar', { name: 'Pasirinkite datą' });
  await expect(picker.getByRole('button', { pressed: true })).toHaveAccessibleName(/^Šiandien/);

  // 1. Picking the date three days ahead puts it in the URL and shows that day's screenings.
  await picker.getByRole('button').nth(3).click();
  await expect(page).toHaveURL(/\/lt\/movie\/[\w-]+\?date=2026-11-02$/);
  const heading = page.getByRole('heading', { level: 2 });
  await expect(heading).toHaveText(/lapkričio 2 d\./i);
  const list = page.getByRole('list', { name: 'Seansai' });
  await expect(list.getByRole('listitem')).toHaveCount(11);
  await expect(list).toContainText('Forum Cinemas Vingis');
  const rows = await list.getByRole('listitem').allTextContents();
  await expectNoAccessibilityViolations(page);

  // 2. Reloading, and opening the link in a new window, show the same movie, date and screenings.
  await page.reload();
  await expect(heading).toHaveText(/lapkričio 2 d\./i);
  await expect(list.getByRole('listitem')).toHaveText(rows);
  const shared = await context.newPage();
  await shared.goto(page.url());
  await expect(shared.getByRole('heading', { level: 1, name: 'Kita mamytė' })).toBeVisible();
  await expect(shared.getByRole('heading', { level: 2 })).toHaveText(/lapkričio 2 d\./i);
  await expect(shared.getByRole('list', { name: 'Seansai' }).getByRole('listitem')).toHaveText(
    rows,
  );
  await shared.close();

  // 3. The picker offers today up to the last published date, never a past one, and marks the
  //    dates on which this movie has screenings.
  const movieId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  const detail = MovieDetailResponseSchema.parse(
    await (await page.request.get(`/api/v1/movies/${movieId}?city=vilnius`)).json(),
  );
  const chips = picker.getByRole('button');
  await expect(chips).toHaveCount(detail.availableDates.length);
  expect(detail.availableDates[0]).toBe('2026-10-30');
  await expect(chips.first()).toHaveAccessibleName(/^Šiandien, spalio 30 d\./);
  const marked = (await chips.allTextContents()).map((text) => text.includes('yra seansų'));
  expect(marked).toEqual(detail.availableDates.map((date) => detail.screeningDates.includes(date)));
  await expect(picker.getByTestId('screenings-marker')).toHaveCount(detail.screeningDates.length);
});
