// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { GarrisonPanel } from './GarrisonPanel';

const mutate = vi.fn(() => Promise.resolve());
vi.mock('convex/react', () => ({ useMutation: () => mutate }));

beforeEach(() => {
  mutate.mockClear();
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

const at = { kind: 'outpost', outpostId: 'O-1' } as const;
const troop = (id: string, role: string, extra: object = {}) => ({
  id,
  role,
  tier: 1,
  strength: 50,
  nominalStrength: 50,
  stationedAt: at,
  supplied: true,
  mending: false,
  ...extra,
});

/** **Débarquer depuis une garnison lit `offersOf`** : la même règle que la fiche de la pile en
 *  main, et son refus dit plutôt qu'un appel que le serveur refuserait. */
const mount = (carrier: string) =>
  render(
    <GarrisonPanel
      view={
        {
          mode: 'mondiale',
          arcs: [],
          loadedAt: 0,
          me: {
            nation: 'france',
            defeated: false,
            troops: [troop('c', carrier), troop('i', 'infantry', { carriedBy: 'c' })],
            stationedCargo: [],
            regions: [],
            buildings: [],
            lootPoints: [],
            outposts: [
              {
                id: 'O-1',
                level: 1,
                hostCountry: 'Belgique',
                regionId: 'BEL-1',
                lonLat: [4.87, 50.47],
                specialty: 'general',
                changingTo: null,
                standsAt: null,
                disabledMinutesLeft: null,
                serving: false,
                nextLevelCost: {},
                nextLevelMinutes: 0,
                atMaxLevel: false,
                respecialtyCost: {},
                respecialtyMinutes: 0,
                depot: {},
              },
            ],
            resources: Object.fromEntries(
              RESOURCES.map((key) => [key, { stock: 0, ratePerHour: 0, cap: 0 }]),
            ),
            construction: null,
            constructionQueue: [],
            upkeep: { listeningSilent: false, troops: 2 },
          },
        } as unknown as PlayerView
      }
      seat={{ token: 't', seasonId: 's' } as never}
      station={at}
      at={{ x: 10, y: 10 }}
      preselect={[]}
      onClose={() => {}}
      onPrepare={() => {}}
      onDismantle={() => {}}
    />,
  );

describe('GarrisonPanel, disembarking', () => {
  it('sets a rider ashore when the rule allows it', () => {
    mount('landTransport');
    act(() => screen.getByRole('button', { name: fr.hand.disembark }).click());
    expect(mutate).toHaveBeenCalledOnce();
  });

  it('says the refusal and sends nothing when the rule refuses it', () => {
    mount('airTransport');
    act(() => screen.getByRole('button', { name: fr.hand.disembark }).click());
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(fr.errors.AIRFIELD_TARGET_REQUIRED())).toBeTruthy();
  });
});
