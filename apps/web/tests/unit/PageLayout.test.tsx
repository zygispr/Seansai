import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { mockApi } from '../helpers/mock-api.ts';
import { renderApp } from '../helpers/render-app.tsx';

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

test('has a skip link, a site name linking home and a main landmark', async () => {
  renderApp('/lt/movie/digger-2026');

  expect(await screen.findByRole('main')).toHaveAttribute('id', 'main');
  expect(screen.getByRole('link', { name: 'Pereiti prie turinio' })).toHaveAttribute(
    'href',
    '#main',
  );
  expect(screen.getByRole('link', { name: 'Seansai' })).toHaveAttribute('href', '/lt/');
});

test('the language switch marks the current language and names each in its own language', async () => {
  renderApp('/lt/');

  const nav = await screen.findByRole('navigation', { name: 'Kalba' });
  const lithuanian = screen.getByRole('link', { name: 'Lietuvių' });
  const english = screen.getByRole('link', { name: 'English' });
  expect(nav).toContainElement(english);
  expect(lithuanian).toHaveAttribute('aria-current', 'true');
  expect(english).not.toHaveAttribute('aria-current');
  expect(english).toHaveAttribute('lang', 'en');
});

test('switching language keeps the page and its parameters, and is remembered (FR-017)', async () => {
  const user = userEvent.setup();
  window.localStorage.setItem('seansai.city', 'vilnius');
  mockApi();
  const app = renderApp('/lt/movie/digger-2026?date=2026-10-31');

  const english = await screen.findByRole('link', { name: 'English' });
  expect(english).toHaveAttribute('href', '/en/movie/digger-2026?date=2026-10-31');
  await user.click(english);

  await waitFor(() => {
    expect(app.location()).toBe('/en/movie/digger-2026?date=2026-10-31');
  });
  expect(await screen.findByRole('heading', { level: 1, name: 'Kasėjas' })).toBeInTheDocument();
  expect(
    await screen.findByRole('heading', { level: 2, name: /^Saturday 31 October/ }),
  ).toBeInTheDocument();
  expect(window.localStorage.getItem('seansai.lang')).toBe('en');
  expect(screen.getByRole('navigation', { name: 'Language' })).toBeInTheDocument();
});
