// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import type { Asset } from '@/domain/nation-assets';
import { NationWindow } from './NationWindow';

vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);

afterEach(cleanup);

const sheetOf = (nation: string, asset: Asset | null) =>
  render(
    <NationWindow
      view={
        {
          mode: 'mondiale',
          arcs: [],
          press: { editions: [], own: [] },
          me: {
            nation,
            asset,
            buildings: [],
            regions: [],
            chains: [],
            extraction: [],
            troops: [],
            outposts: [],
            armyPresent: {},
            armyInTransit: {},
            founderAbsence: null,
            restWindow: '22h00 – 05h00',
            hqLevel: 0,
            upkeep: [],
          },
        } as unknown as PlayerView
      }
      onClose={() => {}}
      onLocate={() => {}}
      rank={0}
      inFront
      onBringForward={() => {}}
    />,
  );

it('titles the asset section only for a nation that holds one', () => {
  sheetOf('germany', 'blitzkrieg');
  expect(screen.getByText('atout national')).toBeTruthy();
  expect(screen.getByText('Guerre éclair')).toBeTruthy();
  cleanup();
  sheetOf('france', null);
  expect(screen.queryByText('atout national')).toBeNull();
});
