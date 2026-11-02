import { describe, expect, it } from 'vitest';
import { underwayOf, type RecruitmentDue } from './underway';
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
