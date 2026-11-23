// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr, roleLabel } from '@/i18n/fr';
import type { PlayerView, TroopView } from '@/domain/player-view';
import type { Offer } from '@/domain/offers';
import { HandSheet } from './HandSheet';
import type { HandAim } from './hand-aim';
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
    act(() => screen.getByRole('button', { name: new RegExp(fr.hand.gauges, 'i') }).click());
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
    expect(
      screen.getAllByRole('button', { name: new RegExp(fr.hand.disembark, 'i') }).length,
    ).toBeGreaterThan(0);
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

describe('HandSheet disembarking, passenger by passenger', () => {
  const held = [
    troop('truck', 'landTransport'),
    { ...troop('a', 'infantry'), carriedBy: 'truck' },
    { ...troop('b', 'armor'), carriedBy: 'truck' },
  ];
  const view = (mode: string) =>
    ({
      mode,
      arcs: [],
      me: {
        nation: 'france',
        stationedCargo: [],
        troops: held,
        buildings: [],
        lootPoints: [],
        upkeep: { troops: 2 },
      },
    }) as unknown as PlayerView;
  const sheet = (mode: string, afloat: boolean, onOffer: (offer: Offer) => void = () => {}) => {
    const at = { ...station, afloat };
    const offers = handOffersOf(
      view(mode),
      { station: at, troopIds: ['truck', 'a', 'b'] },
      null,
      0,
      null,
    );
    render(
      <HandSheet
        view={view(mode)}
        station={at}
        place="Portugal"
        held={held}
        troopIds={['truck', 'a', 'b']}
        offers={offers}
        onCompose={() => {}}
        onOffer={onOffer}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />,
    );
  };

  it('sets one rider ashore from the desk sheet, the other staying aboard', () => {
    const onOffer = vi.fn();
    sheet('mondiale', false, onOffer);
    const buttons = screen.getAllByRole('button', { name: new RegExp(fr.hand.disembark, 'i') });
    expect(buttons).toHaveLength(2);
    act(() => buttons[1]!.click());
    expect(onOffer).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'disembark', troopIds: ['b'] }),
    );
  });

  it('says the refusal in a Blitz strip, in place of the button', () => {
    sheet('blitz', true);
    expect(screen.queryByRole('button', { name: fr.hand.disembark })).toBeNull();
    expect(screen.getAllByText(fr.errors.DISEMBARK_AT_SEA()).length).toBeGreaterThan(0);
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

  it('says what the steel lacks in place of « fonder » (ADR 0015)', () => {
    const lacking = {
      ...foundingView,
      mode: 'mondiale',
      arcs: [],
      me: {
        ...foundingView.me,
        troops: [troop('inf', 'infantry')],
        buildings: [],
        lootPoints: [],
        resources: { steel: { stock: 4, ratePerHour: 0, cap: 500 } },
      },
    } as unknown as PlayerView;
    const offers = handOffersOf(
      lacking,
      { station, troopIds: ['inf'] },
      {
        kind: 'force',
        id: 'p',
        country: 'FRA',
        name: 'x',
        headcount: 1,
        ground: 'land',
        station,
        regionId: null,
      },
      0,
      null,
    );
    render(
      <HandSheet
        view={lacking}
        station={station}
        place="x"
        held={[troop('inf', 'infantry')]}
        troopIds={['inf']}
        offers={offers}
        onCompose={() => {}}
        onOffer={() => {}}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: new RegExp(fr.hand.found, 'i') })).toBeNull();
    expect(
      screen.getByText(
        fr.errors.INSUFFICIENT_RESOURCE({ resource: 'steel', needed: 20, available: 4 }),
      ),
    ).toBeTruthy();
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
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());
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
    expect(screen.getByRole('button', { name: fr.hand.confirm(disband.loses) })).toBeTruthy();
    act(() => {
      vi.setSystemTime(Date.now() + 400);
      screen.getByRole('button', { name: new RegExp(fr.hand.confirm(null), 'i') }).click();
    });
    expect(onOffer).toHaveBeenCalledWith(disband);
  });

  it('says what the squad loses on the confirm button itself, on one line', () => {
    phone([disband]);
    act(() => screen.getByRole('button', { name: fr.selection.disband }).click());
    const confirm = screen.getByRole('button', { name: fr.hand.confirm(disband.loses) });
    expect(confirm.textContent).toBe(fr.hand.confirm(disband.loses));
    expect(confirm.querySelector('span')).toBeNull();
  });

  it('ignores a second touch that follows the first within 300 ms', () => {
    const onOffer = vi.fn();
    phone([disband], { onOffer });
    act(() => screen.getByRole('button', { name: fr.selection.disband }).click());
    act(() => {
      vi.setSystemTime(Date.now() + 100);
      screen.getByRole('button', { name: new RegExp(fr.hand.confirm(null), 'i') }).click();
    });
    expect(onOffer).not.toHaveBeenCalled();
  });

  it('forgets the confirmation when the hand, the tab or the offer changes', () => {
    const props = (troopIds: string[], offer: Offer) => (
      <HandSheet
        view={foundingView}
        station={station}
        place="Saône-et-Loire"
        held={held}
        troopIds={troopIds}
        offers={[offer]}
        onCompose={() => {}}
        onOffer={() => {}}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />
    );
    const armed = () =>
      screen.queryByRole('button', { name: new RegExp(fr.hand.confirm(null), 'i') });
    const arm = () => act(() => screen.getByRole('button', { name: fr.selection.disband }).click());
    const { rerender } = render(props(['inf', 'tank'], disband));
    arm();
    expect(armed()).not.toBeNull();
    rerender(props(['inf'], disband));
    expect(armed()).toBeNull();
    arm();
    act(() => screen.getByRole('tab', { name: fr.stats.rubrics.move }).click());
    expect(armed()).toBeNull();
    arm();
    rerender(props(['inf'], { ...disband, point: [5, 47] }));
    expect(armed()).toBeNull();
  });

  it('says the refusal of a disbanding instead of the button', () => {
    phone([{ ...disband, refusal: 'pas de place' }]);
    expect(screen.queryByRole('button', { name: fr.selection.disband })).toBeNull();
    expect(screen.getByText('pas de place')).toBeTruthy();
  });
});

/** **Au téléphone, le doigt vise et « Envoyer » ordonne** (#586) : la feuille épingle la visée,
 *  sa ligne, ses verbes et ses deux boutons ; un refus remplace « Envoyer ». */
describe('HandSheet aiming on a phone', () => {
  beforeEach(() =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  const held = [troop('inf', 'infantry'), troop('tank', 'armor')];
  const aim = (patch: Partial<HandAim> = {}): HandAim => ({
    verbs: ['Marcher'],
    chosen: 0,
    line: 'Marcher → près de Bourges · ≈ 177 km · 8 h 51',
    refusal: null,
    ...patch,
  });
  const sheet = (
    aimed: HandAim | null,
    spies: Partial<{
      onSend: () => void;
      onCancelAim: () => void;
      onChooseVerb: (index: number) => void;
      onDrop: () => void;
    }> = {},
    troopIds: ReadonlyArray<string> = ['inf', 'tank'],
  ) =>
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
        troopIds={troopIds}
        offers={[]}
        aim={aimed}
        onChooseVerb={spies.onChooseVerb ?? (() => {})}
        onSend={spies.onSend ?? (() => {})}
        onCancelAim={spies.onCancelAim ?? (() => {})}
        onCompose={() => {}}
        onOffer={() => {}}
        onOpenGunnery={() => {}}
        onDrop={spies.onDrop ?? (() => {})}
        onApproach={() => {}}
      />,
    );

  it('says how many are ticked and to touch the map, while nothing is aimed', () => {
    sheet(null);
    expect(screen.getByText(fr.hand.pickedAim(2))).toBeTruthy();
    expect(screen.queryByRole('button', { name: fr.hand.send })).toBeNull();
  });

  it('puts the long-press help in the pinned line, and no hint in the body that the peek would cut', () => {
    sheet(null);
    expect(fr.hand.pickedAim(2)).toContain('appui long pour la porter');
    expect(screen.queryByText(fr.hand.hint)).toBeNull();
  });

  it('shows the aim line with « Envoyer » and « Annuler »: the first sends, the second keeps the piece', () => {
    const onSend = vi.fn();
    const onCancelAim = vi.fn();
    const onDrop = vi.fn();
    sheet(aim(), { onSend, onCancelAim, onDrop });
    expect(screen.getByText(aim().line)).toBeTruthy();
    act(() => screen.getByRole('button', { name: fr.hand.send }).click());
    expect(onSend).toHaveBeenCalledTimes(1);
    act(() => screen.getByRole('button', { name: fr.hand.cancelAim }).click());
    expect(onCancelAim).toHaveBeenCalledTimes(1);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('puts the refusal where « Envoyer » was, « Annuler » staying', () => {
    sheet(aim({ refusal: 'Aucune route terrestre vers cette destination.' }));
    expect(screen.queryByRole('button', { name: fr.hand.send })).toBeNull();
    expect(screen.getByText('Aucune route terrestre vers cette destination.')).toBeTruthy();
    expect(screen.getByRole('button', { name: fr.hand.cancelAim })).toBeTruthy();
  });

  it('offers a row of verbs when the point takes several, the first being chosen', () => {
    const onChooseVerb = vi.fn();
    sheet(aim({ verbs: ['Marcher', 'Attaquer'] }), { onChooseVerb });
    expect(screen.getByRole('radio', { name: 'Marcher' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    act(() => screen.getByRole('radio', { name: 'Attaquer' }).click());
    expect(onChooseVerb).toHaveBeenCalledWith(1);
  });

  it('has no row of verbs for a single one', () => {
    sheet(aim());
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('offers no « Envoyer » at zero ticked, and the phrase says why', () => {
    sheet(aim(), {}, []);
    expect(screen.queryByRole('button', { name: fr.hand.send })).toBeNull();
    expect(screen.getByText(fr.hand.pickedNone)).toBeTruthy();
  });

  it('pins the aim under the header, outside the scrolling body', () => {
    sheet(aim());
    const send = screen.getByRole('button', { name: fr.hand.send });
    expect(send.closest('[role="dialog"] > .shrink-0')).not.toBeNull();
  });
});

/** **La fiche bornée du bureau** (#619) : cinq chiffres, jauges derrière un bouton, les ordres au
 *  pied, et une feuille de route par transport chargeable. */
describe('HandSheet at the desk, bounded', () => {
  const view = {
    mode: 'mondiale',
    me: { nation: 'france', stationedCargo: [], troops: [], upkeep: { troops: 3 } },
  } as unknown as PlayerView;
  const held = [troop('t', 'landTransport'), { ...troop('i', 'infantry'), carriedBy: 't' }];
  const sheet = (props: Partial<Parameters<typeof HandSheet>[0]> = {}) => (
    <HandSheet
      view={view}
      station={station}
      place="Eure-et-Loir"
      held={held}
      troopIds={['t', 'i']}
      onCompose={() => {}}
      offers={[]}
      onOffer={() => {}}
      onOpenGunnery={() => {}}
      onDrop={() => {}}
      onApproach={() => {}}
      {...props}
    />
  );

  it('folds the gauges behind a button: five figures, then the whole block on demand', () => {
    const { container } = render(sheet());
    expect(container.querySelectorAll('[data-essential]')).toHaveLength(5);
    expect(container.querySelector('[data-testid="stat-lines"]')).toBeNull();
    const more = screen.getByRole('button', { name: new RegExp(fr.hand.gauges, 'i') });
    act(() => more.click());
    expect(container.querySelector('[data-testid="stat-lines"]')).not.toBeNull();
    act(() => more.click());
    expect(container.querySelector('[data-testid="stat-lines"]')).toBeNull();
  });

  it('keeps the orders in a foot that does not scroll with the body', () => {
    const offer: Offer = {
      key: 'disembark',
      rank: 'thumb',
      refusal: null,
      loses: null,
      troopIds: ['i'],
    };
    render(sheet({ offers: [offer], onTour: () => {} }));
    const order = screen.getByRole('button', { name: new RegExp(fr.tourSheet.open, 'i') });
    const body = document.querySelector('.overflow-y-auto')!;
    expect(body.contains(order)).toBe(false);
    expect(body.contains(document.querySelector('[data-essential]'))).toBe(true);
  });

  it('opens the route sheet of each loadable transport, and of nothing else', () => {
    const onTour = vi.fn();
    render(sheet({ onTour }));
    const open = screen.getAllByRole('button', { name: new RegExp(fr.tourSheet.open, 'i') });
    expect(open).toHaveLength(1);
    act(() => open[0]!.click());
    expect(onTour).toHaveBeenCalledWith('t');
    cleanup();
    render(sheet({ onTour, held: [troop('i', 'infantry')], troopIds: ['i'] }));
    expect(screen.queryByRole('button', { name: new RegExp(fr.tourSheet.open, 'i') })).toBeNull();
  });

  it('offers no route sheet where the hand has none to open', () => {
    render(sheet());
    expect(screen.queryByRole('button', { name: new RegExp(fr.tourSheet.open, 'i') })).toBeNull();
  });

  it('says the help on one line in the foot, gauges open or not', () => {
    render(sheet());
    const help = screen.getByText(fr.hand.hintShort);
    expect(document.querySelector('.overflow-y-auto')!.contains(help)).toBe(false);
    act(() => screen.getByRole('button', { name: new RegExp(fr.hand.gauges, 'i') }).click());
    expect(screen.getByText(fr.hand.hintShort).className).toContain('truncate');
  });

  it('lets one rider step down from its own line, where the pile’s tag used to', () => {
    const onOffer = vi.fn();
    const offer: Offer = {
      key: 'disembark',
      rank: 'thumb',
      refusal: null,
      loses: null,
      troopIds: ['i', 'j'],
    };
    render(
      sheet({
        onOffer,
        offers: [offer],
        held: [
          troop('t', 'landTransport'),
          { ...troop('i', 'infantry'), carriedBy: 't' },
          { ...troop('j', 'infantry'), carriedBy: 't' },
        ],
        troopIds: ['t', 'i', 'j'],
      }),
    );
    const rows = document.querySelector('.overflow-y-auto')!.querySelectorAll('button');
    const step = [...rows].filter((one) => one.textContent === fr.hand.disembark);
    expect(step).toHaveLength(2);
    act(() => step[0]!.click());
    expect(onOffer).toHaveBeenCalledWith({ ...offer, troopIds: ['i'] });
  });

  it('reads the tour a transport waits on, under its route sheet button', () => {
    const waiting = {
      ...troop('t', 'landTransport'),
      tour: {
        baseId: 'b',
        stops: [{ kind: 'depot' as const, id: 'd' }],
        waiting: { why: 'full' as const },
        recalled: false,
        skipped: [],
      },
    } as unknown as TroopView;
    render(sheet({ onTour: () => {}, held: [waiting], troopIds: ['t'] }));
    expect(screen.getByText(/tournée · attend : dépôts pleins/)).toBeTruthy();
  });
});
