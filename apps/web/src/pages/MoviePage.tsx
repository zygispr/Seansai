import { PageLayout } from '../components/templates/PageLayout/index.ts';
import { useT } from '../i18n/index.tsx';

// Shell only; the screening timeline arrives with User Story 1 (T073).
export function MoviePage() {
  const { t } = useT();
  return (
    <PageLayout>
      <h1>{t('movie.screenings')}</h1>
    </PageLayout>
  );
}
