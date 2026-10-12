import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { loadRegions } from './world';

const baked = (name: string) => JSON.parse(readFileSync(`public/${name}`, 'utf8'));

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

it('classes every region of regions.json exactly once', () => {
  const byType = baked('region-types.json') as Record<string, string[]>;
  const classed = Object.values(byType).flat();
  const ids = (baked('regions.json') as { regions: { id: string }[] }).regions.map((r) => r.id);
  expect(new Set(classed).size).toBe(classed.length);
  expect([...classed].sort()).toEqual([...ids].sort());
});

it('reads a region missing from the file as a plain', async () => {
  const regions = {
    lines: [],
    regions: [
      { id: 'A', country: 'X', n: 'a', p: [] },
      { id: 'B', country: 'X', n: 'b', p: [] },
    ],
  };
  vi.stubGlobal('fetch', async (url: string) => ({
    ok: true,
    json: async () => (url === '/t' ? { mountain: ['A'] } : regions),
  }));
  const data = await loadRegions('/r', '/t');
  expect(data.regions.map((r) => r.type)).toEqual(['mountain', 'plain']);
  vi.unstubAllGlobals();
});
