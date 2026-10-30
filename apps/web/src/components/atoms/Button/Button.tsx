import type { ComponentPropsWithRef } from 'react';
import { classNames } from '../../../lib/class-names.ts';
import styles from './Button.module.scss';

type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'sm';
};

export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classNames(styles.button, styles[variant], styles[size], className)}
      {...props}
    />
  );
}
