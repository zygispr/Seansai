import AxeBuilder from '@axe-core/playwright';
import { HealthResponseSchema } from '@seansai/shared';
import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

/**
 * The e2e tests run against the fixture data (SOURCES_MODE=fixtures). The fixture clock is the
 * capture instant in apps/api/tests/fixtures/README.md: Friday 30 October 2026, 19:46 in Vilnius.
 */

/** Tests never contact cinema websites: posters and ticket pages are answered locally. */
export async function answerExternalRequestsLocally(context: BrowserContext) {
  await context.route(
    (url) => url.hostname !== 'localhost',
    (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Kino teatras</title>' }),
  );
}

export async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}

/** Sources without an adapter yet (Forum, see tasks T049/T061) never load. */
const SOURCES_WITHOUT_ADAPTER = new Set(['forum']);

/**
 * The API answers as soon as it listens, but loads the fixtures just after, and slower when
 * several test servers start at once. Waits until every source with an adapter has loaded, so
 * counts are final. `request` uses the test's baseURL.
 */
export async function waitForSources(request: APIRequestContext) {
  await expect
    .poll(
      async () => {
        const response = await request.get('/api/v1/health');
        if (!response.ok()) return ['API not up'];
        return HealthResponseSchema.parse(await response.json())
          .sources.filter(
            (source) => !SOURCES_WITHOUT_ADAPTER.has(source.id) && source.lastSuccessAt === null,
          )
          .map((source) => source.id);
      },
      { message: 'sources still loading', timeout: 30_000 },
    )
    .toEqual([]);
}
