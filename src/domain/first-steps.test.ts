import { describe, expect, it } from 'vitest';
import { cueOf, litStepOf, shownStepOf, stepsDoneIn } from './first-steps';
import type { ArcView, PlayerView, TroopView } from './player-view';

const at = { kind: 'building', buildingId: 'HQ' } as const;
const brussels = { id: 'O-1', lonLat: [4.35, 50.85], depot: { food: 0 } } as never;

const view = (
  me: Partial<PlayerView['me']> = {},
  arcs: ReadonlyArray<Partial<ArcView>> = [],
  rest: Partial<PlayerView> = {},
): PlayerView =>
  ({
    arcs,
    journal: [],
    mode: 'mondiale',
    season: { outcome: { concludedAt: null } },
    firstSteps: { done: [], shown: 'open' },
    me: {
      hqLevel: 0,
      defeated: false,
      buildings: [{ id: 'HQ', key: 'hq' }],
      troops: [],
      outposts: [],
      recruiting: [],
      research: { researched: [], running: null },
      ...me,
    },
    ...rest,
  }) as unknown as PlayerView;

const troop = (over: Partial<TroopView>): TroopView =>
  ({ id: 'T-1', role: 'infantry', tier: 1, stationedAt: at, ...over }) as TroopView;

describe('stepsDoneIn', () => {
  it('reads nothing on a new place, nor on the gift company at its headquarters', () => {
    expect(stepsDoneIn(view())).toEqual([]);
    expect(stepsDoneIn(view({ hqLevel: 1, troops: [troop({})] }))).toEqual(['hq']);
  });

  it('reads each gesture off what is under way', () => {
    expect(
      stepsDoneIn(
        view(
          {
            recruiting: ['B-1'],
            research: { researched: [], running: {} as never },
            troops: [troop({})],
          },
          [{ state: 'mine', type: 'march', troopIds: ['T-1'], delivery: true }],
        ),
      ),
    ).toEqual(['move', 'form', 'research', 'deliver']);
  });

  it('reads them off the traces they leave, for a place already played', () => {
    expect(
      stepsDoneIn(
        view({
          troops: [troop({ stationedAt: { kind: 'outpost', outpostId: 'O-1' } })],
          research: { researched: ['armor'] as never, running: null },
        }),
      ),
    ).toEqual(['move', 'research']);
    expect(stepsDoneIn(view({ troops: [troop({ role: 'landTransport' })] }))).toEqual(['form']);
    expect(
      stepsDoneIn(view({ outposts: [{ ...(brussels as object), depot: { food: 5 } } as never] })),
    ).toEqual(['deliver']);
    expect(stepsDoneIn(view({}, [], { journal: [{ kind: 'supplyDelivered' }] as never }))).toEqual([
      'deliver',
    ]);
    expect(stepsDoneIn(view({}, [], { journal: [{ kind: 'supply' }] as never }))).toEqual([]);
  });

  it('takes no march for a delivery unless the server says it is one', () => {
    expect(
      stepsDoneIn(
        view({ outposts: [brussels] }, [{ state: 'mine', type: 'outpost', troopIds: ['T-1'] }]),
      ),
    ).toEqual(['move']);
  });
});

describe('litStepOf and shownStepOf', () => {
  it('lights the first step not done, whatever order they were done in', () => {
    expect(litStepOf(['move', 'hq'])).toBe('form');
    expect(litStepOf(['hq', 'move', 'form', 'research', 'deliver'])).toBeNull();
  });

  it('shows no step once passed, in a Blitz, or to an observer', () => {
    expect(shownStepOf(view())).toBe('hq');
    expect(shownStepOf(view({}, [], { firstSteps: { done: [], shown: 'skipped' } }))).toBeNull();
    expect(shownStepOf(view({}, [], { mode: 'blitz' }))).toBeNull();
    expect(shownStepOf(view({ defeated: true }))).toBeNull();
  });
});

describe('cueOf', () => {
  it('sends the headquarters to the tile rack', () => {
    expect(cueOf('hq', view())).toEqual({ kind: 'rack', rack: 'tiles', say: 'hq' });
  });

  it('points at a standing piece to lift, never one already marching', () => {
    const marching = troop({ id: 'T-1' });
    const standing = troop({ id: 'T-2', stationedAt: { kind: 'point', lonLat: [1, 2] } as never });
    expect(
      cueOf('move', view({ troops: [marching, standing] }, [{ state: 'mine', troopIds: ['T-1'] }])),
    ).toEqual({ kind: 'piece', station: standing.stationedAt, say: 'move' });
    expect(cueOf('move', view())).toBeNull();
  });

  it('asks for a projection site before the piece rack', () => {
    expect(cueOf('form', view())).toEqual({ kind: 'rack', rack: 'tiles', say: 'tiles' });
    expect(cueOf('form', view({ buildings: [{ id: 'B-1', key: 'barracks' } as never] }))).toEqual({
      kind: 'rack',
      rack: 'pieces',
      say: 'pieces',
    });
  });

  it('asks for a research centre before the tree', () => {
    expect(cueOf('research', view())).toEqual({ kind: 'rack', rack: 'tiles', say: 'center' });
    expect(
      cueOf('research', view({ buildings: [{ id: 'C-1', key: 'researchCenter', level: 1 } as never] })),
    ).toEqual({ kind: 'rack', rack: 'research', say: 'research' });
  });

  it('founds an outpost first, then points at a transport or at the piece rack', () => {
    expect(cueOf('deliver', view({ troops: [troop({})] }))).toEqual({
      kind: 'piece',
      station: at,
      say: 'outpost',
    });
    expect(cueOf('deliver', view({ outposts: [brussels] }))).toEqual({
      kind: 'rack',
      rack: 'pieces',
      say: 'truck',
    });
    expect(
      cueOf('deliver', view({ outposts: [brussels], troops: [troop({ role: 'landTransport' })] })),
    ).toEqual({ kind: 'piece', station: at, say: 'load' });
  });
});
