import type { Freshness } from '@seansai/shared';
import { useT } from '../../../i18n/index.tsx';
import { Icon } from '../../atoms/Icon/index.ts';
import styles from './StaleNotice.module.scss';

/** Names the cinemas whose data could not be refreshed for 3 hours or more (FR-015). */
export function StaleNotice({ staleCinemas }: { staleCinemas: Freshness['staleCinemas'] }) {
  const { t } = useT();
  if (staleCinemas.length === 0) return null;
  return (
    <div className={styles.notice}>
      <Icon name="alert" className={styles.icon} />
      <div>
        <p className={styles.title}>{t('stale.title')}</p>
        <p>{t('stale.body', { cinemas: staleCinemas.map((cinema) => cinema.name).join(', ') })}</p>
      </div>
    </div>
  );
}
