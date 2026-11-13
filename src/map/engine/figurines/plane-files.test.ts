import { describe, expect, it, vi } from 'vitest';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { articulatedOf } from '../sequences';
import { planeFileOf } from './plane-rig';

// The real files and the real cooking: only the loader reads from disk.
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const { sceneOfFile } = await import('../gltf-scene.fixture');
  return {
    GLTFLoader: class {
      loadAsync(url: string) {
        return Promise.resolve({ scene: sceneOfFile(url.replace(/^\//, '')) });
      }
    },
  };
});

const files = Object.entries(FIGURINE_FILES).flatMap(([nation, roles]) =>
  typeof roles?.airTransport === 'string' ? [[nation, roles.airTransport] as const] : [],
);

describe("the door and the foot of every nation's plane (#502)", () => {
  it('has eight planes', () => {
    expect(files).toHaveLength(8);
  });

  it.each(files)('reads them off the articulated rig of %s', async (_nation, url) => {
    const file = planeFileOf(await articulatedOf(url, 'airTransport'))!;
    expect(file).not.toBeNull();
    // The metres of the files differ: the door's z from -4.78 to -6.29, its height from 2.63 to 3.10.
    expect(file.hinge[2]).toBeGreaterThan(-6.4);
    expect(file.hinge[2]).toBeLessThan(-4.7);
    expect(file.hinge[1]).toBeGreaterThan(2.5);
    expect(file.hinge[1]).toBeLessThan(3.2);
    // The foot is on the ground, out from the door.
    expect(file.foot[0]).toBeGreaterThan(file.hinge[0]);
  });

  it('reads the French door where the file puts it', async () => {
    const file = planeFileOf(
      await articulatedOf(FIGURINE_FILES.france!.airTransport as string, 'airTransport'),
    )!;
    expect(file.hinge).toEqual([
      expect.closeTo(0.6915, 3),
      expect.closeTo(3.1025, 3),
      expect.closeTo(-5.9439, 3),
    ]);
    expect(file.foot).toEqual([expect.closeTo(2.1795, 3), expect.closeTo(-6.3439, 3)]);
    // Its tail ends 13.57 m behind the wheels.
    expect(file.tail).toBeCloseTo(13.57, 1);
  });
});
