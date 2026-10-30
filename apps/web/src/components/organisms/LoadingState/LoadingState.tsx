import { useT } from '../../../i18n/index.tsx';
import { Spinner } from '../../atoms/Spinner/index.ts';
import styles from './LoadingState.module.scss';

export function LoadingState() {
  const { t } = useT();
  return (
    <div className={styles.loading}>
      <Spinner label={t('common.loading')} />
    </div>
  );
}
