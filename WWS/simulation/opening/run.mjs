/**
 * `node run.mjs`          — the opening of both formats, one line per connection.
 * `node run.mjs --sweep`  — the starting alloy, format by format: what the kit is worth.
 * `node run.mjs --grille` — the campaign, swept on the level curve, the kit, the drill and the
 *   troop ceiling.
 * `node run.mjs --rapport` — `rapport.html` beside this file, readable in a browser.
 * `node run.mjs --json <file>` — machine-readable, for the charts.
 *
 * No dependency. Deterministic on the seed.
 */

import { writeFileSync } from 'node:fs';
import { run, hqLevel, troopCapOf, DAY_SEVEN_MINUTE } from './engine.mjs';
import { makePolicy } from './policy.mjs';
import {
  seasonOf, PROFILES, PLANS, PROFILE_DEFAULT, REFERENCE_GROUND, REFERENCE_GROUND_OIL,
} from './scenarios.mjs';
import { SEASON_FORMATS, foundationFor } from './constants.mjs';
import { PRODUCTION_CURVES } from './curves.mjs';
import { writeReport } from './report.mjs';

const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(Math.round(m % 60)).padStart(2, '0')}`;
const pct = (v) => `${v.toFixed(1)} %`;
const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

/** Les trois relevés d'armée que la grille compare. Une saison plus courte rend `null` sur les
 *  bornes qu'elle n'atteint pas, jamais son dernier chiffre : un plateau et une absence se
 *  liraient alors pareil. */
export const TROOP_CHECKPOINTS_H = [24, 48, 96];

const troopsAtHour = (state, hours) => {
  const sample = [...state.series].reverse().find((point) => point.h <= hours);
  return sample && hours * 60 <= state.scenario.seasonHours * 60 ? sample.troops : null;
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
    /** **Monter ou s'étaler**, en deux nombres qui ne se lisent pas l'un sans l'autre : douze
     *  bâtiments de niveau 1 et quatre de niveau 3 tiennent la même place dans un total. */
    totalLevels: state.sites.reduce((n, x) => n + x.level, 0),
    averageLevel: state.sites.length
      ? state.sites.reduce((n, x) => n + x.level, 0) / state.sites.length
      : 0,
    /** L'instant où la saison s'ouvre sur l'eau. `null` = jamais, et c'est une mesure. */
    firstCargoAt: state.firstTroopAt.cargo ?? null,
    troopsAt: Object.fromEntries(
      TROOP_CHECKPOINTS_H.map((hours) => [hours, troopsAtHour(state, hours)]),
    ),
    troopCapFirstAt: state.troopCapFirstAt,
    troopCapSaturatedFrom: state.troopCapSaturatedFrom,
    daySeven: state.daySeven,
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
 * **Quatre leviers à la fois, sur la seule saison que le jeu ait** (`campaign`, ADR 0020 §11).
 * Le balayage précédent — fonderie × extraction × pack — disait ce qu'un débit déplace ; il ne
 * pouvait pas poser la question qui reste ouverte, *monter ou s'étaler*, parce qu'un débit
 * linéaire rend les deux équivalents par construction. La courbe de rendement est donc le
 * premier axe, et les trois autres sont ce qui décide si une courbe est jouable : ce qu'on
 * donne au départ, ce que coûte le temps d'instruire une troupe, et où s'arrête l'armée.
 *
 * **Aucune constante de `convex/constants.ts` ne bouge ici.** Une case de grille est une
 * question, pas une décision : elle vit dans `tuning`, que le moteur lit et que le jeu ignore.
 */
const GRID_CURVES = ['linear', 'compounded'];
const GRID_ENDOWMENTS = [400, 800, 1200];
const GRID_DRILL = [1, 0.5];
const GRID_TROOP_CAP = [24, 48];
const GRID_PROFILES = ['assiduous', 'occasional', 'absent'];

/** Ce que le jeu appelle « plafonné » pour la lecture qui suit : le plafond mord et ne lâche
 *  plus jusqu'au bout de la saison. Toucher n'est pas être borné. */
const SATURATION_FREE_UNTIL_MINUTE = 6 * 24 * 60;

const combinationKey = (row) => `${row.curve}|${row.endowment}|${row.drill}|${row.troopCapTarget}`;

function grid() {
  const rows = [];
  for (const curve of GRID_CURVES) {
    for (const endowment of GRID_ENDOWMENTS) {
      for (const drill of GRID_DRILL) {
        for (const troopCapTarget of GRID_TROOP_CAP) {
          for (const key of GRID_PROFILES) {
            const r = measure(seasonOf('campaign', {
              profile: PROFILES[key],
              startingStock: { alloy: endowment },
              tuning: {
                levelCurve: curve,
                recruitMinutesFactor: drill,
                troopCapTarget,
              },
            }));
            rows.push({
              curve, endowment, drill, troopCapTarget, profile: PROFILES[key].name,
              actions: r.totalActions,
              sessions: r.sessions.length,
              dead: r.deadSessions,
              hq: r.finalHq,
              troops: r.troops,
              troopCap: r.troopCap,
              sites: r.sites,
              averageLevel: Number(r.averageLevel.toFixed(2)),
              firstCargoAt: r.firstCargoAt,
              troopsAt: r.troopsAt,
              troopCapFirstAt: r.troopCapFirstAt,
              troopCapSaturatedFrom: r.troopCapSaturatedFrom,
              alloyMade: Math.round(r.daySeven.produced.alloy),
              alloyCapped: Math.round(r.daySeven.capped.alloy),
              medianQueue: r.medianQueue,
              maxQueue: r.maxQueue,
              stocks: r.stocks,
              capped: r.capped,
            });
          }
        }
      }
    }
  }
  return rows;
}

/**
 * **Les cinq combinaisons demandées**, et la question qu'elles répondent tient en deux clauses
 * qui tirent en sens inverse : le moins de connexions vides possible pour l'occasionnel — donc
 * de la matière à dépenser à chaque visite — *sans* que l'assidu bute sur son plafond de
 * troupes avant le sixième jour, ce qui condamne les cases qui donnent trop, trop tôt.
 *
 * Le filtre lit `troopCapSaturatedFrom` et non la première touche : un assidu qui sature une
 * heure puis pose un cantonnement n'a pas été plafonné, il a été prévenu, et compter sa peur
 * comme une borne éliminerait les cases qui tiennent précisément parce qu'il réagit.
 */
function bestCombinations(rows, howMany = 5) {
  const byKey = new Map();
  for (const row of rows) {
    const key = combinationKey(row);
    if (!byKey.has(key)) byKey.set(key, {});
    byKey.get(key)[row.profile] = row;
  }
  const eligible = [];
  for (const [key, byProfile] of byKey) {
    const assiduous = byProfile.assidu;
    const occasional = byProfile.occasionnel;
    if (!assiduous || !occasional) continue;
    const saturated = assiduous.troopCapSaturatedFrom;
    const capped = saturated !== null && saturated < SATURATION_FREE_UNTIL_MINUTE;
    eligible.push({ key, assiduous, occasional, absent: byProfile.absent, capped, saturated });
  }
  return eligible
    .filter((entry) => !entry.capped)
    .sort((a, b) => a.occasional.dead - b.occasional.dead
      || b.occasional.actions - a.occasional.actions
      || b.assiduous.troops - a.assiduous.troops)
    .slice(0, howMany);
}

/** Une heure, ou le tiret qui dit que ça n'est jamais arrivé — jamais un zéro, qui se lirait
 *  « à la minute zéro ». */
const when = (minute) => (minute === null || minute === undefined ? '—' : hm(minute));

/** Les trois relevés d'armée côte à côte. Une borne hors de la saison rend `—`, pas le dernier
 *  chiffre connu : un plateau et une absence se liraient alors pareil. */
const checkpoints = (row) =>
  TROOP_CHECKPOINTS_H.map((hours) => row.troopsAt[hours] ?? '—').join('/');

/* ── entry ──────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);

if (args.includes('--grille')) {
  const rows = grid();

  console.log('\n════════ GRILLE — campagne (168 h), courbe × dotation × instruction × plafond ════════');
  console.log('courbe      dotat.  instr.  plaf.  profil       │ actions  vides   QG   troupes'
    + '  bâtim./niv.   cargo   24h/48h/96h   alliage j7 (écrêté)  plafonné dès');
  let previous = null;
  for (const row of rows) {
    if (previous && combinationKey(previous) !== combinationKey(row)) console.log('');
    previous = row;
    console.log(
      `${row.curve.padEnd(11)}  ${String(row.endowment).padStart(4)}    ×${row.drill.toFixed(1)}`
      + `    ${String(row.troopCapTarget).padStart(2)}   ${row.profile.padEnd(12)} │`
      + `    ${String(row.actions).padStart(3)}   ${String(row.dead).padStart(2)}/${String(row.sessions).padStart(2)}`
      + `   n.${row.hq}    ${String(row.troops).padStart(2)}/${String(row.troopCap).padStart(2)}`
      + `    ${String(row.sites).padStart(2)} / ${row.averageLevel.toFixed(2)}`
      + `   ${when(row.firstCargoAt).padStart(6)}`
      + `   ${checkpoints(row).padStart(11)}`
      + `      ${String(row.alloyMade).padStart(5)} (${String(row.alloyCapped).padStart(5)})`
      + `      ${when(row.troopCapSaturatedFrom).padStart(6)}`,
    );
  }

  console.log('\n« cargo » = sortie de la première coque, « — » quand la saison n\'en voit aucune.');
  console.log('« plafonné dès » = l\'heure à partir de laquelle le plafond de troupes mord sans plus');
  console.log('lâcher jusqu\'au bout ; « — » quand l\'armée n\'a jamais été bornée en fin de saison.');
  console.log('L\'alliage du jour 7 est ce qui est **entré** dans le monde, et entre parenthèses ce que');
  console.log('le plafond de stock a refusé : un reste final ne distingue pas les deux.');

  console.log('\n════════ LES CINQ COMBINAISONS ════════');
  console.log('Le moins de connexions vides pour l\'occasionnel, sans plafonner l\'assidu avant le jour 6.');
  console.log('\n  rang  courbe       dotat.  instr.  plaf. │ occasionnel        │ assidu');
  console.log('                                            │ vides   actions    │ troupes  plafonné dès  bât./niv.');
  bestCombinations(rows).forEach((entry, rank) => {
    const { assiduous: a, occasional: o } = entry;
    console.log(
      `   ${rank + 1}.   ${o.curve.padEnd(11)}  ${String(o.endowment).padStart(4)}    ×${o.drill.toFixed(1)}`
      + `    ${String(o.troopCapTarget).padStart(2)}  │  ${String(o.dead).padStart(2)}/${o.sessions}`
      + `      ${String(o.actions).padStart(3)}       │   ${String(a.troops).padStart(2)}/${String(a.troopCap).padStart(2)}`
      + `      ${when(a.troopCapSaturatedFrom).padStart(6)}      ${String(a.sites).padStart(2)} / ${a.averageLevel.toFixed(2)}`,
    );
  });

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
