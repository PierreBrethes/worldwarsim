import { describe, expect, it, vi } from 'vitest';
import type { StandingMaquette } from './maquettes';
import { GEAR_MS } from './outpost-gear';

/** #468 : un avant-poste qui prend ou quitte son métier sous mes yeux monte ou démonte son
 *  accessoire ; ailleurs, ou en mouvement réduit ou coupé, il se tient tel que servi. */
const outpost = (gear: string | null): StandingMaquette => ({
  id: 'outpost-a',
  at: { lonLat: [3, 50] },
  url: 'outpost.glb',
  span: 1,
  washed: false,
  side: 'mine',
  gear,
});

async function engineOf(motion: 'full' | 'reduced' | 'off', seen = true) {
  const { MapEngine } = await import('./index');
  const runGear = vi.fn();
  const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
    lowering: new Map(),
    lettingGo: new Map(),
    servedMaquettes: [] as ReadonlyArray<StandingMaquette>,
    razing: new Set(),
    falling: new Set(),
    piles: [],
    sequences: { motion },
    maquettes: { boxOf: () => ({}), runFlag: vi.fn(), runGear, display: () => true },
    standing: { display: vi.fn() },
    pins: { rebuild: vi.fn() },
    seenBig: () => seen,
    besideSites: (piles: unknown) => piles,
    relayThreads: vi.fn(),
    invalidate: vi.fn(),
  }) as unknown as { displayMaquettes(served: ReadonlyArray<StandingMaquette>): void };
  return { engine, runGear };
}

describe('an outpost changing its trade under my eyes (#468)', () => {
  it('takes the old gear off and puts the new one on, from this view', async () => {
    const { engine, runGear } = await engineOf('full');
    engine.displayMaquettes([outpost('fort')]);
    expect(runGear).not.toHaveBeenCalled();
    engine.displayMaquettes([outpost(null)]);
    expect(runGear).toHaveBeenCalledWith('outpost-a', {
      from: 'fort',
      to: null,
      start: expect.any(Number),
      ms: GEAR_MS,
    });
  });

  it('stands as served at reduced and cut motion, and out of sight', async () => {
    for (const [motion, seen] of [
      ['reduced', true],
      ['off', true],
      ['full', false],
    ] as const) {
      const { engine, runGear } = await engineOf(motion, seen);
      engine.displayMaquettes([outpost(null)]);
      engine.displayMaquettes([outpost('guet')]);
      expect(runGear, `${motion} ${seen}`).not.toHaveBeenCalled();
    }
  });
});
