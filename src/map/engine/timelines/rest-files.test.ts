import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { troopMetres, troopSpan } from '@/domain/piece-size';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { AIRFIELD, MOLE } from '@/emblems/kits/manifest';
import { sceneOfFile } from '../gltf-scene.fixture';
import { restGrowth } from '../figurines/figurine';
import { type AirRole, TAIL_GAP } from './airfield';
import { berths, layout } from './rest';
import { gangwayDoor, plankFoot } from './gangway';

/** #502 : un avion posé sur l'aire tient entre le rail des hangars et la rampe, de chaque fichier. */
const planes = (['fighter', 'bomber', 'airTransport'] as const).flatMap((role) =>
  Object.entries(FIGURINE_FILES).flatMap(([nation, roles]) => {
    const url = (roles as Record<string, unknown> | undefined)?.[role];
    return typeof url === 'string' ? [{ role, nation, url }] : [];
  }),
);

describe('the apron, with the growth a plane is drawn at (#502)', () => {
  // At the closest zoom the plane and the site are both drawn at the share pieces are drawn at:
  // a plane is as large as the site's metres say, the floor aside.
  const near = 0.3;
  it('lays out at the growth over the site, not at the share every piece is drawn at', () => {
    expect(restGrowth(near, troopSpan('airTransport'))).toBe(1);
  });

  it.each(planes)(
    'stands the $role of $nation clear of the rail and of the ramp',
    ({ role, url }) => {
      const box = new Box3().setFromObject(sceneOfFile(url));
      const size = box.getSize(new Vector3());
      // The model is brought to its role's measure: a metre of the file is this many site metres.
      const k = troopMetres(role) / Math.max(size.x, size.z);
      const [rest] = layout(
        [{ role: role as AirRole, place: { lane: 0, rank: 0 } }],
        restGrowth(near, troopSpan(role)),
      );
      const tail = rest!.z - -box.min.z * k;
      const nose = rest!.z + box.max.z * k;
      expect(tail).toBeGreaterThanOrEqual(AIRFIELD.facade + TAIL_GAP - 0.01);
      expect(nose).toBeLessThanOrEqual(AIRFIELD.ramp.from);
    },
  );

  it('is the growth the engine lays its planes out at', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const standing = readFileSync(join(here, '..', 'standing.ts'), 'utf-8');
    expect(standing).toMatch(/restGrowth\(frame\.at\.distanceTo\(eye\), entry\.span \* entry\.sized\)/);
  });
});

/** #479 : une coque à son poste tient hors du môle et son étrave hors du quai, de chaque fichier. */
const hulls = (['cargo', 'escort', 'carrier'] as const).flatMap((role) =>
  Object.entries(FIGURINE_FILES).flatMap(([nation, roles]) => {
    const url = (roles as Record<string, unknown> | undefined)?.[role];
    return typeof url === 'string' ? [{ role, nation, url }] : [];
  }),
);

describe('the mole, with the growth a hull is drawn at (#479)', () => {
  it.each(hulls)(
    'stands the $role of $nation off the mole and its stem off the quay, at each post',
    ({ role, url }) => {
      const box = new Box3().setFromObject(sceneOfFile(url));
      const size = box.getSize(new Vector3());
      const k = troopMetres(role) / Math.max(size.x, size.z);
      for (const distance of [0.3, 1, 3]) {
        const g = restGrowth(distance, troopSpan(role));
        for (const post of ['mole', 'couple', 'roads'] as const) {
          const [rest] = berths([role], g, [post]);
          // Facing the land (yaw π): the model's +z is toward -z of the site.
          const half = Math.max(box.max.x, -box.min.x) * k * g;
          const stem = rest!.z - Math.max(box.max.z, -box.min.z) * k * g;
          expect(rest!.x + half).toBeLessThanOrEqual(MOLE.inner + 0.01);
          expect(stem).toBeGreaterThanOrEqual(MOLE.quay - 0.01);
        }
      }
    },
  );

  it.each(hulls.filter(({ role }) => role === 'cargo'))(
    'lets the plank of the $nation cargo run from its door to the mole, no further',
    ({ url }) => {
      const scene = sceneOfFile(url);
      const box = new Box3().setFromObject(scene);
      const size = box.getSize(new Vector3());
      const k = troopMetres('cargo') / Math.max(size.x, size.z);
      const [at] = berths(['cargo'], 1, ['mole']);
      scene.updateMatrixWorld(true);
      // The hull stands stem to the land (yaw π): its x and z are turned over. The file has the
      // port mark; its starboard is its mirror (`site-kits.ts`).
      const mark = new Vector3();
      scene.getObjectByName('fx_passerelle')!.getWorldPosition(mark);
      const marks = [mark.x, -mark.x].map((x) => ({ x: at!.x - x * k, y: 0, z: at!.z - mark.z * k }));
      const door = gangwayDoor(marks);
      expect(door.x).toBeLessThanOrEqual(MOLE.inner);
      expect(plankFoot(door)[0]).toBeGreaterThanOrEqual(MOLE.inner);
      expect(plankFoot(door)[0]).toBeLessThanOrEqual(MOLE.inner + 3);
    },
  );

  it('is the growth the engine lays its hulls out at', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const standing = readFileSync(join(here, '..', 'standing.ts'), 'utf-8');
    expect(standing).not.toMatch(/\* pieceScale\.size\s*:\s*restGrowth/);
    expect(standing).not.toMatch(/GARRISON_FLOOR_PX\) \* pieceScale\.size/);
  });
});
