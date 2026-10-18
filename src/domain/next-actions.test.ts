import { describe, expect, it } from 'vitest';
import { nextActionsOf, type NextActionKind } from './next-actions';
import type { ArcView, PlayerView, TroopStation, TroopView } from './player-view';

const HOME: [number, number] = [2, 47];

/** A season in order: nothing owed, a site at work, one barracks forming, no troop posted and
 *  no free slot. Each test breaks exactly one of those. */
const board = (
  over: Partial<PlayerView['me']> = {},
  arcs: ReadonlyArray<ArcView> = [],
  captures: PlayerView['captures'] = [],
): PlayerView =>
  ({
    arcs,
    captures,
    loadedAt: 0,
    season: { outcome: { concludedAt: null } },
    me: {
      homePosition: HOME,
      hqLevel: 1,
      foundation: [],
      construction: { id: 'W-1', outpostId: null },
      constructionQueue: [],
      resources: {},
      buildings: [{ id: 'B-1', key: 'barracks', name: 'Caserne', regionId: 'FRA-1', level: 1 }],
      recruiting: ['B-1'],
      regions: [{ id: 'FRA-1', name: 'Rhône', point: [4.8, 45.7], linked: true }],
      outposts: [],
      slots: { total: 2, used: 2 },
      troops: [],
      ...over,
    },
  }) as unknown as PlayerView;

const troop = (over: Partial<TroopView> & { stationedAt: TroopStation }): TroopView =>
  ({
    id: 'T-1',
    role: 'infantry',
    strength: 50,
    nominalStrength: 50,
    supplied: true,
    ...over,
  }) as TroopView;

const posted = (country: string, lonLat: [number, number]): TroopStation => ({
  kind: 'point',
  lonLat,
  country,
  afloat: false,
  coastal: false,
});

const kinds = (view: PlayerView): ReadonlyArray<NextActionKind> =>
  nextActionsOf(view).map((action) => action.kind);

const capture = (
  side: 'capturer' | 'defender',
  stoppedAt: number | null = null,
): PlayerView['captures'][number] => ({
  id: `C-${side}`,
  side,
  target: { kind: 'building', id: 'B-9' },
  site: { kind: 'building', building: 'foundry', regionId: 'FRA-69' },
  regionName: 'Lyon',
  point: [4.8, 45.7],
  clock: { progress: 0, at: 0, rate: 1, durationMs: 3_600_000, rest: null },
  completesAt: Date.UTC(2026, 9, 14, 12, 20),
  stoppedAt,
});

describe('a capture', () => {
  it('does not list the troop that captures as idle', () => {
    const view = board(
      { troops: [troop({ stationedAt: posted('PRT', [4.8, 45.7]) })] },
      [],
      [capture('capturer')],
    );
    expect(kinds(view)).not.toContain('troopWithoutOrder');
  });

  it('lists it again once the capture is stopped', () => {
    const view = board(
      { troops: [troop({ stationedAt: posted('PRT', [4.8, 45.7]) })] },
      [],
      [capture('capturer', 1)],
    );
    expect(kinds(view)).toContain('troopWithoutOrder');
  });

  it('puts the defender’s site first, with the hour it is lost, and recentres on it', () => {
    const [first] = nextActionsOf(board({}, [], [capture('defender')]));
    expect(first?.kind).toBe('siteUnderCapture');
    expect(first?.label).toMatch(/^Fonderie de Lyon : capture en cours, perdue vers /);
    expect(first?.targets).toEqual([{ kind: 'map', point: [4.8, 45.7] }]);
  });

  it('tells the capturer a capture stopped, and nothing while it runs', () => {
    expect(kinds(board({}, [], [capture('capturer')]))).toEqual([]);
    const [stopped] = nextActionsOf(board({}, [], [capture('capturer', 10)]));
    expect(stopped?.kind).toBe('captureStopped');
    expect(stopped?.label).toBe(
      'Capture de Fonderie de Lyon arrêtée : plus d’infanterie sur place',
    );
  });
});

describe('what waits for the player', () => {
  it('says nothing at all when the season is in order', () => {
    expect(nextActionsOf(board())).toEqual([]);
  });

  it('counts the placements the foundation still owes, then stops naming them', () => {
    const owed = nextActionsOf(
      board({
        foundation: [
          { key: 'mine', deposit: 'ore' },
          { key: 'mine', deposit: 'coal' },
        ],
      }),
    )[0];
    expect(owed?.kind).toBe('foundation');
    expect(owed?.label).toBe('2 poses de fondation offertes');
    expect(owed?.targets).toEqual([{ kind: 'unfold' }]);

    expect(kinds(board({ foundation: [] }))).not.toContain('foundation');
  });

  /**
   * **Sans quartier général, une seule ligne** (décision 1b du 13/09). Rien ne se bâtit avant
   * lui, donc « chantier libre » mènerait à une surface où le joueur ne peut rien commander.
   */
  it('shows the foundation alone while the headquarters is owed', () => {
    const actions = nextActionsOf(
      board({
        hqLevel: 0,
        construction: null,
        buildings: [],
        recruiting: [],
        foundation: [{ key: 'hq', deposit: null }],
      }),
    );
    expect(actions.map((action) => action.kind)).toEqual(['foundation']);
    expect(actions[0]?.label).toBe('1 pose de fondation offerte');
  });

  /**
   * **Une ligne pour tous les sites coupés** (ADR 0020 §6). Ils le sont par la même chose — une
   * région qui a changé de couleur — et une ligne par bâtiment ferait de la perte d'une frontière
   * six attentes distinctes. Elle mène au premier, comme une caserne au repos mène à la sienne.
   */
  it('raises one line for every site the map has cut, and walks through them', () => {
    const cut = board({
      buildings: [
        { id: 'B-1', key: 'barracks', name: 'Caserne', regionId: 'FRA-1', level: 1 },
        { id: 'B-2', key: 'oilWell', name: 'Puits', regionId: 'ROU-1', level: 1 },
        { id: 'B-3', key: 'foundry', name: 'Fonderie', regionId: 'ROU-1', level: 1 },
      ],
      regions: [
        { id: 'FRA-1', name: 'Rhône', point: [4.8, 45.7], linked: true },
        { id: 'ROU-1', name: 'Prahova', point: [26, 45.1], linked: false },
      ],
    } as unknown as Partial<PlayerView['me']>);

    const line = nextActionsOf(cut).find((action) => action.kind === 'unlinkedSites');
    expect(line?.label).toBe('2 sites hors réseau');
    expect(line?.targets).toEqual([
      { kind: 'site', buildingId: 'B-2' },
      { kind: 'site', buildingId: 'B-3' },
    ]);

    // La caserne est sur un sol relié, et de toute façon elle ne produit rien.
    expect(kinds(board())).not.toContain('unlinkedSites');
  });

  it('names an idle site only while nothing heads the queue', () => {
    const idle = nextActionsOf(board({ construction: null }))[0];
    expect(idle?.kind).toBe('idleSite');
    expect(idle?.targets).toEqual([{ kind: 'surface', surface: 'economy' }]);

    expect(kinds(board())).not.toContain('idleSite');
  });

  it('names a projection building with no batch in hand, by its region', () => {
    const idle = nextActionsOf(board({ recruiting: [] }))[0];
    expect(idle?.kind).toBe('idleProjection');
    expect(idle?.label).toBe('Caserne sans recrutement — Rhône');
    expect(idle?.targets).toEqual([{ kind: 'site', buildingId: 'B-1' }]);

    expect(kinds(board())).not.toContain('idleProjection');
  });

  /** A garrison holds something; a column left on open ground holds nothing and waits. */
  it('counts the troops left on the map, and never those in a garrison', () => {
    const left = nextActionsOf(
      board({
        slots: { total: 1, used: 1 },
        troops: [
          troop({ id: 'T-1', stationedAt: posted('ITA', [7.7, 45]) }),
          troop({ id: 'T-2', stationedAt: posted('ITA', [7.7, 45]) }),
        ],
      }),
    )[0];
    expect(left?.kind).toBe('troopWithoutOrder');
    expect(left?.label).toBe('2 troupes sans ordre — Italie');
    expect(left?.targets).toEqual([{ kind: 'map', point: [7.7, 45] }]);

    const held = board({
      slots: { total: 1, used: 1 },
      troops: [troop({ stationedAt: { kind: 'outpost', outpostId: 'AP-1' } })],
    });
    expect(kinds(held)).not.toContain('troopWithoutOrder');
  });

  it('names a troop out of supply wherever it stands, and says nothing of a fed one', () => {
    const starved = board({
      slots: { total: 1, used: 1 },
      troops: [troop({ stationedAt: posted('', [-30, 40]), supplied: false })],
    });
    const line = nextActionsOf(starved).find((action) => action.kind === 'unsupplied');
    expect(line?.label).toBe('1 troupe hors ravitaillement — en mer');

    expect(
      kinds(board({ troops: [troop({ stationedAt: posted('ITA', [7.7, 45]) })] })),
    ).not.toContain('unsupplied');
  });

  /** A troop carried by a movement of mine is not standing anywhere: it owes no order,  */
  it('forgets a troop that is already marching', () => {
    const marching = board(
      {
        slots: { total: 2, used: 1 },
        troops: [troop({ id: 'T-9', stationedAt: posted('ITA', [7.7, 45]) })],
      },
      [{ state: 'mine', id: 'M-1', troopIds: ['T-9'] } as unknown as ArcView],
    );
    expect(kinds(marching)).toEqual([]);
  });

  /** Rien n'attend un observateur : la carte n'a pas d'état fermé, son absence est cet état. */
  it('disparaît pour un joueur qui a déposé les armes', () => {
    const owing = {
      foundation: [{ key: 'mine', deposit: 'ore' } as const],
      construction: null,
      recruiting: [],
      slots: { total: 2, used: 1 },
      troops: [troop({ stationedAt: posted('ITA', [7.7, 45]), supplied: false })],
    };
    expect(kinds(board(owing)).length).toBeGreaterThan(0);
    expect(kinds(board({ ...owing, defeated: true }))).toEqual([]);
  });

  it('waits on nobody once the season is concluded', () => {
    const view = board({ troops: [troop({ stationedAt: posted('ITA', [7.7, 45]) })] });
    const over = {
      ...view,
      season: {
        ...view.season,
        outcome: { concludedAt: 1, winnerNation: null },
      },
    } as PlayerView;
    expect(kinds(over)).toEqual([]);
  });

  it('holds the reading order: what is owed, then what produces, then what stands', () => {
    const busy = board({
      foundation: [{ key: 'mine', deposit: 'ore' }],
      construction: null,
      recruiting: [],
      slots: { total: 2, used: 1 },
      troops: [troop({ stationedAt: posted('ITA', [7.7, 45]), supplied: false })],
    });
    expect(kinds(busy)).toEqual([
      'foundation',
      'idleSite',
      'idleProjection',
      'troopWithoutOrder',
      'unsupplied',
    ]);
  });

  /** Retour de Pierre (05/10) : sept piles posées sur six points, dont six hors ravitaillement,
   *  deux bâtiments de projection au repos et un avant-poste plein faisaient seize lignes. */
  describe('une ligne par sorte', () => {
    const scattered = () =>
      board({
        recruiting: [],
        buildings: [
          { id: 'B-1', key: 'barracks', name: 'Caserne', regionId: 'FRA-1', level: 1 },
          { id: 'B-2', key: 'airfield', name: 'Aérodrome', regionId: 'FRA-1', level: 1 },
        ],
        troops: [
          troop({ id: 'T-1', stationedAt: posted('CAN', [-75, 45]) }),
          troop({ id: 'T-2', stationedAt: posted('CAN', [-75, 45]), supplied: false }),
          troop({ id: 'T-3', stationedAt: posted('CAN', [-80, 50]), supplied: false }),
          troop({ id: 'T-4', stationedAt: posted('CAN', [-90, 52]), supplied: false }),
          troop({ id: 'T-5', stationedAt: posted('CAN', [-100, 53]), supplied: false }),
          troop({ id: 'T-6', stationedAt: posted('CAN', [-110, 54]), supplied: false }),
          troop({ id: 'T-7', stationedAt: posted('CAN', [-120, 55]), supplied: false }),
        ],
      } as unknown as Partial<PlayerView['me']>);

    it('never raises two lines of the same kind', () => {
      const all = kinds(scattered());
      expect(new Set(all).size).toBe(all.length);
      expect(all).toEqual(['idleProjection', 'troopWithoutOrder', 'unsupplied']);
    });

    it('gives the total without a place when there are several, and a rank per address', () => {
      const lines = nextActionsOf(scattered());
      const unordered = lines.find((line) => line.kind === 'troopWithoutOrder');
      expect(unordered?.label).toBe('7 troupes sans ordre');
      expect(unordered?.targets).toHaveLength(6);
      expect(lines.find((line) => line.kind === 'unsupplied')?.label).toBe(
        '6 troupes hors ravitaillement',
      );
      expect(lines.find((line) => line.kind === 'idleProjection')?.label).toBe(
        '2 bâtiments sans recrutement',
      );
    });

    it('keeps a single address in full letters, with its troop count', () => {
      const line = nextActionsOf(
        board({
          troops: [
            troop({ id: 'T-1', stationedAt: posted('CAN', [-75, 45]) }),
            troop({ id: 'T-2', stationedAt: posted('CAN', [-75, 45]) }),
          ],
        }),
      ).find((action) => action.kind === 'troopWithoutOrder');
      expect(line?.label).toBe('2 troupes sans ordre — Canada');
      expect(line?.targets).toHaveLength(1);
    });

    it('orders the targets the same way from one render to the next', () => {
      expect(nextActionsOf(scattered())).toEqual(nextActionsOf(scattered()));
    });
  });
});

describe('a Blitz', () => {
  const blitz = (over: Partial<PlayerView['me']>, neutralSites: PlayerView['neutralSites'] = []) =>
    ({
      ...board({
        construction: null,
        regions: [{ id: 'FRA-1', name: 'Rhône', point: [2, 47], linked: true }],
        ...over,
      } as Partial<PlayerView['me']>),
      mode: 'blitz',
      theatre: 'europe',
      neutralSites,
    }) as PlayerView;
  const hq = {
    id: 'B-hq',
    key: 'hq',
    name: 'QG',
    regionId: 'FRA-1',
    level: 1,
    point: null,
  } as unknown as PlayerView['me']['buildings'][number];

  it('asks for a recruit at the HQ as at a barracks, and never for a building site', () => {
    expect(kinds(blitz({ buildings: [hq], recruiting: [] }))).toEqual(['idleProjection']);
    expect(kinds(blitz({ buildings: [hq], recruiting: ['B-hq'] }))).toEqual([]);
  });

  it('asks nothing of a building one of mine holds: it is not free (U6)', () => {
    const guard = troop({ stationedAt: { kind: 'building', buildingId: 'B-hq' } });
    expect(kinds(blitz({ buildings: [hq], recruiting: [], troops: [guard] }))).not.toContain(
      'idleProjection',
    );
  });

  it('points at the neutral cities within reach, the nearest first', () => {
    const [line] = nextActionsOf(
      blitz({ buildings: [hq], recruiting: ['B-hq'] }, [
        { id: 'far', key: 'city', regionId: 'R-far', point: [30, 60] },
        { id: 'near', key: 'city', regionId: 'R-near', point: [3, 47] },
        { id: 'port', key: 'port', regionId: 'R-port', point: [2.5, 47] },
        { id: 'next', key: 'city', regionId: 'R-next', point: [5, 47] },
      ]),
    );
    expect(line).toMatchObject({
      kind: 'neutralCity',
      label: '2 villes neutres à prendre',
      targets: [
        { kind: 'map', point: [3, 47] },
        { kind: 'map', point: [5, 47] },
      ],
    });
  });
});
