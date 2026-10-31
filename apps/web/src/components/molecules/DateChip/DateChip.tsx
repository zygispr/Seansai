import type { KeyboardEventHandler, Ref } from 'react';
import { useT } from '../../../i18n/index.tsx';
import { classNames } from '../../../lib/class-names.ts';
import { VisuallyHidden } from '../../atoms/VisuallyHidden/index.ts';
import styles from './DateChip.module.scss';

type DateChipProps = {
  /** `YYYY-MM-DD`. */
  date: string;
  isToday: boolean;
  /** The movie has screenings on this date in the chosen city. */
  hasScreenings: boolean;
  /** Shown on the first date and where a new month starts. */
  showMonth: boolean;
  selected: boolean;
  /** 0 for the picker's single tab stop, -1 otherwise (roving tabindex). */
  tabIndex: 0 | -1;
  onSelect: () => void;
  onFocus: () => void;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  ref: Ref<HTMLButtonElement>;
};

/** One day in the date picker: weekday (or "Today") and day, with a dot when there are screenings. */
export function DateChip({
  date,
  isToday,
  hasScreenings,
  showMonth,
  selected,
  tabIndex,
  onSelect,
  onFocus,
  onKeyDown,
  ref,
}: DateChipProps) {
  const { t, formatDate } = useT();
  const label = [
    isToday && t('movie.today'),
    formatDate(date),
    hasScreenings && t('datePicker.hasScreenings'),
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <button
      ref={ref}
      type="button"
      className={classNames(
        styles.chip,
        selected && styles.selected,
        !hasScreenings && styles.quiet,
      )}
      aria-pressed={selected}
      tabIndex={tabIndex}
      onClick={onSelect}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      <span className={styles.month} aria-hidden="true">
        {showMonth && formatDate(date, { month: 'long' })}
      </span>
      <span className={styles.weekday} aria-hidden="true">
        {isToday ? t('movie.today') : formatDate(date, { weekday: 'short' })}
      </span>
      {/* Intl writes Lithuanian numeric days with a leading zero, so the day comes from the date. */}
      <span className={styles.day} aria-hidden="true">
        {String(Number(date.slice(8, 10)))}
      </span>
      <span
        className={classNames(styles.marker, hasScreenings && styles.markerOn)}
        aria-hidden="true"
        data-testid={hasScreenings ? 'screenings-marker' : undefined}
      />
      <VisuallyHidden>{label}</VisuallyHidden>
    </button>
  );
}
