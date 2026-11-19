// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr, roleLabel } from '@/i18n/fr';
import type { PlayerView, TroopView } from '@/domain/player-view';
import type { Offer } from '@/domain/offers';
import { HandSheet } from './HandSheet';
import { handOffersOf } from './hand-offers';

beforeEach(() =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })),
);
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);
afterEach(cleanup);

const station = {
  kind: 'point',
  lonLat: [4.6, 46.6],
  country: 'FRA',
  afloat: false,
  ground: 'land',
  coastal: false,
} as const;
const troop = (id: string, role: TroopView['role']): TroopView => ({
  id,
  role,
  tier: 1,
  strength: 50,
  nominalStrength: 50,
  stationedAt: station,
  supplied: true,
  mending: false,
});

/** **Cocher, c'est composer la main** (ADR 0026 §6) : la fiche rend la composition, sans lâcher. */
describe('HandSheet', () => {
  it('hands each change of its boxes to the hand', () => {
    const onCompose = vi.fn();
    const held = [troop('inf', 'infantry'), troop('tank', 'armor')];
    render(
      <HandSheet
        view={
          {
            me: { nation: 'france', stationedCargo: [], troops: [], upkeep: { troops: 2 } },
          } as unknown as PlayerView
        }
        station={station}
        place="Saône-et-Loire"
        held={held}
        troopIds={['inf', 'tank']}
        onCompose={onCompose}
        offers={[]}
        onOffer={() => {}}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />,
    );
    expect(screen.getByText(fr.hand.kicker('Saône-et-Loire'))).toBeTruthy();
    expect(onCompose).toHaveBeenLastCalledWith(['inf', 'tank']);
    const boxes = screen.getAllByRole('checkbox');
    act(() => boxes[1]!.click());
    expect(onCompose).toHaveBeenLastCalledWith(['inf']);
    expect(screen.queryByText(fr.garrison.prepare)).toBeNull();
  });

  it('says why a blitzkrieg left its troops standing there (#451)', () => {
    const stood = {
      text: 'reste à Liège — plus de coups',
      reread: 'relu à 13:10',
      troopIds: ['tank'],
    };
    render(
      <HandSheet
        view={
          {
            me: { nation: 'germany', stationedCargo: [], troops: [], upkeep: { troops: 2 } },
            journal: [{ stood }],
          } as unknown as PlayerView
        }
        station={station}
        place="Liège"
        held={[troop('tank', 'armor')]}
        troopIds={['tank']}
        onCompose={() => {}}
        offers={[]}
        onOffer={() => {}}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />,
    );
    expect(screen.getByText(stood.text)).toBeTruthy();
    expect(screen.getByText(stood.reread)).toBeTruthy();
  });

  it('reads the statistics of the troops it holds, and no longer a bare detection range', () => {
    const held = [troop('inf', 'infantry'), troop('tank', 'armor')];
    const { container } = render(
      <HandSheet
        view={
          {
            mode: 'mondiale',
            me: { nation: 'france', stationedCargo: [], troops: [], upkeep: { troops: 2 } },
          } as unknown as PlayerView
        }
        station={station}
        place="Saône-et-Loire"
        held={held}
        troopIds={['inf']}
        onCompose={() => {}}
        offers={[]}
        onOffer={() => {}}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />,
    );
    const stat = (key: string) => container.querySelector(`[data-stat="${key}"]`);
    expect(stat('pace')).not.toBeNull();
    expect(stat('detection')?.textContent).toContain('60 km');
    expect(stat('fuel')?.textContent).toContain('marche');
    expect(container.textContent).not.toContain(fr.garrison.paces.foot);
  });
});

/** **Une pile réduite à une troupe est une troupe seule** (#301) : il n'y a rien à cocher, la
 *  fiche la lit sans case, sans raccourci. Dès qu'une deuxième la rejoint, les cases reviennent. */
describe('HandSheet, a lone troop', () => {
  const sheet = (held: ReadonlyArray<TroopView>, offers: ReadonlyArray<Offer> = []) => (
    <HandSheet
      view={
        {
          me: { nation: 'france', stationedCargo: [], troops: [], upkeep: { troops: 1 } },
        } as unknown as PlayerView
      }
      station={station}
      place="Saône-et-Loire"
      held={held}
      troopIds={held.map((one) => one.id)}
      onCompose={() => {}}
      offers={offers}
      onOffer={() => {}}
      onOpenGunnery={() => {}}
      onDrop={() => {}}
      onApproach={() => {}}
    />
  );

  it('offers no box to tick when the pile is one troop', () => {
    render(sheet([troop('truck', 'landTransport')]));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByText(fr.garrison.pickAll)).toBeNull();
    expect(screen.getByText(roleLabel('landTransport', 1))).toBeTruthy();
  });

  it('offers no box to a transport carrying its passenger, who can still step ashore', () => {
    render(
      sheet(
        [troop('truck', 'landTransport'), { ...troop('rifle', 'infantry'), carriedBy: 'truck' }],
        [{ key: 'disembark', rank: 'thumb', refusal: null, loses: null, troopIds: ['rifle'] }],
      ),
    );
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByRole('button', { name: new RegExp(fr.hand.disembark, 'i') })).toBeTruthy();
  });

  it('gets its boxes back when a second troop joins', () => {
    render(sheet([troop('truck', 'landTransport'), troop('inf', 'infantry')]));
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });
});

describe('HandSheet in a Blitz', () => {
  it('shows the one unit in a strip, without the pile or its range', () => {
    render(
      <HandSheet
        view={
          {
            mode: 'blitz',
            me: { nation: 'france', stationedCargo: [], troops: [], upkeep: { troops: 2 } },
          } as unknown as PlayerView
        }
        station={station}
        place="Portugal"
        held={[troop('inf', 'infantry')]}
        troopIds={['inf']}
        onCompose={() => {}}
        offers={[]}
        onOffer={() => {}}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />,
    );
    expect(screen.getByText(fr.troops.strength(50, 50))).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/relève à/)).toBeNull();
  });

  it('sets the infantry ashore beside its truck, by the disembark offer', () => {
    const onOffer = vi.fn();
    const held = [
      { ...troop('inf', 'infantry'), carriedBy: 'truck' },
      troop('truck', 'landTransport'),
    ];
    const view = {
      mode: 'blitz',
      arcs: [],
      me: {
        nation: 'france',
        stationedCargo: [],
        troops: held,
        buildings: [],
        lootPoints: [],
        upkeep: { troops: 2 },
      },
    } as unknown as PlayerView;
    const offers = handOffersOf(view, { station, troopIds: ['inf', 'truck'] }, null, 0, null);
    render(
      <HandSheet
        view={view}
        station={station}
        place="Portugal"
        held={held}
        troopIds={['inf', 'truck']}
        offers={offers}
        onCompose={() => {}}
        onOffer={onOffer}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />,
    );
    act(() => screen.getByRole('button', { name: fr.hand.disembark }).click());
    expect(onOffer).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'disembark', troopIds: ['inf'] }),
    );
  });
});

const found = {
  key: 'found',
  rank: 'thumb',
  refusal: null,
  loses: null,
  troopIds: ['inf'],
} as const;
const foundingView = {
  me: {
    nation: 'france',
    stationedCargo: [],
    troops: [],
    resources: { steel: { stock: 100, ratePerHour: 0, cap: 500 } },
    upkeep: { troops: 2 },
  },
  outpostFoundation: { cost: { steel: 20 }, minutes: 120 },
  loadedAt: 0,
} as unknown as PlayerView;

/** **Ses ordres sont les offres de `offersOf`** (#585, ADR 0015) : un bouton, ou son refus dit à
 *  sa place — jamais un bouton grisé. */
describe('HandSheet offers', () => {
  const sheet = (offers: ReadonlyArray<Offer>, onOffer: (offer: Offer) => void = () => {}) =>
    render(
      <HandSheet
        view={foundingView}
        station={station}
        place="Saône-et-Loire"
        held={[troop('inf', 'infantry')]}
        troopIds={['inf']}
        offers={offers}
        onCompose={() => {}}
        onOffer={onOffer}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />,
    );

  it('hands the founding offer back to the plateau, with its bill', () => {
    const onOffer = vi.fn();
    sheet([found], onOffer);
    act(() => screen.getByRole('button', { name: new RegExp(fr.hand.found, 'i') }).click());
    expect(onOffer).toHaveBeenCalledWith(found);
    expect(screen.getByText(/20/)).toBeTruthy();
  });

  it('says the motive instead of a button when the offer is refused', () => {
    sheet([{ ...found, refusal: 'déjà à vous' }]);
    expect(screen.queryByText(fr.hand.found)).toBeNull();
    expect(screen.getByText('déjà à vous')).toBeTruthy();
  });

  it('leaves dissolving to the U key on the desk', () => {
    sheet([{ key: 'disband', rank: 'second', refusal: null, loses: 'x', point: [4.6, 46.6] }]);
    expect(screen.queryByRole('button', { name: fr.selection.disband })).toBeNull();
  });

  it('says why one cannot disembark rather than offering the button', () => {
    sheet([
      { key: 'disembark', rank: 'thumb', refusal: 'pas au large', loses: null, troopIds: ['inf'] },
    ]);
    expect(screen.queryByRole('button', { name: new RegExp(fr.hand.disembark, 'i') })).toBeNull();
    expect(screen.getByText('pas au large')).toBeTruthy();
  });
});

/** **Au téléphone, la fiche s'ouvre à l'aperçu** : l'essentiel au pouce, les onglets en la
 *  déroulant ; « Aucune » la laisse ouverte ; dissoudre demande un second toucher (#585). */
describe('HandSheet on a phone', () => {
  beforeEach(() =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  const held = [troop('inf', 'infantry'), troop('tank', 'armor')];
  const disband = {
    key: 'disband',
    rank: 'second',
    refusal: null,
    loses: fr.compass.disbandConsequence,
    point: [4.6, 46.6],
  } as const;
  const phone = (
    offers: ReadonlyArray<Offer>,
    spies: Partial<{ onOffer: () => void; onCompose: () => void; onDrop: () => void }> = {},
  ) =>
    render(
      <HandSheet
        view={foundingView}
        station={station}
        place="Saône-et-Loire"
        held={held}
        troopIds={['inf', 'tank']}
        offers={offers}
        onCompose={spies.onCompose ?? (() => {})}
        onOffer={spies.onOffer ?? (() => {})}
        onOpenGunnery={() => {}}
        onDrop={spies.onDrop ?? (() => {})}
        onApproach={() => {}}
      />,
    );

  it('opens at the peek, over its tabs, with « fonder » under the thumb', () => {
    const { container } = phone([found]);
    expect(
      container.ownerDocument.querySelector('[data-height]')?.getAttribute('data-height'),
    ).toBe('peek');
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(
      screen.getByRole('button', { name: new RegExp(`^${fr.hand.foundShort}`, 'i') }),
    ).toBeTruthy();
  });

  it('stays open on « Aucune »: nothing to send, and the sheet is not dropped', () => {
    const onCompose = vi.fn();
    const onDrop = vi.fn();
    phone([], { onCompose, onDrop });
    act(() => screen.getByRole('button', { name: fr.garrison.pickNone }).click());
    expect(onCompose).toHaveBeenLastCalledWith([]);
    expect(onDrop).not.toHaveBeenCalled();
    expect(screen.getByText(fr.hand.nothingToSend)).toBeTruthy();
  });

  it('disbands on the second touch only, saying what the squad loses', () => {
    const onOffer = vi.fn();
    phone([disband], { onOffer });
    act(() => screen.getByRole('button', { name: fr.selection.disband }).click());
    expect(onOffer).not.toHaveBeenCalled();
    expect(screen.getByText(fr.compass.disbandConsequence)).toBeTruthy();
    act(() => screen.getByRole('button', { name: new RegExp(fr.hand.confirm, 'i') }).click());
    expect(onOffer).toHaveBeenCalledWith(disband);
  });

  it('says the refusal of a disbanding instead of the button', () => {
    phone([{ ...disband, refusal: 'pas de place' }]);
    expect(screen.queryByRole('button', { name: fr.selection.disband })).toBeNull();
    expect(screen.getByText('pas de place')).toBeTruthy();
  });
});
