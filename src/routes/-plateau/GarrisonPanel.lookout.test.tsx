// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import { GarrisonPanel } from './GarrisonPanel';

vi.mock('convex/react', () => ({ useMutation: () => vi.fn(() => Promise.resolve()) }));

/** **La fiche dit ce que le point guette, et ce qui le coupe** (ADR 0037 §2, §8). */
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
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

const outpostOf = (disabledMinutesLeft: number | null) => ({
  id: 'O-1',
  level: 1,
  hostCountry: 'Belgique',
  regionId: 'BEL-1',
  lonLat: [4.87, 50.47],
  specialty: 'general',
  standsAt: null,
  disabledMinutesLeft,
  serving: false,
  nextLevelCost: {},
  nextLevelMinutes: 0,
  atMaxLevel: false,
  depot: {},
});
const mount = (disabledMinutesLeft: number | null) =>
  render(
    <GarrisonPanel
      view={
        {
          me: {
            nation: 'france',
            defeated: true,
            troops: [],
            stationedCargo: [],
            regions: [],
            buildings: [],
            outposts: [outpostOf(disabledMinutesLeft)],
            resources: {},
            upkeep: { listeningSilent: false },
          },
          arcs: [],
          loadedAt: 0,
        } as unknown as PlayerView
      }
      seat={{ token: 't', seasonId: 's' } as never}
      station={{ kind: 'outpost', outpostId: 'O-1' }}
      at={{ x: 10, y: 10 }}
      preselect={[]}
      onClose={() => {}}
      onPrepare={() => {}}
      onDismantle={() => {}}
    />,
  );

describe('the lookout line of one of my outposts', () => {
  it('says its lookout and its liaisons while it is in service', () => {
    mount(null);
    expect(screen.getByText(fr.garrison.lookout(60, 1))).toBeTruthy();
    expect(screen.queryByText(fr.garrison.lookoutCut)).toBeNull();
  });

  it('says both are cut while a raid holds it out of service, and nothing else', () => {
    mount(120);
    expect(screen.getByText(fr.garrison.lookoutCut)).toBeTruthy();
    expect(screen.queryByText(fr.garrison.lookout(60, 1))).toBeNull();
    expect(screen.queryByText(/^(Aucune liaison|En liaison)/)).toBeNull();
  });
});
