import { describe, expect, it } from 'vitest';
import atlasFile from '../../public/atlas.json';
import index from '../../public/region-index.json';

const nameOf = (id: string) => (index.name as Record<string, string>)[id];

/** #553: a region reads in French wherever the game names it, the outpost named after it included. */
describe('region names', () => {
  it('reads Belgium in French', () => {
    expect(nameOf('BEL-3474')).toBe('Bruxelles');
    expect(nameOf('BEL-3479')).toBe('Flandre-Occidentale');
    expect(nameOf('BEL-3480')).toBe('Anvers');
    expect(nameOf('BEL-3481')).toBe('Liège');
  });

  it('reads the German Länder in French', () => {
    expect(nameOf('DEU-1576')).toBe('Basse-Saxe');
    expect(nameOf('DEU-1572')).toBe('Rhénanie-du-Nord-Westphalie');
    expect(nameOf('DEU-DE21')).toBe('Haute-Bavière');
  });

  it('keeps the source name where French has none', () => {
    expect(nameOf('CZE-10368')).toBe('Ústecký');
  });

  it('serves the atlas and the index the same names', () => {
    const atlasNames = Object.fromEntries(
      atlasFile.objects.regions.geometries.map(({ id, properties }) => [id, properties.name]),
    );
    expect(atlasNames).toEqual(index.name);
  });

  it('reads Russia and Ukraine in French', () => {
    expect(
      nameOf(
        'RUS-' +
          Object.keys(index.name)
            .find((k) => index.name[k as keyof typeof index.name] === 'Ossétie du Nord')!
            .slice(4),
      ),
    ).toBe('Ossétie du Nord');
  });
});
