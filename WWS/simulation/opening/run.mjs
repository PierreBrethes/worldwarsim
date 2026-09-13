/**
 * `node run.mjs`          — the opening of both formats, one line per connection.
 * `node run.mjs --sweep`  — the starting alloy, format by format: what the kit is worth.
 * `node run.mjs --json <file>` — machine-readable, for the charts.
 *
 * No dependency. Deterministic on the seed.
 */

import { writeFileSync } from 'node:fs';
import { run, hqLevel, troopCapOf } from './engine.mjs';
import { makePolicy } from './policy.mjs';
import { seasonOf, PROFILES, PLANS, PROFILE_DEFAULT, REFERENCE_GROUND } from './scenarios.mjs';
import { SEASON_FORMATS, foundationFor } from './constants.mjs';

const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(Math.round(m % 60)).padStart(2, '0')}`;
const pct = (v) => `${v.toFixed(1)} %`;

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
    sessions: state.sessions,
    totalActions: actions.reduce((a, b) => a + b, 0),
    foundationPlacements: placements,
    medianActions: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
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
    series: state.series,
    log: state.log,
  };
}

function printReport(r) {
  console.log(`\n══════ ${r.name} ══════`);
  console.log(`  actions : ${r.totalActions} sur ${r.sessions.length} connexions   médiane ${r.medianActions}   `
    + `connexions vides ${r.deadSessions}/${r.sessions.length} (${pct(r.deadPct)})`);
  console.log(`  dont socle posé : ${r.foundationPlacements} placements gratuits`);
  console.log(`  chantier ou file active : ${pct(r.busyPct)}   plus long trou : ${hm(r.longestGap)}`);
  console.log(`  QG : ${Object.entries(r.hqTimes).map(([l, m]) => `n.${l} à ${hm(m)}`).join(', ') || '—'} → n.${r.finalHq}`
    + `   troupes ${r.troops}/${r.troopCap} (perdues ${r.lost})   bâtiments ${r.sites}`);
  console.log(`  restes : ${['alloy', 'food', 'ammunition', 'coal', 'ore'].map((k) => `${k} ${r.stocks[k]}`).join('  ')}`);
  const line = r.sessions.map((s) => (s.actions === 0 ? '·' : String(Math.min(s.actions, 9)))).join(' ');
  console.log(`  connexions : ${line}`);
}

/* ── entry ──────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);

if (args.includes('--sweep')) {
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
