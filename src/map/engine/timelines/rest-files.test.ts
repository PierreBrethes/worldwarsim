import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { troopMetres, troopSpan } from '@/domain/piece-size';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { AIRFIELD } from '@/emblems/kits/manifest';
import { sceneOfFile } from '../gltf-scene.fixture';
import { restGrowth } from '../figurines/figurine';
import { type AirRole, TAIL_GAP } from './airfield';
import { layout } from './rest';

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
    expect(standing).toMatch(/: restGrowth\(frame\.at\.distanceTo\(eye\), entry\.span\)/);
  });
});
