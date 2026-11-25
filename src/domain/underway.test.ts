import { describe, expect, it } from 'vitest';
import {
  slotsRefusalOf,
  underwayLeftMs,
  underwayOf,
  type RecruitmentDue,
  type Underway,
} from './underway';
import type { ArcView, ChainView, PlayerView } from './player-view';

const LOADED = 1_000_000;

/** Rien ne court : pas de mouvement, pas de chantier, pas de lot. Chaque test ajoute une ligne. */
const board = (over: Readonly<Record<string, unknown>> = {}, arcs: ReadonlyArray<ArcView> = []) =>
  ({
    arcs,
    loadedAt: LOADED,
    me: {
      construction: null,
      constructionQueue: [],
      buildings: [
        { id: 'B-1', key: 'mine', name: 'Mine', regionId: 'FRA-1', point: [3, 50], level: 3 },
      ],
      outposts: [],
      troops: [],
      regions: [],
      chains: [],
      research: { researched: [], running: null, queue: [] },
      ...over,
    },
  }) as unknown as PlayerView;

const minutes = (count: number) => LOADED + count * 60_000;

const march = (id: string, minutesLeft: number, over: Partial<ArcView> = {}): ArcView =>
  ({
    state: 'mine',
    id,
    type: 'march',
    stack: { infantry: 2, armor: 1 },
    destinationLabel: 'Somme',
    schedule: {
      departedAt: LOADED,
      arrivesAt: minutes(minutesLeft),
      heldAt: null,
      holdUntil: null,
    },
    ...over,
  }) as ArcView;

describe('what runs, nearest first', () => {
  it('dates the card the research centre carries, and leaves one waiting for it undated', () => {
    const hq = {
      id: 'B-0',
      key: 'researchCenter',
      name: 'Centre de recherche',
      regionId: 'FRA-1',
      point: [2, 48],
      level: 1,
    };
    const running = { card: 'armor', remainingMs: 60 * 60_000, since: LOADED } as const;
    const lines = underwayOf(
      board({ buildings: [hq], research: { researched: [], running } } as never),
      [],
    );
    expect(lines.map((line) => [line.id, line.endsAt])).toEqual([
      ['research', LOADED + 60 * 60_000],
    ]);
    expect(
      underwayOf(
        board({
          buildings: [hq],
          research: { researched: [], running: { ...running, since: null } },
        } as never),
        [],
      ),
    ).toEqual([]);
  });

  it('says nothing when nothing runs', () => {
    expect(underwayOf(board(), [])).toEqual([]);
  });

  it('dates a movement at its arrival, faced by its majority role, in the amber of its thread', () => {
    const [line] = underwayOf(board({}, [march('M-1', 14)]), []);
    expect(line).toEqual({
      id: 'movement-M-1',
      endsAt: minutes(14),
      label: 'marche → Somme',
      face: { kind: 'unit', role: 'infantry' },
      place: { kind: 'movement', arcId: 'M-1' },
      moving: true,
      holdsSlot: true,
      span: 14 * 60_000,
      slotFreedAt: minutes(14),
    });
  });

  it('calls a plane flying out to drop a packet a drop, and its way home a return', () => {
    const lines = underwayOf(
      board({}, [
        march('M-1', 14, { airdrop: 'out' }),
        march('M-2', 20, { type: 'return', airdrop: 'back' }),
      ]),
      [],
    );
    expect(lines.map((line) => line.label)).toEqual(['largage → Somme', 'retour → Somme']);
  });

  it('dates a column held at a border at its resolution, not at its arrival', () => {
    const held = march('M-1', 0, {
      schedule: { departedAt: LOADED, arrivesAt: minutes(300), heldAt: LOADED, holdUntil: null },
    });
    expect(underwayOf(board({}, [held]), [])[0]?.endsAt).toBe(minutes(300));
  });

  it('leaves a detected arc out: only the player’s own countdowns run here', () => {
    const seen = { state: 'enemyDetected', id: 'E-1' } as unknown as ArcView;
    expect(underwayOf(board({}, [seen]), [])).toEqual([]);
  });

  /** Revue de #648 : la ligne d'un chantier figé le dit, et son reste ne décompte pas. */
  it('says a frozen head of the queue is frozen, and keeps what it has left', () => {
    const work = {
      id: 'W-1',
      key: 'mine',
      name: 'Mine',
      outpostId: null,
      regionId: 'FRA-1',
      point: [3, 50],
      minutesLeft: 89,
      frozen: true,
    };
    const [line] = underwayOf(board({ construction: work }), []);
    expect(line?.label).toContain('figé');
    expect(underwayLeftMs(line!, LOADED)).toBe(89 * 60_000);
    expect(underwayLeftMs(line!, LOADED + 10 * 3_600_000)).toBe(89 * 60_000);
  });

  it('names the level the head of the queue is raising the building to', () => {
    const work = {
      id: 'W-1',
      key: 'mine',
      name: 'Mine',
      outpostId: null,
      regionId: 'FRA-1',
      point: [3, 50],
      minutesLeft: 89,
    };
    const [line] = underwayOf(board({ construction: work }), []);
    expect(line?.label).toBe('Mine → niveau 4');
    expect(line?.place).toEqual({
      kind: 'building',
      regionId: 'FRA-1',
      key: 'mine',
      point: [3, 50],
    });
  });

  /** Le métier choisi à l'élévation se lit dès le chantier (ADR 0037 §3). */
  it('names the specialty a raise to level 2 carries, and a change as a change', () => {
    const outposts = [{ id: 'O-1', hostCountry: 'BEL', level: 1, standsAt: null }];
    const work = {
      id: 'W-1',
      key: 'outpost',
      name: 'élévation',
      outpostId: 'O-1',
      regionId: 'BEL-1',
      point: null,
      minutesLeft: 30,
      level: 2,
    };
    const raise = { ...work, specialty: 'store', respecialize: false };
    expect(underwayOf(board({ outposts, construction: raise }), [])[0]?.label).toBe(
      'avant-poste → niveau 2, magasin',
    );
    const change = { ...work, specialty: 'fort', respecialize: true };
    expect(
      underwayOf(board({ outposts: [{ ...outposts[0], level: 2 }], construction: change }), [])[0]
        ?.label,
    ).toBe('avant-poste → fort');
  });

  it('lists only the head of the queue, the waiting works have no hour', () => {
    const work = (id: string) => ({
      id,
      key: 'mine',
      name: 'Mine',
      outpostId: null,
      regionId: 'FRA-1',
      point: [3, 50],
      level: 1,
    });
    const lines = underwayOf(
      board({
        construction: { ...work('W-1'), minutesLeft: 89 },
        constructionQueue: [work('W-3')],
      }),
      [],
    );
    expect(lines.map((line) => line.id)).toEqual(['construction-W-1']);
  });

  it('dates a foundation at the hour its outpost stands', () => {
    const outposts = [{ id: 'O-1', hostCountry: 'BEL', level: 1, standsAt: minutes(40) }];
    const [line] = underwayOf(board({ outposts }), []);
    expect(line?.endsAt).toBe(minutes(40));
    expect(line?.place).toEqual({ kind: 'outpost', outpostId: 'O-1' });
  });

  it('dates a lot at the rate its line holds, and leaves a stalled one undated', () => {
    const lot = (state: ChainView['state'], perHour: number): ChainView =>
      ({
        by: 'arsenal',
        output: 'ammunition',
        state,
        perHour,
        nominalPerHour: 6,
        order: { ordered: 40, produced: 28 },
      }) as unknown as ChainView;
    const buildings = [{ id: 'A-1', key: 'arsenal', name: 'Arsenal', regionId: 'FRA-2', level: 2 }];
    const running = underwayOf(board({ buildings, chains: [lot('running', 2)] }), []);
    expect(running[0]?.endsAt).toBe(minutes(120));
    expect(running[0]?.label).toBe('lot · 40 munitions');

    const stalled = underwayOf(board({ buildings, chains: [lot('starved', 0)] }), []);
    expect(stalled).toEqual([]);
  });

  it('sorts every kind together, from the nearest to the farthest', () => {
    const recruitment: RecruitmentDue = {
      buildingId: 'B-2',
      key: 'barracks',
      regionId: 'FRA-3',
      regionName: 'Nord',
      endsAt: minutes(41),
    };
    const lines = underwayOf(board({}, [march('M-1', 90), march('M-2', 14)]), [recruitment]);
    expect(lines.map((line) => line.id)).toEqual([
      'movement-M-2',
      'recruitment-B-2',
      'movement-M-1',
    ]);
  });
});

/** **La ronde dans « En cours »** (#376) : « ronde → B » en route, sa halte à l'arrêt. */
describe('a patrol under way', () => {
  const outposts = [
    { id: 'P-1', hostCountry: 'DEU', regionId: 'R-1', standsAt: null },
    { id: 'P-2', hostCountry: 'DEU', regionId: 'R-2', standsAt: null },
  ];
  const regions = [
    { id: 'R-1', name: 'Rhénanie' },
    { id: 'R-2', name: 'Hesse' },
  ];
  const patrol = (haltUntil: number | null) => ({
    ends: ['P-1', 'P-2'],
    to: 'P-2',
    haltUntil,
    recalled: false,
  });

  it('names the end it walks to while on the road', () => {
    const troops = [
      {
        id: 'T',
        role: 'armor',
        stationedAt: { kind: 'outpost', outpostId: 'P-1' },
        patrol: patrol(null),
      },
    ];
    const lines = underwayOf(
      board({ outposts, regions, troops } as never, [march('M', 30, { troopIds: ['T'] } as never)]),
      [],
    );
    expect(lines.map(({ label, recall }) => [label, recall])).toEqual([['ronde → Hesse', 'T']]);
  });

  it('dates its halt in the garrison it holds', () => {
    const troops = [
      {
        id: 'T',
        role: 'armor',
        stationedAt: { kind: 'outpost', outpostId: 'P-2' },
        patrol: patrol(minutes(60)),
      },
    ];
    const [line] = underwayOf(board({ outposts, regions, troops } as never), []);
    expect(line).toMatchObject({
      id: 'patrol-T',
      endsAt: minutes(60),
      place: { kind: 'outpost', outpostId: 'P-2' },
    });
    expect(line!.label).toMatch(/^halte à Hesse jusqu’à \d\d:\d\d$/);
  });
});

describe('which lines hold a movement slot', () => {
  it('holds one for a march and none for a return, a work or a lot', () => {
    const work = {
      id: 'W-1',
      key: 'mine',
      name: 'Mine',
      outpostId: null,
      regionId: 'FRA-1',
      point: [3, 50],
      minutesLeft: 89,
    };
    const lines = underwayOf(
      board({ construction: work }, [march('M-1', 14), march('M-2', 20, { type: 'return' })]),
      [],
    );
    expect(lines.map((line) => [line.id, line.holdsSlot])).toEqual([
      ['movement-M-1', true],
      ['movement-M-2', false],
      ['construction-W-1', false],
    ]);
  });

  it('keeps the slot of a patrol or a tour past its arrival: its march frees nothing', () => {
    const lines = underwayOf(
      board(
        {
          troops: [
            { id: 'T-1', patrol: { ends: ['a', 'b'], to: 'b', haltUntil: null } },
            { id: 'T-2', tour: { baseId: 'B-1' } },
          ],
        },
        [
          march('M-1', 5, { troopIds: ['T-1'] }),
          march('M-2', 6, { troopIds: ['T-2'] }),
          march('M-3', 7, { troopIds: ['T-3'] }),
        ],
      ),
      [],
    );
    expect(lines.map((line) => [line.id, line.holdsSlot])).toEqual([
      ['movement-M-1', false],
      ['movement-M-2', false],
      ['movement-M-3', true],
    ]);
  });

  it('gives the slot back at arrival, not at the end of a walk towards a rest window', () => {
    const walking = march('M-1', 90, {
      schedule: {
        departedAt: LOADED,
        arrivesAt: minutes(90),
        heldAt: null,
        holdUntil: minutes(30),
      },
    });
    const [line] = underwayOf(board({}, [walking]), []);
    expect(line?.endsAt).toBe(minutes(30));
    expect(line?.slotFreedAt).toBe(minutes(90));
  });
});

describe('the refusal said under the movements when every slot is taken (ADR 0015)', () => {
  const held = (id: string, minutesLeft: number, holdsSlot = true, freed?: number): Underway => ({
    id,
    endsAt: minutes(minutesLeft),
    label: id,
    face: { kind: 'outpost' },
    place: { kind: 'outpost', outpostId: id },
    moving: holdsSlot,
    holdsSlot,
    ...(freed === undefined ? {} : { slotFreedAt: minutes(freed) }),
  });

  it('says nothing while a slot is free', () => {
    expect(slotsRefusalOf({ total: 2, used: 1 }, [held('a', 5)])).toBeNull();
  });

  it('names the holder that frees first, at the instant its slot is given back', () => {
    const lines = [held('a', 5, true, 50), held('r', 7, false), held('b', 9)];
    expect(slotsRefusalOf({ total: 2, used: 2 }, lines)).toEqual({
      kind: 'frees',
      line: lines[2],
      at: minutes(9),
    });
  });

  it('only says the slots are taken when the lines do not add up to the count (Halifax, a patrol, a hidden column)', () => {
    expect(slotsRefusalOf({ total: 2, used: 2 }, [held('a', 5)])).toEqual({ kind: 'engaged' });
    expect(slotsRefusalOf({ total: 2, used: 2 }, [])).toEqual({ kind: 'engaged' });
  });
});

describe('the whole length a gauge is drawn against', () => {
  it('runs a movement from its departure to its arrival, a work over the length the server dated it', () => {
    const work = {
      id: 'W-1',
      key: 'mine',
      name: 'Mine',
      outpostId: null,
      regionId: 'FRA-1',
      point: [3, 50],
      minutesLeft: 30,
      minutes: 120,
    };
    const lines = underwayOf(board({ construction: work }, [march('M-1', 14)]), []);
    expect(lines.map((line) => [line.id, line.span])).toEqual([
      ['movement-M-1', 14 * 60_000],
      ['construction-W-1', 120 * 60_000],
    ]);
  });

  it('leaves a line with no known length without one: its gauge is not drawn', () => {
    const due: RecruitmentDue = {
      buildingId: 'B-1',
      key: 'barracks',
      regionId: 'FRA-1',
      regionName: 'Loiret',
      endsAt: minutes(10),
    };
    expect(underwayOf(board(), [due])[0]?.span).toBeUndefined();
    expect(underwayOf(board(), [{ ...due, span: 60 * 60_000 }])[0]?.span).toBe(3_600_000);
  });
});
