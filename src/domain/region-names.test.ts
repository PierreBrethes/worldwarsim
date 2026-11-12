import { describe, expect, it } from 'vitest';
import atlasFile from '../../public/atlas.json';
import index from '../../public/region-index.json';
import { FRENCH_REGION_NAMES, frenchRegionName } from '../../scripts/region-names-fr.mjs';

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

  it('names two regions of one country alike never (Kiev and its oblast, Mexico and its state)', () => {
    // The source repeats some names (two Chitipa); a name the table wrote is never one of them.
    const written = new Set(
      Object.entries(FRENCH_REGION_NAMES).flatMap(([country, names]) =>
        Object.values(names).map((name) => `${country}|${name}`),
      ),
    );
    const seen = new Map<string, string>();
    for (const [id, name] of Object.entries(index.name)) {
      const key = `${index.country[id as keyof typeof index.country]}|${name}`;
      if (!written.has(key)) continue;
      expect(seen.get(key), `${id} and ${seen.get(key)} are both ${name}`).toBeUndefined();
      seen.set(key, id);
    }
    expect(nameOf('UKR-4826')).toBe('Kyiv');
    expect(nameOf('UKR-321')).toBe('Oblast de Kyiv');
    expect(nameOf('MEX-2727')).not.toBe(nameOf('MEX-2731'));
  });

  it('is a fixed point: a French name is never translated a second time', () => {
    for (const [country, names] of Object.entries(FRENCH_REGION_NAMES))
      for (const [from, to] of Object.entries(names))
        expect(frenchRegionName(country, to), `${country}: ${from} → ${to}`).toBe(to);
  });
});
