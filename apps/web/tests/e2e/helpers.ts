import AxeBuilder from '@axe-core/playwright';
import { expect, type BrowserContext, type Page } from '@playwright/test';

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
