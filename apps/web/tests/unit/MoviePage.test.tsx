import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { freshness, mockApi, TODAY } from '../helpers/mock-api.ts';
import { renderApp } from '../helpers/render-app.tsx';

beforeEach(() => {
  window.localStorage.setItem('seansai.city', 'vilnius');
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

test('shows the movie, today’s timeline and when the data was updated', async () => {
  const api = mockApi();
  renderApp('/en/movie/digger-2026');

  expect(await screen.findByRole('heading', { level: 1, name: 'Kasėjas' })).toBeInTheDocument();
  expect(screen.getByText('Digger')).toBeInTheDocument();
  expect(screen.getByText(/101 min · drama/)).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { level: 2, name: 'Today, Friday 30 October' }),
  ).toBeInTheDocument();
  expect(await screen.findByRole('list', { name: 'Screenings' })).toBeInTheDocument();
  expect(screen.getByRole('contentinfo')).toHaveTextContent('Updated 19:45');
  expect(api.requested()).toContain(
    `/api/v1/movies/digger-2026/screenings?city=vilnius&date=${TODAY}`,
  );
});

test('with no screenings left today, links to the next date that has some', async () => {
  mockApi({
    screenings: { date: TODAY, screenings: [], nextDateWithScreenings: '2026-11-06', freshness },
  });
  renderApp('/en/movie/digger-2026');

  expect(await screen.findByText('No more screenings today')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Next screenings: Friday 6 November' })).toHaveAttribute(
    'href',
    '/en/movie/digger-2026?date=2026-11-06',
  );
});

test('names the cinemas whose data may be out of date', async () => {
  mockApi({
    screenings: {
      date: TODAY,
      screenings: [],
      nextDateWithScreenings: null,
      freshness: {
        ...freshness,
        staleCinemas: [{ id: 'forum-vingis', name: 'Forum Cinemas Vingis', lastSuccessAt: null }],
      },
    },
  });
  renderApp('/en/movie/digger-2026');

  expect(await screen.findByText('Some information may be out of date')).toBeInTheDocument();
  expect(screen.getByText(/Forum Cinemas Vingis/)).toBeInTheDocument();
  expect(
    screen.getByText('There are no upcoming screenings of this movie in this city.'),
  ).toBeInTheDocument();
});

test('an unknown movie shows "movie not found" with a way back', async () => {
  mockApi();
  renderApp('/en/movie/no-such-movie');

  expect(await screen.findByRole('heading', { name: 'Movie not found' })).toBeInTheDocument();
  expect(
    within(screen.getByRole('main')).getByRole('link', { name: 'Back to the movie list' }),
  ).toHaveAttribute('href', '/en/');
});
