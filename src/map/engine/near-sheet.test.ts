import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LonLat } from '@/domain/geo';
import type { Projection } from '@/domain/world';
import projection from '../../../public/projection.json';
import { buffersOf } from './atlas-geometry';
import { levelOf } from './countries';
import { WorldFrame } from './frame';
import { buildNearSheet } from './near-sheet';
import { terrainCode } from './terrain-drawings';

describe('buildNearSheet', () => {
  const read = (name: string) => JSON.parse(readFileSync(`public/${name}`, 'utf8'));
  const sheet = buildNearSheet(
    read('atlas.json'),
    read('atlas-near.json'),
    read('terrain-cells.json'),
    projection as unknown as Projection,
  );

  it('builds everything the near level draws, and nothing a worker could not hand over', () => {
    expect(levelOf(sheet.sheet).lands.size).toBe(250);
    expect(sheet.lines.near.attributes.position!.array.length).toBeGreaterThan(
      sheet.lines.far.attributes.position!.array.length,
    );
    expect(() => structuredClone(sheet, { transfer: buffersOf(sheet) })).not.toThrow();
  });

  // The code the drawings read under a place, as the fragment fetches its texel; a copy, since
  // the hand-over detaches the sheet's buffers.
  const frame = new WorldFrame(projection as unknown as Projection);
  const { width, height } = sheet.types;
  const texels = sheet.types.texels.slice();
  const codeAt = (lonLat: LonLat) => {
    const { x, z } = frame.projectLonLat(lonLat);
    const column = Math.floor((x / frame.width + 0.5) * width);
    const row = Math.floor((z / frame.height + 0.5) * height);
    return Math.round(texels[(row * width + column) * 2]! / 40);
  };

  it('draws the American West by its relief, not by its states (#220)', () => {
    // Colorado and California are each one region; the Front Range and the Sierra stand out of
    // the High Plains and the Central Valley.
    expect(codeAt([-105.7, 40.3])).toBe(terrainCode('mountain'));
    expect(codeAt([-103, 39])).toBe(terrainCode('plain'));
    expect(codeAt([-119.3, 37.5])).toBe(terrainCode('mountain'));
    expect(codeAt([-120.5, 37])).toBe(terrainCode('plain'));
  });
});
