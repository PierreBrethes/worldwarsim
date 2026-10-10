// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { FoundationRows, type FoundationPlacement } from './FoundationRows';

afterEach(cleanup);

it('points at the board once a key is armed, without naming its regions', () => {
  const hq: FoundationPlacement = {
    key: 'hq',
    deposit: null,
    regionIds: ['GBR-2750', 'GBR-2764'],
    condition: null,
    free: true,
  };

  render(<FoundationRows placements={[hq]} armed="hq:" error={null} onArm={() => {}} />);

  expect(screen.queryByText(/GBR-|Warwickshire|Durham/)).toBeNull();
  expect(screen.getByText(/surlignées sur le plateau/)).toBeTruthy();
});
