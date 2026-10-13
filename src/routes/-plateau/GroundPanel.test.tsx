// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { GroundPanel } from './GroundPanel';

/**
 * **Le terrain se lit au survol de toute région** (retours de Pierre du 13/10) : la sienne comme
 * celle d'un voisin, parce que c'est le sol et non un relevé — fixe, et le même pour tous.
 */
vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}));
vi.stubGlobal('fetch', () => new Promise(() => {}));

afterEach(cleanup);

const view = {
  me: { nation: 'france', outposts: [] },
  opponents: [],
} as unknown as PlayerView;

const panelOver = (country: string) =>
  render(
    <GroundPanel
      selected={null}
      hoveredCountry={country}
      hoveredRegion={{ id: 'r-1', country, name: 'Valais', type: 'mountain' }}
      holding={null}
      suspendedUntil={null}
      view={view}
      onDeselect={() => {}}
    />,
  );

it('names the terrain of a region on my own ground', () => {
  panelOver('FRA');
  expect(screen.getByText('terrain : montagne')).toBeTruthy();
});

it('names the terrain of a neutral region just the same', () => {
  panelOver('CHE');
  expect(screen.getByText('terrain : montagne')).toBeTruthy();
});
