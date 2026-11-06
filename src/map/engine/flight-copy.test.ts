import { describe, expect, it, vi } from 'vitest';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { articulatedOf } from './sequences';
import { lendFlightCopy } from './flight-copy';

// The real file and the real cooking: only the loader reads from disk.
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const { sceneOfFile } = await import('./gltf-scene.fixture');
  return {
    GLTFLoader: class {
      loadAsync(url: string) {
        return Promise.resolve({ scene: sceneOfFile(url.replace(/^\//, '')) });
      }
    },
  };
});

const url = FIGURINE_FILES.france!.airTransport as string;

const piece = { url };

describe('the copy of a plane in flight (#507)', () => {
  it('folds the gear and keeps the bay door shut', async () => {
    const flight = (await lendFlightCopy(piece, articulatedOf))!;
    flight.pose({});
    const gear = flight.copy.getObjectByName('gear_left')!;
    expect(gear.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(flight.copy.getObjectByName('bay_door')!.rotation.x).toBeCloseTo(0);
  });

  it('swings the bay door as the timeline poses it, and shuts it back', async () => {
    const flight = (await lendFlightCopy(piece, articulatedOf))!;
    const door = flight.copy.getObjectByName('bay_door')!;
    flight.pose({ bay_door: { turn: [-Math.PI / 2, 0, 0] } });
    expect(door.rotation.x).toBeCloseTo(-Math.PI / 2);
    flight.pose({});
    expect(door.rotation.x).toBeCloseTo(0);
  });

  it('lends nothing for a piece without a file', async () => {
    expect(await lendFlightCopy({}, articulatedOf)).toBeNull();
  });
});
