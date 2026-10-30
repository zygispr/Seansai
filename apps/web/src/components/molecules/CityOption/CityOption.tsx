import { useT } from '../../../i18n/index.tsx';
import { classNames } from '../../../lib/class-names.ts';
import styles from './CityOption.module.scss';

type CityOptionProps = {
  name: string;
  /** Omitted for "All of Lithuania". */
  cinemaCount?: number;
  selected?: boolean;
  onSelect: () => void;
};

/** A city to choose, with how many supported cinemas it has. */
export function CityOption({ name, cinemaCount, selected = false, onSelect }: CityOptionProps) {
  const { plural } = useT();
  return (
    <button
      type="button"
      className={classNames(styles.option, selected && styles.selected)}
      aria-pressed={selected ? true : undefined}
      onClick={onSelect}
    >
      <span className={styles.name}>{name}</span>
      {cinemaCount !== undefined && (
        <span className={styles.count}>{plural('city.cinemaCount', cinemaCount)}</span>
      )}
    </button>
  );
}
