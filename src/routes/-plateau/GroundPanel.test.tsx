// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

it("reads an opponent's asset on its country, and nothing for one without", () => {
  const rivals = {
    me: { nation: 'france', outposts: [] },
    mode: 'mondiale',
    opponents: [
      { nation: 'usa', asset: 'lendLease', restWindow: '22 h – 6 h' },
      { nation: 'italy', asset: null, restWindow: '22 h – 6 h' },
    ],
  } as unknown as PlayerView;
  const over = (country: string) =>
    render(
      <GroundPanel
        selected={country}
        hoveredCountry={null}
        hoveredRegion={null}
        holding={null}
        suspendedUntil={null}
        view={rivals}
        onDeselect={() => {}}
      />,
    );
  over('USA');
  expect(screen.getByText('Prêt-bail')).toBeTruthy();
  expect(screen.getByText(/sans l’accord du receveur/)).toBeTruthy();
  cleanup();
  over('ITA');
  expect(screen.queryByText('atout')).toBeNull();
});

/** **La barrette en dépend** (#725) : la fiche dit si elle est dépliée, repliée ou partie. */
it('tells whether it is unfolded, folded or gone', () => {
  const open = vi.fn();
  const props = {
    selected: null,
    hoveredCountry: 'CHE',
    hoveredRegion: { id: 'r-1', country: 'CHE', name: 'Valais', type: 'mountain' as const },
    holding: null,
    suspendedUntil: null,
    view,
    onDeselect: () => {},
    onOpen: open,
  };
  const { rerender } = render(<GroundPanel {...props} />);
  expect(open).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: '–' }));
  expect(open).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole('button', { name: '+' }));
  expect(open).toHaveBeenLastCalledWith(true);
  rerender(<GroundPanel {...props} hoveredCountry={null} hoveredRegion={null} />);
  expect(open).toHaveBeenLastCalledWith(false);
});
