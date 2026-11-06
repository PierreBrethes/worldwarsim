import { describe, expect, it, vi } from 'vitest';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { Vector3 } from 'three';
import { AIR_ALTITUDE, metresOnBoard } from '@/domain/piece-size';
import { markOf } from './figurines/marks';
import { articulatedOf } from './sequences';
import { airdrop, PASS_MS } from './timelines/airdrop';
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

  it('flies along the pass the airdrop gives it, at AIR_ALTITUDE, root and heading read', async () => {
    const flight = (await lendFlightCopy(piece, articulatedOf))!;
    const drop = airdrop({ delivered: true, motion: 'full' });
    const at = (t: number) => {
      flight.pose(drop.plane(t));
      flight.copy.updateWorldMatrix(true, true);
      return flight.copy.children[0]!.position.clone();
    };
    const start = at(0);
    const over = at(PASS_MS);
    expect(start.x).toBeCloseTo(metresOnBoard(-160));
    expect(over.x).toBeCloseTo(0);
    for (const p of [start, over]) expect(p.y).toBeCloseTo(AIR_ALTITUDE);
    // Heading +x: the model's nose (+z) faces along the flight.
    const nose = new Vector3(0, 0, 1).transformDirection(flight.copy.children[0]!.matrixWorld);
    expect(nose.x).toBeCloseTo(1);
  });

  it('gives airdrop a release that lands the crate under the marker of the posed copy', async () => {
    const flight = (await lendFlightCopy(piece, articulatedOf))!;
    const release = flight.release()!;
    expect(release).not.toBeNull();
    for (const heading of [Math.PI / 2, 0.7]) {
      const drop = airdrop({ delivered: true, motion: 'full', heading, release });
      flight.pose(drop.plane(PASS_MS));
      flight.copy.updateWorldMatrix(true, true);
      const mark = markOf(flight.copy, 'fx_parachute')!;
      const crate = drop.packet(PASS_MS)!.at;
      expect(crate[0]).toBeCloseTo(mark.x);
      expect(crate[1]).toBeCloseTo(mark.y);
      expect(crate[2]).toBeCloseTo(mark.z);
    }
  });
});
