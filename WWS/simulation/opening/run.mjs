/**
 * `node run.mjs`          — the opening of both formats, one line per connection.
 * `node run.mjs --sweep`  — the starting alloy, format by format: what the kit is worth.
 * `node run.mjs --grille` — the campaign, swept on the foundry, the extraction and the kit.
 * `node run.mjs --rapport` — `rapport.html` beside this file, readable in a browser.
 * `node run.mjs --json <file>` — machine-readable, for the charts.
 *
 * No dependency. Deterministic on the seed.
 */

import { writeFileSync } from 'node:fs';
import { run, hqLevel, troopCapOf } from './engine.mjs';
import { makePolicy } from './policy.mjs';
import {
  seasonOf, PROFILES, PLANS, PROFILE_DEFAULT, REFERENCE_GROUND, REFERENCE_GROUND_OIL,
} from './scenarios.mjs';
import { SEASON_FORMATS, foundationFor, EXTRACTION_PER_HOUR } from './constants.mjs';
import { writeReport } from './report.mjs';

const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(Math.round(m % 60)).padStart(2, '0')}`;
const pct = (v) => `${v.toFixed(1)} %`;
const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

export function measure(scenario, profile = PROFILE_DEFAULT) {
  const { state, busyPct, longestGap } = run(scenario, makePolicy(profile));
  const actions = state.sessions.map((x) => x.actions);
  const sorted = [...actions].sort((a, b) => a - b);
  const hqTimes = {};
  for (const e of state.log) if (e.kind === 'built' && e.key === 'hq') hqTimes[e.level] = e.minute;
  const dead = actions.filter((a) => a === 0).length;

  /**
   * The foundation costs six clicks and nothing else. They are actions — the player does place
   * them — but counting them beside the rest would let the starting line flatter itself, so
   * they travel apart.
   */
  const placements = state.log.filter((e) => e.kind === 'build' && e.minutes === 0).length;

  return {
    name: scenario.name,
    format: scenario.format,
    profileName: scenario.profileName,
    sessions: state.sessions,
    totalActions: actions.reduce((a, b) => a + b, 0),
    foundationPlacements: placements,
    medianActions: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    /** What the player walks in on, not what he leaves behind: a queue read after the fact would
     *  measure the policy's appetite rather than the wait it creates. */
    medianQueue: median(state.sessions.map((x) => x.queueDepth)),
    /** La médiane seule dirait « 0 » d'une file qui a pourtant existé : elle se vide entre deux
     *  visites, et c'est le maximum qui dit si le joueur a commandé sa saison d'un clic. */
    maxQueue: Math.max(0, ...state.sessions.map((x) => x.queueDepth)),
    deadSessions: dead,
    deadPct: actions.length ? (dead / actions.length) * 100 : 0,
    busyPct,
    longestGap,
    hqTimes,
    finalHq: hqLevel(state),
    troops: state.troops.length,
    lost: state.lostTroops,
    troopCap: troopCapOf(state),
    sites: state.sites.length,
    stocks: Object.fromEntries(Object.entries(state.stocks).map(([k, v]) => [k, Math.round(v)])),
    /** Ce que le plafond a refusé, par ressource. Un stock au plafond n'est pas un reste, c'est
     *  une perte — et les deux se lisent pareil dans un stock final si on ne compte pas l'une. */
    capped: Object.fromEntries(Object.entries(state.capped).map(([k, v]) => [k, Math.round(v)])),
    series: state.series,
    log: state.log,
  };
}

/** A remainder the ceiling was throwing away is named for what it is, with a `!`. */
const rest = (r, key) => `${key} ${r.stocks[key]}${r.capped[key] > 0 ? '!' : ''}`;

function printReport(r) {
  console.log(`\n══════ ${r.name} ══════`);
  console.log(`  actions : ${r.totalActions} sur ${r.sessions.length} connexions   médiane ${r.medianActions}   `
    + `connexions vides ${r.deadSessions}/${r.sessions.length} (${pct(r.deadPct)})`);
  console.log(`  dont socle posé : ${r.foundationPlacements} placements gratuits`);
  console.log(`  chantier ou file active : ${pct(r.busyPct)}   plus long trou : ${hm(r.longestGap)}`
    + `   file à l'arrivée : médiane ${r.medianQueue}, maximum ${r.maxQueue}`);
  console.log(`  QG : ${Object.entries(r.hqTimes).map(([l, m]) => `n.${l} à ${hm(m)}`).join(', ') || '—'} → n.${r.finalHq}`
    + `   troupes ${r.troops}/${r.troopCap} (perdues ${r.lost})   bâtiments ${r.sites}`);
  console.log(`  restes : ${['alloy', 'food', 'ammunition', 'coal', 'ore'].map((k) => rest(r, k)).join('  ')}`
    + '   (! = plafond atteint, ce n’est plus un reste mais une perte)');
  const line = r.sessions.map((s) => (s.actions === 0 ? '·' : String(Math.min(s.actions, 9)))).join(' ');
  console.log(`  connexions : ${line}`);
}

/* ── the grid ───────────────────────────────────────────────────────────── */

/**
 * **Trois leviers à la fois, sur la seule saison que le jeu ait** (`campaign`, ADR 0020 §11). Le
 * balayage à un axe disait « le pack ne suffit pas » sans dire de quoi ; croiser la fonderie,
 * l'extraction et le pack est ce qui permet de voir lequel des trois est le goulot, et à partir
 * d'où les deux autres cessent de compter. L'escarmouche reste hors périmètre : c'est un
 * scénario de l'instrument, pas une ligne de départ du jeu.
 */
const GRID_FOUNDRY = [4, 6, 8];
const GRID_EXTRACTION = [1, 1.5, 2];
const GRID_PACK = [250, 300, 400, 500];
const GRID_PROFILES = ['assiduous', 'occasional', 'absent'];

function grid() {
  const rows = [];
  for (const foundry of GRID_FOUNDRY) {
    for (const extraction of GRID_EXTRACTION) {
      for (const pack of GRID_PACK) {
        for (const key of GRID_PROFILES) {
          const r = measure(seasonOf('campaign', {
            profile: PROFILES[key],
            startingStock: { alloy: pack },
            tuning: {
              foundryPerHour: foundry,
              orePerHour: EXTRACTION_PER_HOUR.ore * extraction,
              coalPerHour: EXTRACTION_PER_HOUR.coal * extraction,
            },
          }));
          rows.push({
            foundry, extraction, pack, profile: PROFILES[key].name,
            actions: r.totalActions,
            sessions: r.sessions.length,
            dead: r.deadSessions,
            hq: r.finalHq,
            troops: r.troops,
            troopCap: r.troopCap,
            sites: r.sites,
            medianQueue: r.medianQueue,
            maxQueue: r.maxQueue,
            stocks: r.stocks,
            capped: r.capped,
          });
        }
      }
    }
  }
  return rows;
}

const restOf = (row, key) => `${row.stocks[key]}${row.capped[key] > 0 ? '!' : ''}`;

/* ── entry ──────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);

if (args.includes('--grille')) {
  console.log('\n════════ GRILLE — campagne (168 h), fonderie × extraction × pack ════════');
  console.log('fonderie  extr.  pack  profil       │ actions  vides   QG  troupes  bâtim.  file méd./max'
    + '   alliage  charbon  minerai');
  const rows = grid();
  let previous = null;
  for (const row of rows) {
    if (previous && (previous.foundry !== row.foundry || previous.extraction !== row.extraction)) {
      console.log('');
    }
    previous = row;
    console.log(
      `   ${String(row.foundry).padStart(2)}/h  ×${row.extraction.toFixed(1)}  ${String(row.pack).padStart(4)}`
      + `  ${row.profile.padEnd(12)} │    ${String(row.actions).padStart(3)}   ${String(row.dead).padStart(2)}/${String(row.sessions).padStart(2)}`
      + `   n.${row.hq}    ${String(row.troops).padStart(2)}/${String(row.troopCap).padStart(2)}`
      + `      ${String(row.sites).padStart(2)}`
      + `      ${String(row.medianQueue).padStart(2)}/${String(row.maxQueue).padEnd(2)}`
      + `    ${restOf(row, 'alloy').padStart(6)}   ${restOf(row, 'coal').padStart(6)}`
      + `   ${restOf(row, 'ore').padStart(6)}`,
    );
  }
  console.log('\n! = le plafond de stock a refusé de la matière : ce n’est plus un reste, c’est une perte.');
  writeFileSync(new URL('./grille.json', import.meta.url), JSON.stringify(rows, null, 1));
  console.log('\n→ grille.json');
} else if (args.includes('--rapport')) {
  const runs = {};
  for (const key of GRID_PROFILES) {
    runs[key] = measure(seasonOf('campaign', { profile: PROFILES[key] }));
  }
  const path = writeReport(runs);
  console.log(`\n→ ${path}`);
} else if (args.includes('--sweep')) {
  console.log('\n════════ BALAYAGE — alliage de départ, joueur assidu, plan économie ════════');
  console.log('format     alliage │ actions  vides    QG final  troupes  bâtiments  alliage restant');
  const rows = [];
  for (const format of ['skirmish', 'campaign']) {
    for (const alloy of [200, 300, 420, 600, 800, 1000, 1300, 1800]) {
      const r = measure(seasonOf(format, { startingStock: { alloy } }));
      rows.push({ format, alloy, ...r, series: undefined, log: undefined });
      console.log(
        `${format.padEnd(10)}  ${String(alloy).padStart(4)}  │`
        + `   ${String(r.totalActions).padStart(3)}    ${String(r.deadSessions).padStart(2)}/${r.sessions.length}`
        + `      n.${r.finalHq}`
        + `      ${String(r.troops).padStart(2)}/${String(r.troopCap).padStart(2)}`
        + `        ${String(r.sites).padStart(2)}`
        + `       ${String(r.stocks.alloy).padStart(5)}`,
      );
    }
  }
  writeFileSync(new URL('./sweep.json', import.meta.url), JSON.stringify(rows, null, 1));
  console.log('\n→ sweep.json');
} else {
  const out = {};
  const keep = (k, r) => { out[k] = r; printReport(r); };

  for (const format of ['skirmish', 'campaign']) {
    const spec = SEASON_FORMATS[format];
    console.log(`\n════════ ${format.toUpperCase()} — ${spec.defaultDurationHours} h, QG ${spec.hqLevelAtLaunch}, `
      + `socle ${foundationFor(REFERENCE_GROUND)
        .map((due) => due.key)
        .join(' + ')}, alliage ${spec.startingAlloy} ════════`);
    for (const key of ['assiduous', 'occasional', 'absent']) {
      keep(`${format}-${key}`, measure(seasonOf(format, { profile: PROFILES[key] })));
    }
  }

  /**
   * **Le sol à cinq extracteurs**, où la pose due hors plafond se mesure. Sur la France la règle
   * ne change rien : la dette y tient sous le plafond. Le joueur assidu seulement — ce n'est pas
   * un profil qu'on compare ici, c'est une règle qu'on regarde mordre.
   */
  console.log(`\n════════ SOL À CINQ EXTRACTEURS — États-Unis, socle ${foundationFor(REFERENCE_GROUND_OIL)
    .map((due) => due.key)
    .join(' + ')} (joueur assidu, campagne) ════════`);
  keep('campaign-oil', measure(seasonOf('campaign', {
    profile: PROFILES.assiduous,
    ground: REFERENCE_GROUND_OIL,
    name: 'campagne — assidu, sol pétrolier',
  })));

  console.log('\n════════ MÊME SAISON, PLAN ARMÉE D\'ABORD (joueur assidu, 48 h) ════════');
  keep('army-plan', measure(
    seasonOf('skirmish', { profile: PROFILES.assiduous, name: '48 h — assidu, plan armée' }),
    { ...PROFILE_DEFAULT, plan: PLANS.army },
  ));

  console.log('\n════════ AVEC DES PERTES — 4 troupes par jour (joueur assidu, 48 h) ════════');
  keep('losses', measure(seasonOf('skirmish', {
    profile: PROFILES.assiduous, lossesPerDay: 4, name: '48 h — assidu, pertes 4/j',
  })));

  /**
   * The guard rail of the prompt that set this starting line: if it does not bite, the opening
   * has not moved. Printed rather than asserted — the instrument measures, the tests judge.
   */
  const gate = out['skirmish-assiduous'];
  console.log('\n════════ GARDE-FOU — 48 h, joueur assidu ════════');
  console.log(`  actions ${gate.totalActions} (≥ 25 attendu) — ${gate.totalActions >= 25 ? 'tenu' : 'MANQUÉ'}`);
  console.log(`  connexions vides ${gate.deadSessions}/${gate.sessions.length} (≤ 1 attendu) — `
    + `${gate.deadSessions <= 1 ? 'tenu' : 'MANQUÉ'}`);

  const target = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
  if (target) writeFileSync(target, JSON.stringify(out, null, 1));
}
