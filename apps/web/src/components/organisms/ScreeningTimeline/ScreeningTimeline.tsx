import type { Screening } from '@seansai/shared';
import { useT } from '../../../i18n/index.tsx';
import { ScreeningRow } from '../../molecules/ScreeningRow/index.ts';
import styles from './ScreeningTimeline.module.scss';

/** All screenings as one list in time order, not grouped by cinema (FR-006). */
export function ScreeningTimeline({ screenings }: { screenings: readonly Screening[] }) {
  const { t } = useT();
  return (
    <ol className={styles.timeline} aria-label={t('movie.screenings')}>
      {screenings.map((screening) => (
        <ScreeningRow key={screening.id} screening={screening} />
      ))}
    </ol>
  );
}
