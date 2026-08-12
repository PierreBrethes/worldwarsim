/**
 * Régénère `public/monde.json` depuis world-atlas (Natural Earth), projeté en
 * Natural Earth 1 sur une sphère de 400×208 unités.
 *
 * `geoProject` traverse le stream d3, ce qui découpe correctement l'antiméridien —
 * projeter point par point produirait une Russie qui traverse toute la carte.
 * Le point représentatif est un pôle d'inaccessibilité approché (polylabel), pas un
 * centroïde : le centroïde place la France en Espagne et le Japon en pleine mer.
 *
 * Usage : node scripts/generer-monde.mjs [--detail 50m|110m]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoNaturalEarth1 } from 'd3-geo';
import { geoProject } from 'd3-geo-projection';
import polylabel from 'polylabel';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const detail = process.argv.includes('--detail')
  ? process.argv[process.argv.indexOf('--detail') + 1]
  : '50m';

const LARGEUR = 400;
const HAUTEUR = 208;
/** En unités² projetées (1 unité ≈ 111 km) : écarte les rochers trop petits pour être cliqués. */
const AIRE_MINIMALE_ANNEAU = 0.05;

const monde = JSON.parse(readFileSync(require.resolve(`world-atlas/countries-${detail}.json`), 'utf8'));
const projection = geoNaturalEarth1().fitExtent(
  [
    [0, 0],
    [LARGEUR, HAUTEUR],
  ],
  { type: 'Sphere' },
);

const arrondi = (valeur) => Math.round(valeur * 100) / 100;

function contourDeSphere() {
  const lignes = [];
  for (let latitude = -90; latitude <= 90; latitude++) {
    const [xOuest] = projection([-180, latitude]);
    const [xEst] = projection([180, latitude]);
    const [, y] = projection([0, latitude]);
    lignes.push([latitude, arrondi(xOuest), arrondi(xEst), arrondi(y)]);
  }
  return lignes;
}

function aireDe(anneau) {
  let somme = 0;
  for (let i = 0; i < anneau.length - 1; i++) {
    somme += anneau[i][0] * anneau[i + 1][1] - anneau[i + 1][0] * anneau[i][1];
  }
  return Math.abs(somme / 2);
}

/** Anneaux extérieurs seulement : les trous (Lesotho, Saint-Marin…) sont des pays à part entière. */
function anneauxExterieurs(geometrie) {
  if (!geometrie) return [];
  if (geometrie.type === 'Polygon') return [geometrie.coordinates[0]];
  if (geometrie.type === 'MultiPolygon') return geometrie.coordinates.map((polygone) => polygone[0]);
  return [];
}

function sansPointDeFermeture(anneau) {
  const [premier, dernier] = [anneau[0], anneau[anneau.length - 1]];
  return premier[0] === dernier[0] && premier[1] === dernier[1] ? anneau.slice(0, -1) : anneau;
}

/** Injouable, sans PNJ ni avant-poste possible : sa masse visuelle n'achète rien. */
const PAYS_ECARTES = new Set(['Antarctica']);

const pays = [];
for (const brut of feature(monde, monde.objects.countries).features) {
  if (PAYS_ECARTES.has(brut.properties?.name)) continue;
  const projete = geoProject(brut, projection);
  const anneaux = anneauxExterieurs(projete?.geometry)
    .filter((anneau) => anneau && anneau.length >= 4 && aireDe(anneau) >= AIRE_MINIMALE_ANNEAU)
    .map((anneau) => sansPointDeFermeture(anneau).map(([x, y]) => [arrondi(x), arrondi(y)]));
  if (anneaux.length === 0 || !brut.properties?.name) continue;

  const principal = anneaux.reduce((a, b) => (aireDe(a) >= aireDe(b) ? a : b));
  const representatif = polylabel([principal], 0.5);
  const lonLat = projection.invert(representatif);
  pays.push({
    n: brut.properties.name,
    c: [arrondi(representatif[0]), arrondi(representatif[1])],
    ll: [arrondi(lonLat[0]), arrondi(lonLat[1])],
    p: anneaux,
  });
}

const NATIONS_JOUABLES = [
  'France',
  'United Kingdom',
  'United States of America',
  'Russia',
  'Germany',
  'Japan',
  'Italy',
  'China',
];
for (const nom of NATIONS_JOUABLES) {
  if (!pays.some((candidat) => candidat.n === nom)) {
    throw new Error(`nation jouable absente de l'export : ${nom}`);
  }
}

const xs = pays.flatMap((candidat) => candidat.p.flat().map(([x]) => x));
const ys = pays.flatMap((candidat) => candidat.p.flat().map(([, y]) => y));
const sortie = {
  meta: {
    minX: arrondi(Math.min(...xs)),
    maxX: arrondi(Math.max(...xs)),
    minY: arrondi(Math.min(...ys)),
    maxY: arrondi(Math.max(...ys)),
    sphere: { minX: 0, maxX: LARGEUR, minY: 0, maxY: HAUTEUR },
    outline: contourDeSphere(),
  },
  countries: pays,
};

writeFileSync('public/monde.json', JSON.stringify(sortie));
const points = pays.reduce((somme, candidat) => somme + candidat.p.flat().length, 0);
console.log(`${pays.length} pays, ${points} points, ${(JSON.stringify(sortie).length / 1024).toFixed(0)} Ko (${detail})`);
