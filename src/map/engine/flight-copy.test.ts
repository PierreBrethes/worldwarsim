import { describe, expect, it, vi } from 'vitest';
import { Group, type Object3D } from 'three';
import { AIR_ALTITUDE } from '@/domain/piece-size';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { articulatedOf, type SequenceHost } from './sequences';
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

/** A plane aloft as the arcs host shows it: the pawn's object at its heading and height. */
function aloft() {
  const object = new Group();
  object.position.set(10, AIR_ALTITUDE, 3);
  object.rotation.y = Math.PI / 2;
  const stood: Array<Object3D | null> = [];
  const host: Pick<SequenceHost, 'pieceOf' | 'standIn'> = {
    pieceOf: (id) => (id === 'plane' ? { url, box: null } : null),
    standIn: (_id, copy) => {
      stood.push(copy);
      if (copy !== null) object.add(copy);
      else object.clear();
    },
  };
  return { object, host, stood };
}

describe('the copy of a plane in flight (#507)', () => {
  it('stands in its pawn with the gear folded and the bay door shut', async () => {
    const { host, stood } = aloft();
    const flight = await lendFlightCopy(host, 'plane', articulatedOf);
    expect(flight).not.toBeNull();
    expect(stood).toEqual([flight!.copy]);
    flight!.pose({});
    const gear = flight!.copy.getObjectByName('gear_left')!;
    expect(gear.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(flight!.copy.getObjectByName('bay_door')!.rotation.x).toBeCloseTo(0);
  });

  it('swings the bay door as the timeline poses it, and shuts it back', async () => {
    const { host } = aloft();
    const flight = (await lendFlightCopy(host, 'plane', articulatedOf))!;
    const door = flight.copy.getObjectByName('bay_door')!;
    flight.pose({ bay_door: { turn: [-Math.PI / 2, 0, 0] } });
    expect(door.rotation.x).toBeCloseTo(-Math.PI / 2);
    flight.pose({});
    expect(door.rotation.x).toBeCloseTo(0);
  });

  it('reads fx_parachute on the map, turned to the pawn’s heading and at its height', async () => {
    const { object, host } = aloft();
    const flight = (await lendFlightCopy(host, 'plane', articulatedOf))!;
    // The marker in the model's own frame, with the pawn at the origin facing +z.
    const place = object.position.clone();
    const turned = object.rotation.y;
    object.position.set(0, 0, 0);
    object.rotation.y = 0;
    const local = flight.release()!.clone();
    object.position.copy(place);
    object.rotation.y = turned;
    const at = flight.release()!;
    // A quarter turn from +z sends the model's z to the map's x and its x to -z.
    expect(at.x).toBeCloseTo(10 + local.z);
    expect(at.z).toBeCloseTo(3 - local.x);
    expect(at.y).toBeCloseTo(AIR_ALTITUDE + local.y);
  });

  it('gives the figurine back', async () => {
    const { host, stood } = aloft();
    const flight = (await lendFlightCopy(host, 'plane', articulatedOf))!;
    flight.giveBack(host, 'plane');
    expect(stood.at(-1)).toBeNull();
  });

  it('lends nothing once the pawn is gone', async () => {
    const { host } = aloft();
    expect(await lendFlightCopy(host, 'gone', articulatedOf)).toBeNull();
  });

  it('lends nothing when the pawn is gone while the file cooks', async () => {
    const { host, stood } = aloft();
    const here = { current: true };
    const leaving: typeof host = {
      pieceOf: (id) => (here.current ? host.pieceOf(id) : null),
      standIn: host.standIn,
    };
    const cook: typeof articulatedOf = async (...args) => {
      here.current = false;
      return articulatedOf(...args);
    };
    expect(await lendFlightCopy(leaving, 'plane', cook)).toBeNull();
    expect(stood).toEqual([]);
  });
});
