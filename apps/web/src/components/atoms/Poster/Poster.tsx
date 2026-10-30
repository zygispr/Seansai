import { useState } from 'react';
import { classNames } from '../../../lib/class-names.ts';
import { Icon } from '../Icon/index.ts';
import styles from './Poster.module.scss';

type PosterProps = {
  src: string | null;
  /** Usually the movie title. */
  alt: string;
  /** Intrinsic size, so the browser reserves space before the image loads (no layout shift). */
  width?: number;
  height?: number;
  /** Eager only for posters visible on first paint. */
  loading?: 'lazy' | 'eager';
  className?: string;
};

/** A movie poster with a fixed 2:3 frame; shows a placeholder when there is no image. */
export function Poster({
  src,
  alt,
  width = 200,
  height = 300,
  loading = 'lazy',
  className,
}: PosterProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src === null || failedSrc === src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={classNames(styles.poster, styles.placeholder, className)}
      >
        <Icon name="film" size={40} />
      </div>
    );
  }
  return (
    <img
      className={classNames(styles.poster, className)}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      onError={() => {
        setFailedSrc(src);
      }}
    />
  );
}
