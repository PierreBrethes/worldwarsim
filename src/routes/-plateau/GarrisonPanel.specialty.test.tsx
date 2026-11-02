// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr, specialtyEffectText } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { GarrisonPanel } from './GarrisonPanel';

vi.mock('convex/react', () => ({ useMutation: () => vi.fn(() => Promise.resolve()) }));

/** **La fiche porte le choix et le changement du métier** (ADR 0037 §3, §7, §11), au bureau comme
 *  au téléphone, où elle est la seule porte du changement. */
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

const STOCK = { stock: 1000, ratePerHour: 0, cap: 5000 };

const mount = (outpost: Record<string, unknown>, constructionQueue: unknown[] = []) =>
  render(
    <GarrisonPanel
      view={
        {
          me: {
            nation: 'france',
            defeated: false,
            troops: [],
            stationedCargo: [],
            regions: [],
            buildings: [],
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
                nextLevelCost: { steel: 130 },
                nextLevelMinutes: 130,
                atMaxLevel: false,
                respecialtyCost: { steel: 65 },
                respecialtyMinutes: 130,
                depot: { ammunition: 0, oil: 0, coal: 0 },
                depotCapacity: 400,
                ...outpost,
              },
            ],
            resources: Object.fromEntries(RESOURCES.map((key) => [key, STOCK])),
            construction: null,
            constructionQueue,
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

describe('the specialty of one of my outposts', () => {
  it('offers the raise to level 2 as Magasin, Guet and Fort, each with what it does', () => {
    mount({});
    for (const specialty of ['store', 'lookout', 'fort'] as const) {
      expect(
        screen.getByRole('button', { name: fr.garrison.raiseAs(fr.specialties[specialty]) }),
      ).toBeTruthy();
      expect(screen.getByText(specialtyEffectText(specialty, 2))).toBeTruthy();
    }
    expect(screen.getByText(fr.errors.SPECIALTY_AT_LEVEL_TWO())).toBeTruthy();
  });

  /** Le choix fait à l'élévation se lit dès la mise en file, à la place de la note du niveau 1. */
  it('names the specialty a queued raise will give it', () => {
    mount({}, [
      {
        id: 'W-1',
        key: 'outpost',
        outpostId: 'O-1',
        specialty: 'store',
        respecialize: false,
        level: 2,
      },
    ]);
    expect(screen.getByText(fr.garrison.raiseQueuedAs('magasin'))).toBeTruthy();
    expect(screen.queryByText(fr.errors.SPECIALTY_AT_LEVEL_TWO())).toBeNull();
  });

  it('lets an old level-2 generalist choose once, freely', () => {
    mount({ level: 2 });
    expect(screen.getByText(fr.garrison.chooseFree)).toBeTruthy();
    expect(screen.getByRole('button', { name: fr.garrison.chooseAs('guet') })).toBeTruthy();
  });

  it('offers a Magasin the two other trades, with the steel and the time before the gesture', () => {
    mount({ level: 2, specialty: 'store', depotCapacity: 1600 });
    expect(screen.getByRole('button', { name: fr.garrison.changeAs('guet') })).toBeTruthy();
    expect(screen.getByRole('button', { name: fr.garrison.changeAs('fort') })).toBeTruthy();
    expect(screen.queryByRole('button', { name: fr.garrison.changeAs('magasin') })).toBeNull();
    expect(screen.getByText(fr.garrison.changeConsequence)).toBeTruthy();
    expect(screen.getByText('65')).toBeTruthy();
  });

  it('says a changing Magasin acts as a generalist and keeps its surplus', () => {
    mount({ level: 2, specialty: 'store', changingTo: 'lookout' });
    expect(screen.getByText(fr.garrison.changing('guet'))).toBeTruthy();
    expect(screen.getByText(fr.garrison.storeSurplus)).toBeTruthy();
    expect(screen.queryByRole('button', { name: fr.garrison.changeAs('fort') })).toBeNull();
  });

  it('says a Guet watches its whole reach', () => {
    mount({ level: 2, specialty: 'lookout' });
    expect(screen.getByText(fr.garrison.lookout(180, 2))).toBeTruthy();
  });
});
