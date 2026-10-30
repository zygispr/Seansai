import { Link } from 'react-router';
import { PageLayout } from '../components/templates/PageLayout/index.ts';
import { useT } from '../i18n/index.tsx';

/** An unknown address, or a movie that is no longer listed (`movie_not_found`). */
export function NotFoundPage({ reason = 'page' }: { reason?: 'page' | 'movie' }) {
  const { t, lang } = useT();
  return (
    <PageLayout>
      <h1>{t(reason === 'movie' ? 'notFound.movieTitle' : 'notFound.title')}</h1>
      <p>{t(reason === 'movie' ? 'notFound.movieBody' : 'notFound.body')}</p>
      <p>
        <Link to={`/${lang}/`}>{t('notFound.backToList')}</Link>
      </p>
    </PageLayout>
  );
}
