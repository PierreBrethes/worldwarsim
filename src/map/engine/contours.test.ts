import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeAtlas } from '@/domain/atlas';
import { contourLines } from '@/domain/contours';
import type { World } from '@/domain/world';
import projection from '../../../public/projection.json';
import { contourRuns, ribbonNormals } from './contours';
import { WorldFrame } from './frame';

describe('the contour at the antimeridian', () => {
  const read = (name: string) => JSON.parse(readFileSync(`public/${name}`, 'utf8'));
  const atlas = decodeAtlas(read('atlas.json'), read('atlas-near.json'));
  const frame = new WorldFrame({ ...projection, countries: [] } as unknown as World);
  const offEdge = (x: number, y: number) => {
    const { westX, eastX } = frame.edgeAtLatitude(frame.lonLatAt(x, y)[1]);
    return Math.min(Math.abs(x - westX), Math.abs(x - eastX));
  };
  /** The length of a territory's lines lying on the cut, and of those near it. */
  const lengths = (lines: ReadonlyArray<{ points: Float32Array }>) => {
    let seam = 0;
    let shore = 0;
    for (const { points } of lines)
      for (let i = 2; i < points.length; i += 2) {
        const [ax, ay, bx, by] = [points[i - 2]!, points[i - 1]!, points[i]!, points[i + 1]!];
        const length = Math.hypot(bx - ax, by - ay);
        if (Math.max(offEdge(ax, ay), offEdge(bx, by)) < 0.01) seam += length;
        else if (offEdge(ax, ay) < 0.5) shore += length;
      }
    return { seam, shore };
  };
  /** Chukotka held alone: the cut runs along its whole eastern side. */
  const chukotka = (id: string) => (id === 'RUS-2321' ? 'ru' : undefined);

  it.each(['far', 'near'] as const)(
    'leaves the cut of Chukotka out at the %s level, and keeps its shore up to it',
    (detail) => {
      const raw = lengths(contourLines(atlas, chukotka, detail).outlines.get('ru')!);
      const drawn = lengths(contourRuns(atlas, chukotka, detail, frame).outlines.get('ru')!);
      expect(raw.seam).toBeGreaterThan(1);
      expect(drawn.seam).toBe(0);
      expect(drawn.shore).toBeGreaterThan(0);
    },
  );
});

describe('ribbonNormals', () => {
  // A border running east in hooks of 0.05 u, each shorter than the inset on screen.
  const crooked = Float32Array.from(
    Array.from({ length: 41 }, (_, i) => [i * 0.05, i % 2 === 0 ? 0 : 0.03]).flat(),
  );
  const ys = (normals: Float32Array) => normals.filter((_, i) => i % 2 === 1);

  it('pushes a line set back along the border as a whole, not along each hook', () => {
    expect(Math.min(...ys(ribbonNormals(crooked, true)))).toBeGreaterThan(0.95);
  });

  it('mitres a line laid on the border at each of its points', () => {
    expect(Math.min(...ys(ribbonNormals(crooked, false)))).toBeLessThan(0.95);
  });
});
