import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { decodeAtlas } from '@/domain/atlas';
import { endMapOf } from './end-map';

const atlas = decodeAtlas(JSON.parse(readFileSync('public/atlas.json', 'utf8')));

it('dessine chaque teneur à son encre, et neutre tout le reste, région inconnue comprise', () => {
  const map = endMapOf(
    atlas,
    [
      { regionId: 'NOR-921', nation: 'germany' },
      { regionId: 'ATL-404', nation: 'france' },
    ],
    ['NOR-921'],
  );
  expect(map.lands.map((land) => land.nation)).toEqual([null, 'germany']);
  expect(map.lands[1]!.d).toMatch(/^M[\d.]+ [\d.]+L/);
  expect(map.regionName('NOR-921')).toBe('Oslo');
  expect(map.regionName('ATL-404')).toBe('');
  const [x, y] = map.anchors.get('NOR-921')!;
  expect(atlas.regionAt([x, y], 'far')?.id).toBe('NOR-921');
});

it('nomme en français la région de la page de fin (#553)', () => {
  expect(endMapOf(atlas, [], ['BEL-3474']).regionName('BEL-3474')).toBe('Bruxelles');
});
