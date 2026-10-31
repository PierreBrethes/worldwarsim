import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Sprite } from 'three';
import type { ReplayView } from '@/domain/player-view';
import { replayAt } from '@/domain/replay';
import { ReplayScene } from './replay';

// The real files and the real `standIn`: only the loader reads from disk.
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

beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  Object.assign(globalThis, {
    document: { createElement: () => ({ getContext: () => ctx }) },
    Path2D: class {},
  });
});

const tank: ReplayView = {
  combatId: 'c',
  at: 0,
  point: { lon: 6.1, lat: 49.6 },
  side: 'attacker',
  won: true,
  mine: [{ role: 'armor', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0 }],
  theirs: { troops: 1, lost: 0, routed: 0, destroyed: 0 },
};

describe('the articulated copy that stands in for a tank', () => {
  it('carries the flash on its own muzzle and the smoke on its own marker', async () => {
    const scene = new ReplayScene('france', replayAt(tank, 0).pieces, 'land', null, null, null);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const holder = scene.object.children[0]!;
    // Only the copy keeps a `gun` node: the resting figurine merges it away.
    const gun = holder.getObjectByName('gun');
    expect(gun).toBeDefined();
    let flash: Sprite | undefined;
    holder.traverse((part) => {
      if (part instanceof Sprite && part.parent?.name === 'fx_muzzle') flash = part;
    });
    expect(flash).toBeDefined();
    expect(flash!.parent!.parent).toBe(gun);
    expect(holder.getObjectByName('fx_smoke')!.children.length).toBeGreaterThan(0);
  });
});
