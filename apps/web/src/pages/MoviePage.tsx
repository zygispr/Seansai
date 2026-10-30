import type { MovieDetail } from '@seansai/shared';
import { Link, useParams, useSearchParams } from 'react-router';
import { ApiError } from '../api/client.ts';
import { useCities, useMovie, useScreenings } from '../api/hooks.ts';
import { useCity } from '../app/city.ts';
import { Badge } from '../components/atoms/Badge/index.ts';
import { Poster } from '../components/atoms/Poster/index.ts';
import { CityPrompt } from '../components/organisms/CityPrompt/index.ts';
import { EmptyState } from '../components/organisms/EmptyState/index.ts';
import { ErrorState } from '../components/organisms/ErrorState/index.ts';
import { LoadingState } from '../components/organisms/LoadingState/index.ts';
import { ScreeningTimeline } from '../components/organisms/ScreeningTimeline/index.ts';
import { StaleNotice } from '../components/organisms/StaleNotice/index.ts';
import { PageLayout } from '../components/templates/PageLayout/index.ts';
import { useT } from '../i18n/index.tsx';
import { secondaryTitle } from '../lib/text.ts';
import styles from './MoviePage.module.scss';
import { NotFoundPage } from './NotFoundPage.tsx';

/** One movie's screenings in the chosen city, today by default (FR-006 to FR-009). */
export function MoviePage() {
  const { t, lang, formatTime } = useT();
  const { movieId = '' } = useParams();
  const [params] = useSearchParams();
  const { city, chooseCity } = useCity();
  const cities = useCities(lang);
  const detail = useMovie(movieId, city);

  // "Today" comes from the server, so it matches the data even on a device with a wrong clock.
  const dates = detail.data?.availableDates ?? [];
  const today = dates[0] ?? null;
  const requested = params.get('date');
  const date = requested !== null && dates.includes(requested) ? requested : today;
  const screenings = useScreenings(movieId, city, date);

  if (detail.error instanceof ApiError && detail.error.code === 'movie_not_found') {
    return <NotFoundPage reason="movie" />;
  }
  const unknownCity = detail.error instanceof ApiError && detail.error.code === 'invalid_city';
  if (city === null || unknownCity) {
    return (
      <PageLayout>
        <CityPrompt cities={cities.data?.cities ?? null} onSelect={chooseCity} />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      footer={
        screenings.data &&
        t('layout.updatedAt', { time: formatTime(screenings.data.freshness.updatedAt) })
      }
    >
      {detail.isPending && <LoadingState />}
      {detail.isError && (
        <ErrorState
          onRetry={() => {
            void detail.refetch();
          }}
        />
      )}
      {detail.data && date !== null && (
        <div className={styles.page}>
          <MovieHeader movie={detail.data.movie} />
          <section className={styles.screenings} aria-labelledby="screenings-heading">
            <h2 id="screenings-heading" className={styles.date}>
              <DateHeading date={date} isToday={date === today} />
            </h2>
            <ScreeningsContent query={screenings} isToday={date === today} />
          </section>
        </div>
      )}
    </PageLayout>
  );
}

function DateHeading({ date, isToday }: { date: string; isToday: boolean }) {
  const { t, formatDate } = useT();
  return isToday ? `${t('movie.today')}, ${formatDate(date)}` : formatDate(date);
}

function MovieHeader({ movie }: { movie: MovieDetail }) {
  const { t } = useT();
  const subtitle = secondaryTitle(movie);
  const facts = [
    movie.durationMinutes !== null && t('movie.duration', { minutes: movie.durationMinutes }),
    ...movie.genres,
  ].filter(Boolean);
  return (
    <header className={styles.movie}>
      <Poster
        src={movie.posterUrl}
        alt=""
        width={160}
        height={240}
        loading="eager"
        className={styles.poster}
      />
      <div className={styles.titles}>
        <h1 className={styles.title}>{movie.title}</h1>
        {subtitle !== null && <p className={styles.original}>{subtitle}</p>}
        <p className={styles.facts}>
          {movie.ageRating !== null && (
            <Badge>
              <abbr title={t('movie.ageRating')}>{movie.ageRating}</abbr>
            </Badge>
          )}
          {facts.join(' · ')}
        </p>
      </div>
    </header>
  );
}

function ScreeningsContent({
  query,
  isToday,
}: {
  query: ReturnType<typeof useScreenings>;
  isToday: boolean;
}) {
  const { t, formatDate } = useT();
  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }
  const { screenings, nextDateWithScreenings, freshness } = query.data;
  return (
    <>
      <StaleNotice staleCinemas={freshness.staleCinemas} />
      {screenings.length > 0 ? (
        <ScreeningTimeline screenings={screenings} />
      ) : (
        <EmptyState title={t(isToday ? 'movie.noMoreToday' : 'movie.noScreeningsOnDate')}>
          {nextDateWithScreenings === null ? (
            <p>{t('movie.noUpcoming')}</p>
          ) : (
            <p>
              <Link to={`?date=${nextDateWithScreenings}`}>
                {t('movie.nextDate', { date: formatDate(nextDateWithScreenings) })}
              </Link>
            </p>
          )}
        </EmptyState>
      )}
    </>
  );
}
