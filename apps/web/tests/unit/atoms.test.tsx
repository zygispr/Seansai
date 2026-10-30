import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { Button } from '../../src/components/atoms/Button/index.ts';
import { Icon } from '../../src/components/atoms/Icon/index.ts';
import { Poster } from '../../src/components/atoms/Poster/index.ts';
import { Spinner } from '../../src/components/atoms/Spinner/index.ts';

describe('Poster', () => {
  test('loads lazily inside a fixed frame', () => {
    render(<Poster src="https://cinema.lt/digger.jpg" alt="Kasėjas" />);

    const image = screen.getByRole('img', { name: 'Kasėjas' });
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('width', '200');
    expect(image).toHaveAttribute('height', '300');
  });

  test('shows a placeholder when there is no poster', () => {
    render(<Poster src={null} alt="Repertuarinis seansas" />);

    expect(screen.getByRole('img', { name: 'Repertuarinis seansas' }).tagName).toBe('DIV');
  });

  test('switches to the placeholder when the image fails to load', () => {
    render(<Poster src="https://cinema.lt/missing.jpg" alt="Kasėjas" />);

    fireEvent.error(screen.getByRole('img', { name: 'Kasėjas' }));

    expect(screen.getByRole('img', { name: 'Kasėjas' }).tagName).toBe('DIV');
  });
});

describe('Spinner', () => {
  test('announces its label as a status', () => {
    render(<Spinner label="Kraunama…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Kraunama…');
  });
});

describe('Icon', () => {
  test('is hidden from assistive technology unless it has a label', () => {
    const { container } = render(<Icon name="search" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    render(<Icon name="alert" label="Warning" />);
    expect(screen.getByRole('img', { name: 'Warning' })).toBeInTheDocument();
  });
});

describe('Button', () => {
  test('is a plain button by default, so it never submits a form by accident', () => {
    render(<Button>Retry</Button>);

    expect(screen.getByRole('button', { name: 'Retry' })).toHaveAttribute('type', 'button');
  });
});
