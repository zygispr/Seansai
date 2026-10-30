import type { ReactNode } from 'react';
import { classNames } from '../../../lib/class-names.ts';
import styles from './FilterChip.module.scss';

type FilterChipProps = {
  children: ReactNode;
  selected: boolean;
  onToggle: () => void;
};

/** A filter value that can be turned on and off. */
export function FilterChip({ children, selected, onToggle }: FilterChipProps) {
  return (
    <button
      type="button"
      className={classNames(styles.chip, selected && styles.selected)}
      aria-pressed={selected}
      onClick={onToggle}
    >
      {children}
    </button>
  );
}
