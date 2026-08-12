/**
 * Extrait les frontières admin-1 (régions, états, départements…) de Natural Earth 10m vers
 * `public/regions.json`, dans la même projection que `monde.json`.
 *
 * Seules les **frontières intérieures** sont gardées — les tronçons partagés par deux
 * régions (`mesh` avec `a !== b`). Les côtes et les frontières de pays sont déjà dessinées
 * par la carte : les redessiner ici doublerait chaque trait avec un léger désaccord de
 * simplification, visible comme un dédoublement au zoom.
 *
 * Le 10m est le seul jeu complet (le 50m ne couvre que les grands pays — la France n'y a
 * aucune région), simplifié ici vers une densité comparable au monde 50m.
 *
 * Usage : node scripts/generer-regions.mjs <chemin/vers/ne_10m_admin_1_states_provinces.geojson>
 * (source : github.com/nvkelso/natural-earth-vector, dossier geojson/)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { geoNaturalEarth1 } from 'd3-geo';
import { geoProject } from 'd3-geo-projection';
import { feature, mesh } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';

const source = process.argv[2];
if (!source) throw new Error('chemin du geojson admin-1 requis');

const LARGEUR = 400;
const HAUTEUR = 208;
/** Part des sommets conservés après simplification — 0.18 rejoint la densité du monde 50m. */
const PART_SOMMETS = 0.06;
const LONGUEUR_MINIMALE = 0.4;

const brut = JSON.parse(readFileSync(source, 'utf8'));
const topo = topology({ regions: brut }, 1e6);
const pesee = presimplify(topo);
const simplifie = simplify(pesee, quantile(pesee, PART_SOMMETS));
const interieures = mesh(simplifie, simplifie.objects.regions, (a, b) => a !== b);

const projection = geoNaturalEarth1().fitExtent(
  [
    [0, 0],
    [LARGEUR, HAUTEUR],
  ],
  { type: 'Sphere' },
);
const projete = geoProject(interieures, projection);

const arrondi = (valeur) => Math.round(valeur * 100) / 100;
const lignes = [];
for (const ligne of projete.coordinates) {
  const points = ligne.map(([x, y]) => [arrondi(x), arrondi(y)]);
  let longueur = 0;
  for (let i = 1; i < points.length; i++) {
    longueur += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  if (points.length >= 2 && longueur >= LONGUEUR_MINIMALE) lignes.push(points);
}

/**
 * Les polygones servent au survol (point-dans-région, surbrillance). Ils sortent de la même
 * topologie simplifiée que les lignes : mêmes arcs, donc la surbrillance épouse les traits.
 */
const anneauxDe = (geometrie) => {
  if (!geometrie) return [];
  if (geometrie.type === 'Polygon') return [geometrie.coordinates[0]];
  if (geometrie.type === 'MultiPolygon') return geometrie.coordinates.map((polygone) => polygone[0]);
  return [];
};

const regions = [];
for (const region of feature(simplifie, simplifie.objects.regions).features) {
  const nom = region.properties?.name;
  if (!nom) continue;
  const projeteRegion = geoProject(region, projection);
  const anneaux = anneauxDe(projeteRegion?.geometry)
    .filter((anneau) => anneau && anneau.length >= 4)
    .map((anneau) => anneau.map(([x, y]) => [arrondi(x), arrondi(y)]));
  if (anneaux.length === 0) continue;
  regions.push({ n: nom, p: anneaux });
}

const sortie = { lignes, regions };
writeFileSync('public/regions.json', JSON.stringify(sortie));
const points = lignes.reduce((somme, ligne) => somme + ligne.length, 0);
const pointsRegions = regions.reduce(
  (somme, region) => somme + region.p.reduce((s, anneau) => s + anneau.length, 0),
  0,
);
console.log(
  `${lignes.length} lignes (${points} pts), ${regions.length} régions (${pointsRegions} pts), ${(JSON.stringify(sortie).length / 1024).toFixed(0)} Ko`,
);
