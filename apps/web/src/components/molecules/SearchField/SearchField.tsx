import { useId, useRef } from 'react';
import { Button } from '../../atoms/Button/index.ts';
import { Icon } from '../../atoms/Icon/index.ts';
import styles from './SearchField.module.scss';

type SearchFieldProps = {
  label: string;
  clearLabel: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
};

/** A labelled search input with a button that clears it. */
export function SearchField({ label, clearLabel, placeholder, value, onChange }: SearchFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        <Icon name="search" className={styles.icon} />
        <input
          ref={input}
          id={id}
          type="search"
          className={styles.input}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        {value !== '' && (
          <Button
            variant="ghost"
            size="sm"
            className={styles.clear}
            aria-label={clearLabel}
            onClick={() => {
              onChange('');
              input.current?.focus();
            }}
          >
            <Icon name="close" size={18} />
          </Button>
        )}
      </div>
    </div>
  );
}
