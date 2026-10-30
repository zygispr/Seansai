import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { renderApp } from '../helpers/render-app.tsx';

afterEach(() => {
  window.localStorage.clear();
});

describe('routes (contracts/web-routes.md)', () => {
  test('"/" redirects to Lithuanian by default', async () => {
    const app = renderApp('/');

    await waitFor(() => {
      expect(app.location()).toBe('/lt/');
    });
  });

  test('"/" redirects to the remembered language', async () => {
    window.localStorage.setItem('seansai.lang', 'en');
    const app = renderApp('/');

    await waitFor(() => {
      expect(app.location()).toBe('/en/');
    });
  });

  test('an unknown language prefix redirects to the same page in Lithuanian', async () => {
    const app = renderApp('/de/movie/digger-2026?date=2026-10-31');

    await waitFor(() => {
      expect(app.location()).toBe('/lt/movie/digger-2026?date=2026-10-31');
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Seansai' })).toBeInTheDocument();
  });

  test('the shell renders in Lithuanian and sets <html lang>', async () => {
    renderApp('/lt/');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Dabar rodomi filmai' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('lt');
  });

  test('the shell renders in English and sets <html lang>', async () => {
    renderApp('/en/');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Now showing' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  test('an unknown page shows "not found" with a link back to the movie list', async () => {
    renderApp('/en/no/such/page');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the movie list' })).toHaveAttribute(
      'href',
      '/en/',
    );
  });
});
