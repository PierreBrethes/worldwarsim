import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  buildingFootprint,
  buildingMetres,
  buildingReach,
  buildingSpan,
} from '@/domain/piece-size';
import coastAsset from '../../../public/coast.json';
import type { WorldFrame } from './frame';
import { MaquetteLayer, type SeaFront } from './maquettes';

// The loader wants a DOM: the port's file is read from disk.
vi.mock('./figurines/figurine', async (original) => {
  const { sceneOfFile } = await import('./gltf-scene.fixture');
  return {
    ...(await original<typeof import('./figurines/figurine')>()),
    sceneOf: async () => sceneOfFile('src/emblems/buildings/port.glb'),
  };
});

/** **L'arrivée de la côte relance la pose des maquettes** (#436) : un port tourné vers la mer
 *  avant `coast.json` pose ensuite son bord d'eau sur la côte, et son épingle le suit. */
describe('the coast landing on the board', () => {
  it('sets a port back from its point once coast.json has landed', async () => {
    const { MapEngine } = await import('./index');
    const PORT = 'building-port@0,0';
    const engine = Object.create(MapEngine.prototype) as Record<string, unknown>;
    const frame = {
      projectLonLat: ([lon, lat]: readonly [number, number]) => new Vector3(lon, 0, lat),
    } as unknown as WorldFrame;
    // To the east the sea: turned to it before the coast, its edge on x = 0.1 after.
    const seaFront = (): SeaFront => ({
      seaward: [1, 0],
      line: engine.coast === null ? null : [0.1, 0],
    });
    const maquettes = new MaquetteLayer(
      frame,
      () => null,
      () => {},
      () => {},
      () => true,
      seaFront,
    );
    const pins = { rebuild: vi.fn() };
    Object.assign(engine, {
      coast: null,
      coastLoading: false,
      coastRetryAt: 0,
      maquettes,
      pins,
      runways: '',
      arcs: { rebuild: () => {} },
      standing: { display: () => {} },
      piles: [],
      besideSites: () => [],
      loadRaster: () => {},
      ghost: { spot: null },
      placing: null,
      invalidate: () => {},
    });
    maquettes.display([
      {
        id: PORT,
        at: { lonLat: [0, 0] },
        url: 'port.glb',
        span: buildingSpan('port'),
        metres: buildingMetres('port'),
        footprint: buildingFootprint('port'),
        reach: buildingReach('port'),
        socle: true,
        washed: false,
      },
    ]);
    await vi.waitFor(() => expect(maquettes.isDressed(PORT)).toBe(true));
    expect(maquettes.drawnAt(PORT)).toBeNull();
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => coastAsset }));
    (engine as unknown as { loadCoast(): void }).loadCoast();
    await vi.waitFor(() => expect(engine.coast).not.toBeNull());
    expect(maquettes.drawnAt(PORT)!.x).toBeLessThan(0);
    expect(pins.rebuild).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
