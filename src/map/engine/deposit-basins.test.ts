import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Vector2 } from 'three';
import type { DepositBasin } from '@/domain/deposit-basins';
import { DepositBasins } from './deposit-basins';
import { PROJECTION, WorldFrame } from './frame';
import { nightUniforms } from './night-here';

const frame = new WorldFrame(PROJECTION);
const basins = JSON.parse(
  readFileSync('public/deposit-basins.json', 'utf8'),
) as ReadonlyArray<DepositBasin>;
const layer = () => new DepositBasins(frame, nightUniforms(frame, { value: new Vector2() }));

describe('la couche des bassins (#239)', () => {
  it('ne montre rien tant que les bassins ne sont pas arrivés, ni quand la bascule les cache', () => {
    const drawn = layer();
    drawn.show(true);
    expect(drawn.object.visible).toBe(false);
    drawn.display(basins);
    expect(drawn.object.visible).toBe(true);
    drawn.show(false);
    expect(drawn.object.visible).toBe(false);
  });

  it('remplit chaque bassin en éventail depuis son gisement, en un seul maillage', () => {
    const drawn = layer();
    drawn.display(basins);
    const geometry = drawn.mesh.geometry;
    const ruhr = basins.findIndex((basin) => basin.id === 'coal-BEL-2');
    const perBasin = 1 + basins[ruhr]!.ring.length / 2;
    expect(geometry.getAttribute('position').count).toBe(basins.length * perBasin);
    expect(geometry.getIndex()!.count).toBe(basins.length * (perBasin - 1) * 3);

    const centre = new Vector2(
      geometry.getAttribute('position').getX(ruhr * perBasin),
      geometry.getAttribute('position').getZ(ruhr * perBasin),
    );
    const point = frame.projectLonLat([3.89, 50.41]);
    expect(centre.x).toBeCloseTo(point.x, 5);
    expect(centre.y).toBeCloseTo(point.z, 5);
    // Dense au cœur, nu au bord : le cœur a 0, le contour 1.
    const edge = geometry.getAttribute('aEdge');
    expect(edge.getX(ruhr * perBasin)).toBe(0);
    expect(edge.getX(ruhr * perBasin + 1)).toBe(1);
  });

  it('donne à chaque bassin la texture de son espèce', () => {
    const drawn = layer();
    drawn.display(basins);
    const kind = drawn.mesh.geometry.getAttribute('aKind');
    const perBasin = 1 + basins[0]!.ring.length / 2;
    const kinds = basins.map((_, k) => kind.getX(k * perBasin));
    const codeOf = { coal: 0, iron: 1, food: 2, oil: 3 } as const;
    expect(kinds).toEqual(basins.map((basin) => codeOf[basin.deposit]));
  });

  it('n’est jamais visé : la pose vise le point, le clic la région', () => {
    const drawn = layer();
    drawn.display(basins);
    const hits: unknown[] = [];
    drawn.mesh.raycast({} as never, hits as never);
    expect(hits).toEqual([]);
  });

  it('grandit de loin jusqu’à une tache lisible, sans jamais toucher son voisin', () => {
    const drawn = layer();
    drawn.display(basins);
    const geometry = drawn.mesh.geometry;
    const perBasin = 1 + basins[0]!.ring.length / 2;
    const centre = geometry.getAttribute('aCentre');
    const radius = geometry.getAttribute('aRadius');
    const room = geometry.getAttribute('aRoom');
    const at = (k: number) => new Vector2(centre.getX(k * perBasin), centre.getY(k * perBasin));
    for (let k = 0; k < basins.length; k++) {
      expect(room.getX(k * perBasin)).toBeGreaterThanOrEqual(1);
      const own = radius.getX(k * perBasin);
      const nearest = Math.min(
        ...basins.map((_, j) => (j === k ? Infinity : at(k).distanceTo(at(j)))),
      );
      // Grown, it stops half way to its nearest neighbour, or at its own size if already there.
      expect(own * room.getX(k * perBasin), basins[k]!.id).toBeLessThanOrEqual(
        Math.max(own, nearest / 2) * 1.00001,
      );
    }
    // Un bassin isolé a de quoi s'étendre : de loin, il reste une tache.
    const ruhr = basins.findIndex((basin) => basin.id === 'coal-BEL-2');
    expect(room.getX(ruhr * perBasin)).toBeGreaterThan(1);
  });
});

describe('l’éveil des bassins, clé en main (#239)', () => {
  const at = (id: string) => ({ id });
  const wakeOf = (drawn: DepositBasins, id: string) => {
    const perBasin = 1 + basins[0]!.ring.length / 2;
    const k = basins.findIndex((basin) => basin.id === id);
    return drawn.mesh.geometry.getAttribute('aWake').getX(k * perBasin + 3);
  };

  it('éveille les bassins appelés, prenables ou refusés, et laisse dormir les autres', () => {
    const drawn = layer();
    drawn.display(basins);
    drawn.wake([
      { deposit: at('coal-BEL-2'), refusal: null },
      { deposit: at('coal-DEU-1572'), refusal: { code: 'OUT_OF_REACH' } },
    ]);
    expect(wakeOf(drawn, 'coal-BEL-2')).toBe(1);
    expect(wakeOf(drawn, 'coal-DEU-1572')).toBe(2);
    expect(wakeOf(drawn, 'iron-FRA-5325')).toBe(0);
    drawn.wake(null);
    expect(wakeOf(drawn, 'coal-BEL-2')).toBe(0);
  });

  it('se montre clé en main même quand la bascule les cache', () => {
    const drawn = layer();
    drawn.display(basins);
    drawn.show(false);
    drawn.wake([{ deposit: at('coal-BEL-2'), refusal: null }]);
    expect(drawn.object.visible).toBe(true);
    drawn.wake(null);
    expect(drawn.object.visible).toBe(false);
  });

  it('retient l’éveil demandé avant l’arrivée des bassins', () => {
    const drawn = layer();
    drawn.wake([{ deposit: at('coal-BEL-2'), refusal: null }]);
    drawn.display(basins);
    expect(wakeOf(drawn, 'coal-BEL-2')).toBe(1);
  });
});
