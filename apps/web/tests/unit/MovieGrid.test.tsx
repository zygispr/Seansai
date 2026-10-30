import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { MovieGrid } from '../../src/components/organisms/MovieGrid/index.ts';
import { movies } from '../helpers/mock-api.ts';
import { renderUi } from '../helpers/render-app.tsx';

const cardTitles = () =>
  screen.queryAllByRole('article').map((card) => within(card).getByRole('heading').textContent);

test('keeps the order the API sends', () => {
  renderUi(<MovieGrid movies={movies.movies} movieHref={(id) => `/en/movie/${id}`} />);

  expect(cardTitles()).toEqual(['Zuikis', 'Kasėjas', 'Vėliau']);
});

test('labels today’s movies with their screening count and later ones with their first date', () => {
  renderUi(<MovieGrid movies={movies.movies} movieHref={(id) => `/en/movie/${id}`} />);
  const [zuikis, , later] = screen.getAllByRole('article');
  if (!zuikis || !later) throw new Error('expected cards');

  expect(zuikis).toHaveTextContent('5 screenings today');
  expect(later).toHaveTextContent('From 6 November');
  expect(within(zuikis).getByRole('link')).toHaveAttribute('href', '/en/movie/bunny-2026');
});

test('shows the English title under the Lithuanian one, else the original, only when different', () => {
  renderUi(<MovieGrid movies={movies.movies} movieHref={(id) => `/en/movie/${id}`} />);
  const [zuikis, kasejas, later] = screen.getAllByRole('article');
  if (!zuikis || !kasejas || !later) throw new Error('expected cards');

  expect(zuikis).toHaveTextContent('Bunny');
  expect(zuikis).not.toHaveTextContent('Lapin');
  expect(kasejas).toHaveTextContent('Digger');
  expect(within(later).getAllByText('Vėliau')).toHaveLength(1);
});

test('search matches the Lithuanian or the original title, ignoring case and diacritics', async () => {
  const user = userEvent.setup();
  renderUi(<MovieGrid movies={movies.movies} movieHref={(id) => `/en/movie/${id}`} />);
  const search = screen.getByRole('searchbox', { name: 'Search for a movie' });

  await user.type(search, 'bunny');
  expect(cardTitles()).toEqual(['Zuikis']);

  await user.clear(search);
  await user.type(search, 'lapin');
  expect(cardTitles()).toEqual(['Zuikis']);

  await user.clear(search);
  await user.type(search, 'KASEJ');
  expect(cardTitles()).toEqual(['Kasėjas']);

  await user.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(cardTitles()).toHaveLength(3);
  expect(search).toHaveValue('');
});

test('says so when nothing matches', async () => {
  const user = userEvent.setup();
  renderUi(<MovieGrid movies={movies.movies} movieHref={(id) => `/en/movie/${id}`} />);

  await user.type(screen.getByRole('searchbox'), 'xyz');

  expect(cardTitles()).toEqual([]);
  expect(screen.getByRole('status')).toHaveTextContent('No movies match “xyz”.');
});
