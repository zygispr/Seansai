import type { MoviesResponse } from '@seansai/shared';
import { useState } from 'react';
import { useT } from '../../../i18n/index.tsx';
import { foldForSearch } from '../../../lib/text.ts';
import { MovieCard } from '../../molecules/MovieCard/index.ts';
import { SearchField } from '../../molecules/SearchField/index.ts';
import styles from './MovieGrid.module.scss';

type MovieGridProps = {
  /** Already in display order (FR-003). */
  movies: MoviesResponse['movies'];
  movieHref: (movieId: string) => string;
};

/** Posters on a first phone screen load eagerly; the rest only when scrolled to. */
const EAGER_POSTERS = 4;

/** The movie list with a title search over Lithuanian, original and English titles (FR-004). */
export function MovieGrid({ movies, movieHref }: MovieGridProps) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const folded = foldForSearch(query);
  const shown =
    folded === ''
      ? movies
      : movies.filter(({ movie }) =>
          [movie.title, movie.originalTitle ?? '', movie.englishTitle ?? ''].some((title) =>
            foldForSearch(title).includes(folded),
          ),
        );

  return (
    <div className={styles.wrapper}>
      <SearchField
        label={t('search.label')}
        clearLabel={t('search.clear')}
        placeholder={t('search.placeholder')}
        value={query}
        onChange={setQuery}
      />
      {shown.length === 0 ? (
        <p role="status" className={styles.noResults}>
          {t('search.noResults', { query: query.trim() })}
        </p>
      ) : (
        <ul className={styles.grid}>
          {shown.map(({ movie, screeningsToday, firstDate }, index) => (
            <li key={movie.id}>
              <MovieCard
                movie={movie}
                screeningsToday={screeningsToday}
                firstDate={firstDate}
                href={movieHref(movie.id)}
                eagerPoster={index < EAGER_POSTERS}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
