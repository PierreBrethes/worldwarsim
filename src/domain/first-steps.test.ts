import { describe, expect, it } from 'vitest';
import { cueOf, litStepOf, stepsDoneIn } from './first-steps';
import type { ArcView, PlayerView, TroopView } from './player-view';

const at = { kind: 'building', buildingId: 'HQ' } as const;

const view = (
  me: Partial<PlayerView['me']> = {},
  arcs: ReadonlyArray<Partial<ArcView>> = [],
): PlayerView =>
  ({
    arcs,
    me: {
      hqLevel: 0,
      buildings: [],
      troops: [],
      outposts: [],
      recruiting: [],
      research: { researched: [], running: null },
      ...me,
    },
  }) as unknown as PlayerView;

const troop = (over: Partial<TroopView>): TroopView =>
  ({ id: 'T-1', role: 'infantry', stationedAt: at, ...over }) as TroopView;

describe('stepsDoneIn', () => {
  it('reads nothing on a new place', () => {
    expect(stepsDoneIn(view())).toEqual([]);
  });

  it('reads each gesture off the state it leaves', () => {
    const truck = troop({ id: 'T-2', role: 'landTransport', load: { food: 10 } as never });
    expect(
      stepsDoneIn(
        view(
          {
            hqLevel: 1,
            recruiting: ['B-1'],
            research: { researched: [], running: {} as never },
            troops: [truck],
            outposts: [{ id: 'O-1', lonLat: [4.35, 50.85] } as never],
          },
          [{ state: 'mine', type: 'march', troopIds: ['T-2'], to: [4.35, 50.85] }],
        ),
      ),
    ).toEqual(['hq', 'move', 'form', 'research', 'deliver']);
  });

  it('does not take an empty transport on its way to an outpost for a delivery', () => {
    expect(
      stepsDoneIn(
        view(
          {
            troops: [troop({ role: 'landTransport' })],
            outposts: [{ id: 'O-1', lonLat: [4.35, 50.85] } as never],
          },
          [{ state: 'mine', type: 'march', troopIds: ['T-1'], to: [4.35, 50.85] }],
        ),
      ),
    ).toEqual(['move']);
  });

  it('counts a card already won as research done', () => {
    expect(stepsDoneIn(view({ research: { researched: ['armor'], running: null } }))).toEqual([
      'research',
    ]);
  });
});

describe('litStepOf', () => {
  it('lights the first step not done, whatever order they were done in', () => {
    expect(litStepOf(['move', 'hq'])).toBe('form');
    expect(litStepOf(['hq', 'move', 'form', 'research', 'deliver'])).toBeNull();
  });
});

describe('cueOf', () => {
  it('sends the headquarters to the tile rack', () => {
    expect(cueOf('hq', view())).toEqual({ kind: 'rack', rack: 'tiles' });
  });

  it('points at a standing piece to lift, never one already marching', () => {
    const marching = troop({ id: 'T-1' });
    const standing = troop({ id: 'T-2', stationedAt: { kind: 'point', lonLat: [1, 2] } as never });
    expect(
      cueOf('move', view({ troops: [marching, standing] }, [{ state: 'mine', troopIds: ['T-1'] }])),
    ).toEqual({ kind: 'piece', station: standing.stationedAt });
    expect(cueOf('move', view())).toBeNull();
  });

  it('asks for a projection site before the piece rack', () => {
    expect(cueOf('form', view())).toEqual({ kind: 'rack', rack: 'tiles' });
    expect(cueOf('form', view({ buildings: [{ id: 'B-1', key: 'barracks' } as never] }))).toEqual({
      kind: 'rack',
      rack: 'pieces',
    });
  });

  it('points at a transport, or at the piece rack to form one', () => {
    expect(cueOf('deliver', view())).toEqual({ kind: 'rack', rack: 'pieces' });
    expect(cueOf('deliver', view({ troops: [troop({ role: 'landTransport' })] }))).toEqual({
      kind: 'piece',
      station: at,
    });
  });
});
