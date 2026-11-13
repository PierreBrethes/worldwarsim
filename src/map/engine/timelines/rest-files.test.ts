import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Vector3 } from 'three';
import { bentFromRest } from '../sequences';
import { describe, expect, it } from 'vitest';
import { troopMetres, troopSpan } from '@/domain/piece-size';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { AIRFIELD, MOLE } from '@/emblems/kits/manifest';
import { sceneOfFile } from '../gltf-scene.fixture';
import { restGrowth } from '../figurines/figurine';
import { type AirRole, TAIL_GAP } from './airfield';
import { berths, layout } from './rest';
import { gangwayDoor, plankFoot } from './gangway';
import { boomsOfScene } from './booms';
import { aimAt, SPOT_ONTO_DECK, tipOf } from './derrick';

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
    expect(standing).toMatch(
      /restGrowth\(frame\.at\.distanceTo\(eye\), entry\.span \* entry\.sized\)/,
    );
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
          const [rest] = berths(
            [role],
            g,
            [post],
            [(2 * Math.max(box.max.x, -box.min.x)) / Math.max(size.x, size.z)],
          );
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
    'keeps the mole cargo of $nation between the mole and the one alongside it, at each post',
    ({ url }) => {
      const box = new Box3().setFromObject(sceneOfFile(url));
      const size = box.getSize(new Vector3());
      const k = troopMetres('cargo') / Math.max(size.x, size.z);
      const half = Math.max(box.max.x, -box.min.x) * k;
      for (const distance of [0.3, 1, 3]) {
        const g = restGrowth(distance, troopSpan('cargo'));
        const share = (2 * Math.max(box.max.x, -box.min.x)) / Math.max(size.x, size.z);
        const [mole, couple] = berths(['cargo', 'cargo'], g, ['mole', 'couple'], [share, share]);
        expect(mole!.x + half * g).toBeLessThanOrEqual(MOLE.inner + 0.01);
        expect(couple!.x + half * g).toBeLessThanOrEqual(mole!.x - half * g + 0.01);
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
      const [at] = berths(
        ['cargo'],
        1,
        ['mole'],
        [(2 * Math.max(box.max.x, -box.min.x)) / Math.max(size.x, size.z)],
      );
      scene.updateMatrixWorld(true);
      // The hull stands stem to the land (yaw π): its x and z are turned over. The file has the
      // port mark; its starboard is its mirror (`site-kits.ts`).
      const mark = new Vector3();
      scene.getObjectByName('fx_passerelle')!.getWorldPosition(mark);
      const marks = [mark.x, -mark.x].map((x) => ({
        x: at!.x - x * k,
        y: 0,
        z: at!.z - mark.z * k,
      }));
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

describe('the derricks of a cargo at the mole, from each file (#505)', () => {
  it.each(hulls.filter(({ role }) => role === 'cargo'))(
    'brings the masts of the $nation cargo over the mole’s deck, and over their holds, within reach',
    ({ url }) => {
      const scene = sceneOfFile(url);
      const box = new Box3().setFromObject(scene);
      const size = box.getSize(new Vector3());
      const k = troopMetres('cargo') / Math.max(size.x, size.z);
      const [at] = berths(
        ['cargo'],
        1,
        ['mole'],
        [(2 * Math.max(box.max.x, -box.min.x)) / Math.max(size.x, size.z)],
      );
      const booms = boomsOfScene(scene);
      expect(booms.length).toBeGreaterThanOrEqual(1);
      for (const boom of booms) {
        // The hull stands stem to the land: its x and z are turned over, in the port's metres.
        const port = (x: number, z: number) => ({ x: at!.x - x * k, z: at!.z - z * k });
        // The tip's spot, in the port's metres: just in from the mole's face, back to the hull's.
        const spot = { x: (at!.x - (MOLE.inner + SPOT_ONTO_DECK)) / k, z: boom.pivot[2] };
        const { yaw, lift } = aimAt(boom.pivot, spot.x, spot.z, boom.length);
        const tip = [
          boom.pivot[0] + boom.length * Math.cos(lift) * Math.sin(yaw),
          boom.pivot[2] + boom.length * Math.cos(lift) * Math.cos(yaw),
        ] as const;
        expect(port(tip[0], tip[1]).x).toBeCloseTo(MOLE.inner + SPOT_ONTO_DECK, 3);
        // Within reach, not stopped short of it by the clamp.
        expect(Math.abs(spot.x - boom.pivot[0])).toBeLessThan(0.99 * boom.length);
        // The station is on the mole: between its quay and its head.
        const z = port(boom.pivot[0], boom.pivot[2]).z;
        expect(z).toBeGreaterThan(MOLE.quay);
        expect(z).toBeLessThan(MOLE.quay + MOLE.length + MOLE.head);
        // And its hold is within reach of the same mast.
        const over = Math.hypot(boom.hatch.at[0] - boom.pivot[0], boom.hatch.at[2] - boom.pivot[2]);
        expect(over).toBeLessThan(0.99 * boom.length);
      }
    },
  );
});

describe('the mast’s aim, on each file (#505)', () => {
  it.each(hulls.filter(({ role }) => role === 'cargo'))(
    'puts the masts of the $nation cargo back at their rest when aimed at it, and over a hold when aimed there',
    ({ url }) => {
      const scene = sceneOfFile(url);
      for (const boom of boomsOfScene(scene)) {
        const node = scene.getObjectByName(`mat_charge_${boom.n}`)!;
        const rest = {
          position: node.position.clone(),
          quaternion: node.quaternion.clone(),
        };
        node.quaternion.set(0, 0, 0, 1);
        bentFromRest(node, rest, { aim: [boom.rest.yaw, boom.rest.lift] });
        expect(node.quaternion.angleTo(rest.quaternion)).toBeLessThan(1e-3);
        // Aimed over its hold, its tip marker stands where the pure tip says.
        const { yaw, lift } = aimAt(boom.pivot, boom.hatch.at[0], boom.hatch.at[2], boom.length);
        bentFromRest(node, rest, { aim: [yaw, lift] });
        scene.updateMatrixWorld(true);
        const tip = scene.getObjectByName(`fx_charge_${boom.n}`)!.getWorldPosition(new Vector3());
        const [x, y, z] = tipOf(boom.pivot, yaw, lift, boom.length);
        expect(tip.distanceTo(new Vector3(x, y, z))).toBeLessThan(0.15);
      }
    },
  );
});

describe('the hulls laid out by their own beam (#505)', () => {
  it('is the beam of its file the engine lays a hull out by', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const standing = readFileSync(join(here, '..', 'standing.ts'), 'utf-8');
    expect(standing).toMatch(/beamShareOf\(entry\.figurines\[k\]\?\.url\)/);
  });
});
