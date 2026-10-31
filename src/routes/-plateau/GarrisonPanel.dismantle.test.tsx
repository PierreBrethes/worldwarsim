// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import { GarrisonPanel } from './GarrisonPanel';

vi.mock('convex/react', () => ({ useMutation: () => vi.fn(() => Promise.resolve()) }));

/**
 * **Au téléphone, le toucher sur l'épingle d'un avant-poste ouvre cette feuille et ferme la rose
 * qui portait « démanteler »** (#343) : la feuille est la seule porte, elle porte donc le geste, et
 * le refus s'y lit avant lui comme sur la rose (`outpostDismantleRefusalOf`).
 */
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
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
});
afterEach(cleanup);

const station = { kind: 'outpost', outpostId: 'O-1' } as const;
const outpostOf = (specializationLocked: boolean) => ({
  id: 'O-1',
  level: 1,
  hostCountry: 'Belgique',
  regionId: 'BEL-1',
  standsAt: 1,
  disabledMinutesLeft: null,
  specialization: 'relay',
  specializationLocked,
  nextLevelCost: {},
  nextLevelMinutes: 0,
  depot: {},
});
const viewOf = (locked: boolean) =>
  ({
    me: {
      nation: 'france',
      defeated: false,
      troops: [],
      stationedCargo: [],
      regions: [],
      buildings: [],
      outposts: [outpostOf(locked)],
      resources: {},
      upkeep: {},
    },
    arcs: [],
    loadedAt: 0,
  }) as unknown as PlayerView;

const mount = (locked: boolean, onDismantle = vi.fn()) => {
  render(
    <GarrisonPanel
      view={viewOf(locked)}
      seat={{ token: 't', seasonId: 's' } as never}
      station={station}
      at={{ x: 10, y: 10 }}
      preselect={[]}
      onClose={() => {}}
      onPrepare={() => {}}
      onDismantle={onDismantle}
    />,
  );
  return onDismantle;
};

describe('the garrison sheet of one of my outposts', () => {
  it('offers « démanteler », which opens the confirmation for that outpost', () => {
    const onDismantle = mount(false);
    act(() => screen.getByRole('button', { name: fr.compass.dismantle }).click());
    expect(onDismantle).toHaveBeenCalledWith('O-1', expect.any(Object));
  });

  it('says why it cannot instead, before the touch', () => {
    mount(true);
    expect(screen.queryByRole('button', { name: fr.compass.dismantle })).toBeNull();
    expect(screen.getByText(fr.errors.OUTPOST_SERVING())).toBeTruthy();
  });
});
