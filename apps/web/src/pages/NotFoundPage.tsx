import { Link } from 'react-router';
import { PageLayout } from '../components/templates/PageLayout/index.ts';
import { useT } from '../i18n/index.tsx';

export function NotFoundPage() {
  const { t, lang } = useT();
  return (
    <PageLayout>
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <p>
        <Link to={`/${lang}/`}>{t('notFound.backToList')}</Link>
      </p>
    </PageLayout>
  );
}
