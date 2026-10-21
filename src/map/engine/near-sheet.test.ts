import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Projection } from '@/domain/world';
import projection from '../../../public/projection.json';
import { buffersOf } from './atlas-geometry';
import { levelOf } from './countries';
import { buildNearSheet } from './near-sheet';

describe('buildNearSheet', () => {
  const read = (name: string) => JSON.parse(readFileSync(`public/${name}`, 'utf8'));
  const sheet = buildNearSheet(
    read('atlas.json'),
    read('atlas-near.json'),
    new Map([['FRA-2000', 'forest']]),
    projection as unknown as Projection,
    null,
  );

  it('builds everything the near level draws, and nothing a worker could not hand over', () => {
    expect(levelOf(sheet.sheet).lands.size).toBe(250);
    expect(sheet.lines.near.attributes.position!.array.length).toBeGreaterThan(
      sheet.lines.far.attributes.position!.array.length,
    );
    expect(sheet.terrain.washes.near.index!.length).toBeGreaterThan(0);
    expect(sheet.terrain.types).toBeNull();
    expect(() => structuredClone(sheet, { transfer: buffersOf(sheet) })).not.toThrow();
  });
});
