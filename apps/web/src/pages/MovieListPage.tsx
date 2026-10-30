import { PageLayout } from '../components/templates/PageLayout/index.ts';
import { useT } from '../i18n/index.tsx';

// Shell only; the movie list itself arrives with User Story 1 (T072).
export function MovieListPage() {
  const { t } = useT();
  return (
    <PageLayout>
      <h1>{t('movieList.title')}</h1>
    </PageLayout>
  );
}
