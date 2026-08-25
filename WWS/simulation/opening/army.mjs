/**
 * `node army.mjs` — what a 48-hour season can actually field, and what stops it.
 *
 * Two questions, in order:
 *  1. What does one troop cost end to end, ammunition included? The load is derived from the
 *     nominal strength, so a cheap unit can carry an expensive magazine — and the table below
 *     is the only place that shows it.
 *  2. Where is the wall? Alloy, ammunition, the troop ceiling, or the building budget. The run
 *     tallies every refusal the recruiting rule met, so the answer is counted, not guessed.
 */

import { COST_BY_ROLE, SEASON_FORMATS, ammunitionLoad, recruitmentCost, troopCap, TROOP_CAP_BASE } from './constants.mjs';
import { run, hqLevel, troopCapOf, totalLevelOf } from './engine.mjs';
import { makePolicy } from './policy.mjs';
import { seasonOf, PROFILES, PROFILE_DEFAULT } from './scenarios.mjs';

const pad = (v, n) => String(v).padStart(n);

/* ── 1. the real price of a troop ───────────────────────────────────────── */

console.log('\n════════ CE QUE COÛTE UNE TROUPE, MUNITIONS COMPRISES ════════');
console.log('rôle              alliage  munitions  total*  effectif  alliage / point  minutes');
const rows = Object.keys(COST_BY_ROLE).map((role) => {
  const c = recruitmentCost(role, 1, 2);
  const strength = { infantry: 50, armor: 12, landTransport: 24, fighter: 12, bomber: 9,
    airTransport: 6, escort: 6, cargo: 8, carrier: 24 }[role];
  return { role, ...c, total: c.alloy + c.ammunition, strength,
    perPoint: (c.alloy + c.ammunition) / strength };
});
for (const r of rows.sort((a, b) => a.total - b.total)) {
  console.log(`${r.role.padEnd(16)} ${pad(r.alloy, 6)}  ${pad(r.ammunition, 8)}  ${pad(r.total, 6)}`
    + `  ${pad(r.strength, 8)}  ${pad(r.perPoint.toFixed(1), 14)}  ${pad(r.minutes, 7)}`);
}
console.log("* l'arsenal transforme 1 alliage en 1 munition : la colonne « total » est le prix réel en alliage.");

/* ── 2. what a 48-hour season fields, and what stops it ─────────────────── */

function fielded(overrides, profileOverrides = {}) {
  const sc = seasonOf('skirmish', { profile: PROFILES.assiduous, ...overrides });
  const { state } = run(sc, makePolicy({ ...PROFILE_DEFAULT, ammoTarget: 240, ...profileOverrides }));
  const tally = state.recruitBlocked ?? {};
  const worst = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  return {
    troops: state.troops.length,
    cap: troopCapOf(state),
    billets: totalLevelOf(state, 'billets'),
    hq: hqLevel(state),
    sites: state.sites.length,
    alloy: Math.round(state.stocks.alloy),
    ammo: Math.round(state.stocks.ammunition),
    wall: worst ? worst[0] : '—',
    wallCount: worst ? worst[1] : 0,
  };
}

console.log('\n════════ CE QU’UNE SAISON DE 48 H MET SUR PIED ════════');
console.log('alliage  plafond visé │ troupes / plafond  baraq.  QG  bâtim.  reste alliage  ce qui bloque');
for (const alloy of [250, 450, 700, 1000, 1500]) {
  for (const target of [24, 12]) {
    // The alloy is the axis swept here; the ammunition is **not** a knob of this study, so it
    // reads the kit its format hands out (`startingAmmunition`, 25/08). Pinned at 60 it named
    // ammunition as the wall at every alloy above 700 — the wall of a season nobody plays.
    const r = fielded({
      startingStock: { alloy, ammunition: SEASON_FORMATS.skirmish.startingAmmunition },
      tuning: { troopCapTarget: target },
    });
    console.log(
      `   ${pad(alloy, 4)}       ${pad(target, 2)}      │      ${pad(r.troops, 2)} / ${pad(r.cap, 2)}`
      + `        ${pad(r.billets, 2)}    ${r.hq}    ${pad(r.sites, 2)}      ${pad(r.alloy, 6)}`
      + `       ${r.wall} (${r.wallCount})`,
    );
  }
}

/* ── 3. the ceiling a season can even reach ─────────────────────────────── */

console.log('\n════════ LE PLAFOND ATTEIGNABLE — ce que les Baraquements coûtent ════════');
console.log('niveaux de Baraquements  plafond(24)  plafond(12)  emplacements  alliage cumulé  nourriture cumulée');
let alloySum = 0;
let foodSum = 0;
for (let level = 1; level <= 6; level += 1) {
  const f = 1.8 ** (level - 1);
  alloySum += Math.round(25 * f);
  foodSum += Math.round(40 * f);
  console.log(`          ${pad(level, 2)}              ${pad(troopCap(level, 24), 3)}          ${pad(troopCap(level, 12), 3)}`
    + `           ${pad(Math.ceil(level / 3), 2)}          ${pad(alloySum, 6)}            ${pad(foodSum, 6)}`);
}
console.log('Un site plafonne au niveau du QG. En 48 h le QG monte à 3 : un Baraquements plafonne donc à 3,');
console.log(`soit ${troopCap(3, 24)} troupes avec la cible actuelle de 24. Deux sites en donnent ${troopCap(6, 24)}.`);
