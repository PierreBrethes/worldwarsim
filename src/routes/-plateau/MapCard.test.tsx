// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { SoleSurfaceProvider } from '@/shell/sole-surface';
import { BottomSheet } from '@/shell/BottomSheet';
import { MapCard } from './MapCard';

/**
 * **La fiche de ce qu'on touche, et une seule surface à la fois** (lot mobile-3, §1 et §7). Sous
 * le seuil la fiche est la feuille à l'aperçu ; ouvrir une autre surface — la visée, une garnison —
 * la ferme par son propre geste. Au bureau, le cartouche reste posé à côté du point.
 */
const atWidth = (pixels: number): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: pixels <= Number(/(\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);

afterEach(cleanup);

it('s’ouvre en feuille à l’aperçu sous le seuil', () => {
  atWidth(390);
  render(
    <MapCard
      kicker="troupe"
      at={{ x: 10, y: 10 }}
      gap={{ x: 64, y: 14 }}
      width={228}
      onClose={() => {}}
    >
      <p>Char lourd</p>
    </MapCard>,
  );
  expect(screen.getByRole('dialog').dataset.height).toBe('peek');
});

it('reste un cartouche au bureau', () => {
  atWidth(1440);
  render(
    <MapCard
      kicker="troupe"
      at={{ x: 10, y: 10 }}
      gap={{ x: 64, y: 14 }}
      width={228}
      onClose={() => {}}
    >
      <p>Char lourd</p>
    </MapCard>,
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('Char lourd')).toBeTruthy();
});

it('se ferme quand la visée prend la place', () => {
  atWidth(390);
  const closed = vi.fn();
  function Board() {
    const [aiming, setAiming] = useState(false);
    return (
      <SoleSurfaceProvider>
        <button type="button" onClick={() => setAiming(true)}>
          viser
        </button>
        <MapCard
          kicker="camp relevé"
          at={{ x: 0, y: 0 }}
          gap={{ x: 0, y: 0 }}
          width={228}
          onClose={closed}
        >
          <p>camp</p>
        </MapCard>
        {aiming && (
          <BottomSheet title="visée" onClose={() => setAiming(false)} initial="peek">
            <p>Lyon</p>
          </BottomSheet>
        )}
      </SoleSurfaceProvider>
    );
  }
  render(<Board />);
  act(() => screen.getByRole('button', { name: 'viser' }).click());
  expect(closed).toHaveBeenCalledTimes(1);
});
