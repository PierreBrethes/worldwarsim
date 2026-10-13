// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { HelpMark } from './HelpMark';

afterEach(cleanup);

it('keeps the help folded until its « ? » is pressed', () => {
  render(<HelpMark>une phrase d’aide</HelpMark>);
  const mark = screen.getByLabelText('aide');
  const details = mark.closest('details');
  expect(details?.open).toBe(false);
  fireEvent.click(mark);
  expect(details?.open).toBe(true);
  expect(screen.getByText('une phrase d’aide')).toBeTruthy();
});
