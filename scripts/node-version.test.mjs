import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(root + path, 'utf8');
const majorOf = (version) => Number(String(version).match(/\d+/)?.[0]);

/**
 * **Une seule version de Node, lue à quatre endroits.** La CI vérifiait en 24 pendant que le
 * Dockerfile du front construisait en 22 : le binaire déployé n'était pas celui qui avait
 * passé les tests. Et sans `.nvmrc` ni `engines`, un poste dont `node` est plus ancien plantait
 * dans vite ou vitest sans dire pourquoi.
 */
describe('la version de Node du dépôt', () => {
  const wanted = majorOf(read('.nvmrc'));

  it('est dite par .nvmrc, en une version majeure', () => {
    expect(wanted).toBeGreaterThanOrEqual(24);
  });

  it('est la borne basse de `engines` dans package.json', () => {
    const { engines } = JSON.parse(read('package.json'));
    expect(majorOf(engines?.node)).toBe(wanted);
  });

  it('est celle de chaque job de la CI', () => {
    const versions = [...read('.github/workflows/ci.yml').matchAll(/node-version:\s*'?(\d+)/g)].map(
      ([, major]) => Number(major),
    );
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) expect(version).toBe(wanted);
  });

  it('est celle du Dockerfile du front', () => {
    const images = [...read('deploiement/front.Dockerfile').matchAll(/^FROM node:(\d+)/gm)].map(
      ([, major]) => Number(major),
    );
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(image).toBe(wanted);
  });
});
