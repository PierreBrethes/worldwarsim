import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

/**
 * **Ce qu'un fichier de route garde, toutes les pages le téléchargent.** Le routeur ne détache
 * d'un fichier de route que son `component` : ce qu'il exporte d'autre, et ce que lisent ses
 * autres options (`loader`, `beforeLoad`, `validateSearch`), reste dans le chunk d'entrée. C'est
 * ainsi que la une publique chargeait three.js (le `loader` du plateau lisait le cadre du moteur)
 * et l'édition finale (une page exportée pour son test). Mesuré le 10/11/2026 : 430 Ko de
 * JavaScript compressé à froid sur `/`, 212 une fois ces deux règles tenues.
 */
const routes = join(import.meta.dirname);
/** La racine est le chunk d'entrée : ce qu'elle exporte n'y ajoute rien. */
const routeFiles = readdirSync(routes).filter(
  (name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx') && name !== '__root.tsx',
);

it('n’exporte d’un fichier de route que sa route', () => {
  const offenders = routeFiles.flatMap((name) =>
    [...readFileSync(join(routes, name), 'utf8').matchAll(/^export\s+(?!const Route\b).*$/gm)].map(
      ([line]) => `${name}: ${line}`,
    ),
  );
  expect(
    offenders,
    'la page va dans routes/-<route>/, le fichier de route ne garde que Route',
  ).toEqual([]);
});

it('importe le chargeur du plateau à l’appel : il lit le cadre du moteur, donc three.js', () => {
  const board = readFileSync(join(routes, 'plateau.tsx'), 'utf8');
  expect(board).not.toMatch(/^import .*['"]@\/data\/loadGame['"]/m);
  expect(board).toMatch(/loader: \(\) => import\('@\/data\/loadGame'\)/);
});
