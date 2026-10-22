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
});
