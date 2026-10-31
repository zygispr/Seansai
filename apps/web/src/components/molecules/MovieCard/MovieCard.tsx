import type { MovieSummary } from '@seansai/shared';
import { Link } from 'react-router';
import { useT } from '../../../i18n/index.tsx';
import { secondaryTitle } from '../../../lib/text.ts';
import { Badge } from '../../atoms/Badge/index.ts';
import { Poster } from '../../atoms/Poster/index.ts';
import styles from './MovieCard.module.scss';

type MovieCardProps = {
  movie: MovieSummary;
  screeningsToday: number;
  /** First date with screenings; shown for movies without screenings left today (FR-003). */
  firstDate: string;
  href: string;
  /** Eager only for cards visible on first paint. */
  eagerPoster?: boolean;
};

export function MovieCard({
  movie,
  screeningsToday,
  firstDate,
  href,
  eagerPoster = false,
}: MovieCardProps) {
  const { plural, t, formatDate } = useT();
  const subtitle = secondaryTitle(movie);
  const when =
    screeningsToday > 0
      ? plural('movieCard.today', screeningsToday)
      : t('movieCard.from', { date: formatDate(firstDate, { day: 'numeric', month: 'long' }) });
  return (
    <article className={styles.card}>
      <Link to={href} className={styles.link}>
        <Poster src={movie.posterUrl} alt="" loading={eagerPoster ? 'eager' : 'lazy'} />
        <div className={styles.body}>
          <h2 className={styles.title}>{movie.title}</h2>
          {subtitle !== null && <p className={styles.original}>{subtitle}</p>}
          <p className={styles.meta}>
            {movie.ageRating !== null && <Badge>{movie.ageRating}</Badge>}
            <span className={screeningsToday > 0 ? styles.today : undefined}>{when}</span>
          </p>
        </div>
      </Link>
    </article>
  );
}
