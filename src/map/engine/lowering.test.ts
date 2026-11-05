import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StandingMaquette } from './maquettes';
import { LOWER_MS } from './site-marks';

/** #279 : un site pris tient sa maquette le temps que son drapeau descend ; les noms du décor
 *  l'évitent, puis reviennent quand il est lâché. */
const clock = { progress: 0, at: 0, rate: 1, durationMs: 1000, rest: null };
const lost = (id: string, buildingId: string): StandingMaquette => ({
  id,
  at: { lonLat: [3, 50] },
  url: 'barracks.glb',
  span: 1,
  washed: false,
  side: 'mine',
  buildingId,
  capture: { clock, side: 'defender', stopped: false },
});

async function engineOf() {
  const { MapEngine } = await import('./index');
  const calls = { display: vi.fn(), invalidate: vi.fn(), runFlag: vi.fn() };
  const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
    lowering: new Map<string, StandingMaquette>(),
    lettingGo: new Map(),
    servedMaquettes: [] as ReadonlyArray<StandingMaquette>,
    disposed: false,
    sequences: { motion: 'full' },
    maquettes: { boxOf: () => ({}), runFlag: calls.runFlag },
    seenBig: () => true,
    displayMaquettes: calls.display,
    invalidate: calls.invalidate,
    pieceRect: (id: string) => ({ left: 1, right: 2, top: 3, bottom: 4, id }),
  });
  const proto = MapEngine.prototype as unknown as {
    takenUnderTheEyes: (served: ReadonlyArray<StandingMaquette>) => unknown;
    heldRects: () => unknown[];
  };
  return {
    engine: engine as unknown as { lowering: Map<string, unknown>; disposed: boolean },
    calls,
    /** The engine is served `served` after having stood as `before`. */
    serve: (before: ReadonlyArray<StandingMaquette>, served: ReadonlyArray<StandingMaquette>) => {
      (engine as { servedMaquettes: unknown }).servedMaquettes = before;
      proto.takenUnderTheEyes.call(engine, served);
    },
    heldRects: () => proto.heldRects.call(engine),
  };
}

describe('a site taken from me, its flag coming down (#279)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reserves its place from the decor names while held, and gives it up once let go', async () => {
    const { serve, heldRects } = await engineOf();
    expect(heldRects()).toEqual([]);
    serve([lost('building-x', 'x')], []);
    expect(heldRects()).toEqual([expect.objectContaining({ id: 'building-x' })]);
    vi.advanceTimersByTime(LOWER_MS);
    expect(heldRects()).toEqual([]);
  });

  it('asks for a frame when it lets go, that the names come back', async () => {
    const { serve, calls } = await engineOf();
    serve([lost('building-x', 'x')], []);
    expect(calls.invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(LOWER_MS);
    expect(calls.display).toHaveBeenCalledOnce();
    expect(calls.invalidate).toHaveBeenCalledOnce();
  });

  it('reads nothing once the engine is gone', async () => {
    const { serve, engine, calls } = await engineOf();
    serve([lost('building-x', 'x')], []);
    engine.disposed = true;
    vi.advanceTimersByTime(LOWER_MS);
    expect(calls.display).not.toHaveBeenCalled();
    expect(engine.lowering.has('x')).toBe(true);
  });

  it('lets the last of two takings in a row make the hour', async () => {
    const { serve, heldRects, calls } = await engineOf();
    serve([lost('building-x', 'x')], []);
    vi.advanceTimersByTime(LOWER_MS / 2);
    serve([lost('building-x', 'x')], []);
    // The first flag's hour: the second is still coming down.
    vi.advanceTimersByTime(LOWER_MS / 2);
    expect(heldRects()).toHaveLength(1);
    expect(calls.display).not.toHaveBeenCalled();
    vi.advanceTimersByTime(LOWER_MS / 2);
    expect(heldRects()).toEqual([]);
    expect(calls.display).toHaveBeenCalledOnce();
  });
});
