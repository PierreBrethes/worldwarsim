import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const baked = (name: string) => JSON.parse(readFileSync(`public/${name}`, 'utf8'));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('classes the six hand-checked witnesses', () => {
  const byType = baked('region-types.json') as Record<string, string[]>;
  const typeOf = (id: string) => Object.keys(byType).find((type) => byType[type]!.includes(id));
  expect(typeOf('FRA-5331')).toBe('plain');
  expect(typeOf('FRA-5313')).toBe('forest');
  expect(typeOf('BRA-592')).toBe('jungle');
  expect(typeOf('CHE-165')).toBe('mountain');
  expect(typeOf('DZA-2189')).toBe('desert');
  expect(typeOf('RUS-2321')).toBe('tundra');
});

it('classes every region of the atlas exactly once', () => {
  const byType = baked('region-types.json') as Record<string, string[]>;
  const classed = Object.values(byType).flat();
  const ids = (
    baked('atlas.json') as { objects: { regions: { geometries: { id: string }[] } } }
  ).objects.regions.geometries.map(({ id }) => id);
  expect(new Set(classed).size).toBe(classed.length);
  expect([...classed].sort()).toEqual([...ids].sort());
});

it('reads the types it knows, and leaves an unknown key out', async () => {
  vi.stubGlobal('fetch', async () => ({
    ok: true,
    json: async () => ({ mountain: ['A'], volcano: ['B'] }),
  }));
  const { loadRegionTypes } = await import('./world');
  const types = await loadRegionTypes('/t');
  expect([...types]).toEqual([['A', 'mountain']]);
});

it('reads no type when the file is a 404', async () => {
  vi.stubGlobal('fetch', async () => ({ ok: false, json: async () => ({}) }));
  const { loadRegionTypes } = await import('./world');
  expect((await loadRegionTypes('/t')).size).toBe(0);
});
