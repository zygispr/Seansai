import { VisuallyHidden } from '../VisuallyHidden/index.ts';
import styles from './Spinner.module.scss';

/** A loading indicator; `label` is announced to screen readers. */
export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className={styles.wrapper}>
      <span className={styles.spinner} aria-hidden="true" />
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
