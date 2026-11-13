import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { GridAsset } from '@/domain/routing';
import { decodeAtlas, type AtlasFile } from '@/domain/atlas';
import { buffersOf } from './atlas-geometry';
import { sheetData } from './countries';
import { PROJECTION, WorldFrame } from './frame';
import { shoreOf } from './sea';

/** SHA-256 of every typed array under a value, in walk order, each with its length. */
function hashOf(value: unknown, hash = createHash('sha256')) {
  if (ArrayBuffer.isView(value))
    hash
      .update(`${value.byteLength}:`)
      .update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  else if (typeof value === 'string') hash.update(`s${value};`);
  else if (value !== null && typeof value === 'object')
    for (const child of Object.values(value)) hashOf(child, hash);
  return hash;
}

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * **The worker's shore is the shore the engine used to calculate itself** (#560): the coast's
 * field and the sea's marbling, byte for byte, as measured on `main` before they left the main
 * thread. A changed hash here is a changed image, not a faster one.
 */
const shore = shoreOf(
  JSON.parse(readFileSync('public/grid.json', 'utf8')) as GridAsset,
  PROJECTION,
);

it('bakes the same coast field and the same sea marbling as before the worker', () => {
  expect(sha(shore.bytes)).toBe('a0ea68c5832714a89875b27f3b8fca59d4da56c96b762fd3b794299840a85400');
  expect([shore.sea.width, shore.sea.height]).toEqual([600, 312]);
  expect(sha(shore.sea.image)).toBe(
    '5d476c10e8c5e918a1f07735f8972d8a2cb16b4d760230c7a1f7160cca70048c',
  );
});

it('hands every array of the shore over to the main thread, none copied', () => {
  const transfer = buffersOf(shore);
  for (const bytes of [shore.bytes, shore.sea.image, shore.grid.cells, shore.grid.edges])
    expect(transfer).toContain(bytes.buffer);
});

it('bakes the far level\u2019s sheet as main did, from the same atlas and the same frame', () => {
  const atlas = decodeAtlas(JSON.parse(readFileSync('public/atlas.json', 'utf8')) as AtlasFile);
  const sheet = sheetData(atlas, 'far', new WorldFrame(PROJECTION));
  expect(hashOf(sheet).digest('hex')).toBe(
    '08f2ebfaf97a2e66e3cb5d411d38d2ab1dfd8184b3d8276e76f7193b742175d0',
  );
});
