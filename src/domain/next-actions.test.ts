import { describe, expect, it } from 'vitest';
import { nextActionsOf, type NextActionKind } from './next-actions';
import type { ArcView, PlayerView, TroopStation, TroopView } from './player-view';

const HOME: [number, number] = [2, 47];

/** A season in order: nothing owed, a site at work, one barracks forming, no troop posted and
 *  no free slot. Each test breaks exactly one of those. */
const board = (
  over: Partial<PlayerView['me']> = {},
  arcs: ReadonlyArray<ArcView> = [],
): PlayerView =>
  ({
    arcs,
    loadedAt: 0,
    me: {
      homePosition: HOME,
      foundation: [],
      construction: { id: 'W-1' },
      buildings: [{ id: 'B-1', key: 'barracks', name: 'Caserne', regionId: 'FRA-1', level: 1 }],
      recruiting: ['B-1'],
      regions: [{ id: 'FRA-1', name: 'Rhône', point: [4.8, 45.7] }],
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
});

const kinds = (view: PlayerView): ReadonlyArray<NextActionKind> =>
  nextActionsOf(view).map((action) => action.kind);

describe('what waits for the player', () => {
  it('says nothing at all when the season is in order', () => {
    expect(nextActionsOf(board())).toEqual([]);
  });

  it('counts the placements the foundation still owes, then stops naming them', () => {
    const owed = nextActionsOf(board({ foundation: ['mine', 'mine'] }))[0];
    expect(owed?.kind).toBe('foundation');
    expect(owed?.label).toBe('2 poses de fondation offertes');
    expect(owed?.target).toEqual({ kind: 'unfold' });

    expect(kinds(board({ foundation: [] }))).not.toContain('foundation');
  });

  it('names an idle site only while nothing heads the queue', () => {
    const idle = nextActionsOf(board({ construction: null }))[0];
    expect(idle?.kind).toBe('idleSite');
    expect(idle?.target).toEqual({ kind: 'surface', surface: 'economy' });

    expect(kinds(board())).not.toContain('idleSite');
  });

  it('names a projection building with no batch in hand, by its region', () => {
    const idle = nextActionsOf(board({ recruiting: [] }))[0];
    expect(idle?.kind).toBe('idleBarracks');
    expect(idle?.label).toBe('Caserne sans recrutement — Rhône');
    expect(idle?.target).toMatchObject({ kind: 'site' });

    expect(kinds(board())).not.toContain('idleBarracks');
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
    expect(left?.target).toEqual({ kind: 'map', point: [7.7, 45] });

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

  /** A free slot with nothing to send is not a thing to do — it is a fact about the empire. */
  it('offers a free slot only when something can leave', () => {
    const idle = board({
      slots: { total: 2, used: 1 },
      troops: [troop({ stationedAt: { kind: 'building', buildingId: 'B-1' } })],
    });
    const line = nextActionsOf(idle).find((action) => action.kind === 'freeSlot');
    expect(line?.label).toBe('1 slot de mouvement libre');
    expect(line?.target).toEqual({ kind: 'map', point: [4.8, 45.7] });

    expect(kinds(board({ slots: { total: 2, used: 1 }, troops: [] }))).not.toContain('freeSlot');
    expect(
      kinds(
        board({
          slots: { total: 2, used: 2 },
          troops: [troop({ stationedAt: { kind: 'building', buildingId: 'B-1' } })],
        }),
      ),
    ).not.toContain('freeSlot');
  });

  /** A troop carried by a movement of mine is not standing anywhere: it owes no order, it fills
   *  no slot, and it is the one exclusion both lines share. */
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
      foundation: ['mine' as const],
      construction: null,
      recruiting: [],
      slots: { total: 2, used: 1 },
      troops: [troop({ stationedAt: posted('ITA', [7.7, 45]), supplied: false })],
    };
    expect(kinds(board(owing)).length).toBeGreaterThan(0);
    expect(kinds(board({ ...owing, defeated: true }))).toEqual([]);
  });

  it('holds the reading order: what is owed, then what produces, then what stands', () => {
    const busy = board({
      foundation: ['mine'],
      construction: null,
      recruiting: [],
      slots: { total: 2, used: 1 },
      troops: [troop({ stationedAt: posted('ITA', [7.7, 45]), supplied: false })],
    });
    expect(kinds(busy)).toEqual([
      'foundation',
      'idleSite',
      'idleBarracks',
      'troopWithoutOrder',
      'unsupplied',
      'freeSlot',
    ]);
  });
});
