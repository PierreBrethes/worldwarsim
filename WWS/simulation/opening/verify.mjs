/**
 * `node verify.mjs` — does the mirror still say what the game says?
 *
 * `constants.mjs` is a hand-copy of `convex/constants.ts`. A copy drifts, and a drifted mirror
 * does not fail loudly: it produces plausible numbers about a game that no longer exists. This
 * reads the TypeScript as **text** and compares what it can extract, value by value.
 *
 * It is deliberately dumb. It does not evaluate TypeScript and it never will — it would then
 * share the bugs it is meant to catch. What it cannot parse it reports as **unverified**, never
 * as passing: a silent success on an unread table is exactly the failure mode this file exists
 * to prevent.
 *
 * Exit code 1 when anything diverges, so a prompt can wire it to a gate.
 */

import { readFileSync } from 'node:fs';
import * as mirror from './constants.mjs';

/**
 * **Trois sources, parce que les nombres du jeu ne vivent pas tous au même endroit.**
 * `convex/constants.ts` porte l'économie ; le coût par milieu et les places d'un transport
 * vivent dans le domaine pur, qui est ce que le serveur appelle. Un miroir qui ne lirait que
 * le premier laisserait dériver l'allure — le levier central — sans rien dire.
 */
const SOURCES = {
  constants: new URL('../../../convex/constants.ts', import.meta.url),
  routing: new URL('../../../src/domain/routing.ts', import.meta.url),
  troops: new URL('../../../src/domain/troops.ts', import.meta.url),
};

const read = (where) => {
  try {
    return readFileSync(SOURCES[where], 'utf8');
  } catch {
    console.error(`Impossible de lire ${SOURCES[where].pathname}. Ce script doit vivre dans WWS/simulation/opening/.`);
    process.exit(1);
  }
};

const text = read('constants');
const sources = { constants: text, routing: read('routing'), troops: read('troops') };

const problems = [];
const unverified = [];
let checked = 0;

const report = (label, expected, actual) => {
  checked += 1;
  if (Number(expected) !== Number(actual)) problems.push(`${label} : le jeu dit ${expected}, le miroir dit ${actual}`);
};

/** A scalar `export const NAME = 42;` */
function scalar(name, mirrored, where = 'constants') {
  const found = sources[where].match(new RegExp(`export const ${name}\\s*=\\s*([\\d.]+)\\s*;`));
  if (!found) return unverified.push(`${name} (introuvable dans ${where})`);
  report(name, found[1], mirrored);
}

/** The balanced body of `export const NAME = { … }` — brace counting, no parser. */
function bodyOf(name, where = 'constants') {
  const text = sources[where];
  const start = text.indexOf(`export const ${name}`);
  if (start < 0) return null;
  // The value, never the type annotation: `Readonly<Record<K, { … }>> = { … }` opens a brace
  // before the assignment, and reading that one would compare the mirror against a type.
  const assign = text.indexOf('=', start);
  if (assign < 0) return null;
  const open = text.indexOf('{', assign);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

/** Every `key: 42` of a flat table. */
function flatTable(name, mirrored, where = 'constants') {
  const body = bodyOf(name, where);
  if (body === null) return unverified.push(`${name} (bloc introuvable)`);
  const seen = new Set();
  for (const [, key, value] of body.matchAll(/(\w+)\s*:\s*(-?[\d.]+)/g)) {
    seen.add(key);
    if (!(key in mirrored)) problems.push(`${name}.${key} : absent du miroir`);
    else report(`${name}.${key}`, value, mirrored[key]);
  }
  for (const key of Object.keys(mirrored)) {
    if (!seen.has(key)) problems.push(`${name}.${key} : dans le miroir, absent du jeu`);
  }
}

/** `key: { cost: { … }, minutes: 45 }` — the shape of BUILDING_SPEC. */
function specTable(name, mirrored) {
  const body = bodyOf(name);
  if (body === null) return unverified.push(`${name} (bloc introuvable)`);
  const found = new Set();
  for (const [, key, costs, minutes] of body.matchAll(/(\w+)\s*:\s*\{\s*cost:\s*\{([^}]*)\},\s*minutes:\s*(\d+)\s*\}/g)) {
    found.add(key);
    const held = mirrored[key];
    if (!held) { problems.push(`${name}.${key} : absent du miroir`); continue; }
    report(`${name}.${key}.minutes`, minutes, held.minutes);
    const parsed = Object.fromEntries([...costs.matchAll(/(\w+)\s*:\s*(\d+)/g)].map(([, r, v]) => [r, Number(v)]));
    for (const [resource, amount] of Object.entries(parsed)) report(`${name}.${key}.${resource}`, amount, held.cost[resource]);
    for (const resource of Object.keys(held.cost)) {
      if (!(resource in parsed)) problems.push(`${name}.${key}.${resource} : dans le miroir, absent du jeu`);
    }
  }
  for (const key of Object.keys(mirrored)) {
    if (!found.has(key)) problems.push(`${name}.${key} : dans le miroir, absent du jeu`);
  }
}

/** `role: { alloy: 18, minutes: 20 }` — the shape of COST_BY_ROLE. */
function roleTable(name, mirrored) {
  const body = bodyOf(name);
  if (body === null) return unverified.push(`${name} (bloc introuvable)`);
  for (const [, role, alloy, minutes] of body.matchAll(/(\w+)\s*:\s*\{\s*alloy:\s*(\d+),\s*minutes:\s*(\d+)\s*\}/g)) {
    if (!mirrored[role]) { problems.push(`${name}.${role} : absent du miroir`); continue; }
    report(`${name}.${role}.alloy`, alloy, mirrored[role].alloy);
    report(`${name}.${role}.minutes`, minutes, mirrored[role].minutes);
  }
}

/** The two formats: the four numbers each, plus the foundation read as a list of keys. */
function formats() {
  const body = bodyOf('SEASON_FORMATS');
  if (body === null) return unverified.push('SEASON_FORMATS (bloc introuvable)');
  for (const key of Object.keys(mirror.SEASON_FORMATS)) {
    const block = body.match(new RegExp(`${key}\\s*:\\s*\\{([\\s\\S]*?)\\n  \\}`));
    if (!block) { unverified.push(`SEASON_FORMATS.${key}`); continue; }
    const held = mirror.SEASON_FORMATS[key];
    for (const field of ['durationHours', 'hqLevelAtLaunch', 'maxHqLevel', 'buildingCapBase', 'buildingCapPerHqLevel', 'startingAlloy', 'startingOil']) {
      const found = block[1].match(new RegExp(`${field}:\\s*(\\d+)`));
      if (!found) { unverified.push(`SEASON_FORMATS.${key}.${field}`); continue; }
      report(`SEASON_FORMATS.${key}.${field}`, found[1], held[field]);
    }
    const list = block[1].match(/foundation:\s*\[([^\]]*)\]/);
    if (!list) { unverified.push(`SEASON_FORMATS.${key}.foundation`); continue; }
    checked += 1;
    const keys = [...list[1].matchAll(/'([^']+)'/g)].map(([, k]) => k).join(' + ');
    const mine = held.foundation.join(' + ');
    if (keys !== mine) problems.push(`SEASON_FORMATS.${key}.foundation : le jeu dit « ${keys} », le miroir dit « ${mine} »`);
  }
}

/* ── the pass ───────────────────────────────────────────────────────────── */

scalar('BASE_CAP', mirror.BASE_CAP);
scalar('STORAGE_CAP_PER_LEVEL', mirror.STORAGE_CAP_PER_LEVEL);
scalar('LEVEL_COST_FACTOR', mirror.DEFAULT_TUNING.levelCostFactor);
scalar('TROOP_CAP_BASE', mirror.TROOP_CAP_BASE);
scalar('TROOP_CAP_TARGET', mirror.TROOP_CAP_TARGET);
scalar('BILLETS_LEVELS_TO_CAP', mirror.BILLETS_LEVELS_TO_CAP);
scalar('TIER_2_LEVELS_ABOVE_LAUNCH', mirror.TIER_2_LEVELS_ABOVE_LAUNCH);
scalar('TIER_2_FACTOR', mirror.TIER_2_FACTOR);
scalar('MAX_QUEUED_BATCHES', mirror.MAX_QUEUED_BATCHES);
scalar('INITIAL_AMMUNITION_ENGAGEMENTS', mirror.INITIAL_AMMUNITION_ENGAGEMENTS);
scalar('STRENGTH_PER_ROUND', mirror.STRENGTH_PER_ROUND);
scalar('OUTPOST_REACH_KM', mirror.OUTPOST_REACH_KM);
scalar('MINUTES_PER_1000_KM_ON_LAND', mirror.MINUTES_PER_1000_KM_ON_LAND);
scalar('MOVEMENTS_IN_FLIGHT', mirror.MOVEMENTS_IN_FLIGHT);
scalar('REDUCTION_FACTOR', mirror.REDUCTION_FACTOR);

/**
 * **L'allure de colonne**, hors de `convex/constants.ts` : le coût par milieu pèse les arêtes de
 * Dijkstra dans le domaine, et les places d'un transport terrestre y répondent. Le moteur du
 * simulateur ne modélise aucun trajet — ces valeurs ne sont lues par aucun scénario — mais un
 * nombre non miroité est un nombre dont personne ne surveille la dérive, et celui-ci commande
 * le levier mesuré (14 min / 1 000 km).
 */
scalar('LAND_SEATS_PER_TRANSPORT', mirror.LAND_SEATS_PER_TRANSPORT, 'troops');
flatTable('COST_BY_MEDIUM', mirror.COST_BY_MEDIUM, 'routing');

flatTable('EXTRACTION_PER_HOUR', mirror.EXTRACTION_PER_HOUR);
flatTable('UNLOCKED_AT', mirror.UNLOCKED_AT);
flatTable('STARTING_STOCK', mirror.STARTING_STOCK);
specTable('BUILDING_SPEC', mirror.BUILDING_SPEC);
roleTable('COST_BY_ROLE', mirror.COST_BY_ROLE);
formats();

/**
 * Left unread on purpose, and said out loud rather than skipped in silence: the chains and the
 * nominal strengths are nested two deep in shapes this file would have to guess at. They are
 * the next thing to cover, not a decision to leave them out.
 */
unverified.push('CHAINS (débits et intrants des trois chaînes)');
unverified.push('NOMINAL_STRENGTH (effectifs par rôle et par palier)');
unverified.push('STORED_BY (ce que chaque bâtiment de stockage porte)');

console.log(`\n${checked} valeurs comparées entre le jeu (convex/constants.ts, src/domain/routing.ts, src/domain/troops.ts) et le miroir.`);
if (unverified.length > 0) {
  console.log(`\n${unverified.length} non vérifiées — à lire à la main :`);
  for (const line of unverified) console.log(`  · ${line}`);
}
if (problems.length === 0) {
  console.log('\nAucune dérive sur ce qui est vérifiable.');
  process.exit(0);
}
console.log(`\n${problems.length} DÉRIVES :`);
for (const line of problems) console.log(`  ✕ ${line}`);
process.exit(1);
