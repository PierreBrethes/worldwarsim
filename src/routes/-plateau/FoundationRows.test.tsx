// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { FoundationRows, type FoundationPlacement } from './FoundationRows';

afterEach(cleanup);

it('points at the board once a key is armed: aim at a place', () => {
  const hq: FoundationPlacement = { key: 'hq', deposit: null, condition: null, free: true };

  render(<FoundationRows placements={[hq]} armed="hq:" error={null} onArm={() => {}} />);

  expect(screen.getByText(/Visez un lieu/)).toBeTruthy();
  expect(screen.getByText(/s’aimante sur un gisement libre/)).toBeTruthy();
});
