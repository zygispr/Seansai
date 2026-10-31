import { useT } from '../../../i18n/index.tsx';
import { Button } from '../../atoms/Button/index.ts';
import styles from './ErrorState.module.scss';

/** A plain-language failure message with a retry, never the technical error. */
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useT();
  return (
    <div role="alert" className={styles.error}>
      <p className={styles.title}>{t('error.title')}</p>
      <p>{t('error.body')}</p>
      <Button variant="primary" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}
