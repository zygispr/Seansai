import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { DatePicker } from '../../src/components/organisms/DatePicker/index.ts';
import { renderUi } from '../helpers/render-app.tsx';

const dates = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'];

function renderPicker(selected = '2026-10-30') {
  const onSelect = vi.fn();
  renderUi(
    <DatePicker
      dates={dates}
      selected={selected}
      screeningDates={['2026-10-30', '2026-11-01']}
      onSelect={onSelect}
    />,
  );
  const toolbar = screen.getByRole('toolbar', { name: 'Choose a date' });
  return { onSelect, chips: within(toolbar).getAllByRole('button') };
}

const chip = (chips: HTMLElement[], index: number) => {
  const found = chips[index];
  if (!found) throw new Error(`no chip ${String(index)}`);
  return found;
};

test('offers only the available dates, starting with today', () => {
  const { chips } = renderPicker();

  expect(chips.map((button) => button.textContent)).toEqual([
    expect.stringContaining('Today, Friday 30 October'),
    expect.stringContaining('Saturday 31 October'),
    expect.stringContaining('Sunday 1 November'),
    expect.stringContaining('Monday 2 November'),
  ]);
});

test('the selected date is pressed and the others are not', () => {
  const { chips } = renderPicker('2026-11-01');

  expect(chips.map((button) => button.getAttribute('aria-pressed'))).toEqual([
    'false',
    'false',
    'true',
    'false',
  ]);
});

test('dates with screenings of the movie are marked and announced', () => {
  const { chips } = renderPicker();

  expect(chips.map((button) => within(button).queryByTestId('screenings-marker') !== null)).toEqual(
    [true, false, true, false],
  );
  expect(chip(chips, 0)).toHaveAccessibleName('Today, Friday 30 October, has screenings');
  expect(chip(chips, 1)).toHaveAccessibleName('Saturday 31 October');
});

test('shows the month on the first date and where a new month starts', () => {
  const { chips } = renderPicker();

  expect(within(chip(chips, 0)).getByText('October')).toBeInTheDocument();
  expect(within(chip(chips, 1)).queryByText('October')).not.toBeInTheDocument();
  expect(within(chip(chips, 2)).getByText('November')).toBeInTheDocument();
});

test('clicking a date selects it', async () => {
  const user = userEvent.setup();
  const { chips, onSelect } = renderPicker();

  await user.click(chip(chips, 3));

  expect(onSelect).toHaveBeenCalledWith('2026-11-02');
});

test('is one tab stop; arrow, Home and End keys move between dates and Enter selects', async () => {
  const user = userEvent.setup();
  const { chips, onSelect } = renderPicker('2026-10-31');

  await user.tab();
  expect(chip(chips, 1)).toHaveFocus();
  expect(chips.filter((button) => button.tabIndex === 0)).toEqual([chip(chips, 1)]);

  await user.keyboard('{ArrowRight}');
  expect(chip(chips, 2)).toHaveFocus();
  await user.keyboard('{End}');
  expect(chip(chips, 3)).toHaveFocus();
  await user.keyboard('{ArrowRight}');
  expect(chip(chips, 3)).toHaveFocus();
  await user.keyboard('{Home}');
  expect(chip(chips, 0)).toHaveFocus();
  await user.keyboard('{ArrowLeft}');
  expect(chip(chips, 0)).toHaveFocus();

  await user.keyboard('{ArrowRight}{ArrowRight}{Enter}');
  expect(onSelect).toHaveBeenCalledWith('2026-11-01');

  await user.tab();
  expect(document.body).toHaveFocus();
});
