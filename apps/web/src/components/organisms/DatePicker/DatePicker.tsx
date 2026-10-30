import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../../../i18n/index.tsx';
import { DateChip } from '../../molecules/DateChip/index.ts';
import styles from './DatePicker.module.scss';

type DatePickerProps = {
  /** Selectable dates in order, today first (`availableDates`, FR-010). */
  dates: readonly string[];
  selected: string;
  /** Dates on which the movie has screenings in the chosen city; these get a marker. */
  screeningDates: readonly string[];
  onSelect: (date: string) => void;
};

/**
 * A scrollable row of days. It is a single tab stop (roving tabindex): arrow keys, Home and End
 * move between days, Enter or Space selects one.
 */
export function DatePicker({ dates, selected, screeningDates, onSelect }: DatePickerProps) {
  const { t } = useT();
  const picker = useRef<HTMLDivElement>(null);
  const chips = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, dates.indexOf(selected));
  const [focusIndex, setFocusIndex] = useState(selectedIndex);
  // A date chosen elsewhere (a link, the URL) becomes the new tab stop.
  const [shownIndex, setShownIndex] = useState(selectedIndex);
  if (shownIndex !== selectedIndex) {
    setShownIndex(selectedIndex);
    setFocusIndex(selectedIndex);
  }
  const tabStop = Math.min(focusIndex, dates.length - 1);

  // Scrolls only the row, never the page, so a date opened from a link is in view.
  useEffect(() => {
    const row = picker.current;
    const chip = chips.current[selectedIndex];
    if (!row || !chip) return;
    const visible =
      chip.offsetLeft >= row.scrollLeft &&
      chip.offsetLeft + chip.offsetWidth <= row.scrollLeft + row.clientWidth;
    if (!visible) row.scrollLeft = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
  }, [selectedIndex]);

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>) {
    const targets: Record<string, number> = {
      ArrowRight: tabStop + 1,
      ArrowLeft: tabStop - 1,
      Home: 0,
      End: dates.length - 1,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const index = Math.min(Math.max(target, 0), dates.length - 1);
    setFocusIndex(index);
    chips.current[index]?.focus();
  }

  return (
    <div ref={picker} role="toolbar" aria-label={t('datePicker.label')} className={styles.picker}>
      {dates.map((date, index) => (
        <DateChip
          key={date}
          ref={(chip) => {
            chips.current[index] = chip;
          }}
          date={date}
          isToday={index === 0}
          hasScreenings={screeningDates.includes(date)}
          showMonth={index === 0 || date.endsWith('-01')}
          selected={index === selectedIndex}
          tabIndex={index === tabStop ? 0 : -1}
          onSelect={() => {
            onSelect(date);
          }}
          onFocus={() => {
            setFocusIndex(index);
          }}
          onKeyDown={moveFocus}
        />
      ))}
    </div>
  );
}
