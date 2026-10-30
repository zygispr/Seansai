import type { ReactNode } from 'react';
import styles from './EmptyState.module.scss';

/** A friendly message where a list would be, usually with a way forward. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <p className={styles.title}>{title}</p>
      {children}
    </div>
  );
}
