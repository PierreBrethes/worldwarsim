import { simulerSaison, chargerMonde, brut, BASE, NATIONS } from './sim.mjs';

const monde = chargerMonde('world.json');
const DOCTRINES = ['domination', 'hegemonie', 'influence'];
const mediane = a => { const t = [...a].sort((x, y) => x - y); return t[Math.floor(t.length / 2)]; };
// On calibre sur un haut centile : le seuil doit être atteint par le MEILLEUR joueur
// de la doctrine en fin de saison, pas par la moitié d'entre eux — sinon la saison
// se termine au tiers du temps.
const centile = (a, q) => { const t = [...a].sort((x, y) => x - y); return t[Math.min(t.length - 1, Math.floor(t.length * q))]; };
const moy = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);

function calibrer(cfg, seeds, n) {
  // On fait tourner 48 h SANS seuil : personne ne gagne, on lit les scores bruts.
  const bruts = { domination: [], hegemonie: [], influence: [] };
  for (let s = 0; s < seeds; s++) {
    const r = simulerSaison({ seed: s * 7919 + 13, n, cfg, monde });
    for (const p of r.joueurs) bruts[p.doctrine].push(brut(p, n));
  }
  return {
    domination: Math.max(0.05, centile(bruts.domination, 0.90)),
    hegemonie: Math.max(1, centile(bruts.hegemonie, 0.90)),
    influence: Math.max(1, centile(bruts.influence, 0.90)),
  };
}

function campagne(cfg, seeds, n) {
  const victoires = {}, parCouple = {}, progFin = { domination: [], hegemonie: [], influence: [] };
  const divergences = [], durees = [], decisions = [], combats = [], raids = []; let premature = 0;
  for (const d of DOCTRINES) victoires[d] = 0;

  for (let s = 0; s < seeds; s++) {
    const r = simulerSaison({ seed: s * 7919 + 13, n, cfg, monde });
    victoires[r.gagnant.doctrine]++;
    const cle = r.gagnant.nation.n + ' × ' + r.gagnant.doctrine;
    parCouple[cle] = (parCouple[cle] || 0) + 1;
    for (const p of r.joueurs) {
      progFin[p.doctrine].push(r.progression[p.id]);
      decisions.push(p.decisions / (r.dureeReelleMin / 60));
    }
    // moment où le vainqueur prend la tête pour ne plus la lâcher
    divergences.push((r.divergenceMin ?? r.dureeReelleMin) / r.dureeReelleMin);
    durees.push(r.dureeReelleMin / 60);
    if (r.journal.finPrematuree !== null) premature++;
    combats.push(r.journal.combats); raids.push(r.journal.raidsReussis);
  }
  return {
    victoires, parCouple,
    partDoctrine: Object.fromEntries(DOCTRINES.map(d => [d, victoires[d] / seeds])),
    progMoy: Object.fromEntries(DOCTRINES.map(d => [d, moy(progFin[d])])),
    divergenceMed: mediane(divergences),
    dureeMed: mediane(durees),
    decisionsParHeure: moy(decisions),
    tauxPremature: premature / seeds,
    combatsMoy: moy(combats),
    raidsMoy: moy(raids),
  };
}

/* ---------- balayage ---------- */
const SEEDS = 200, N = 6;
const TRAJETS = [4, 8, 14, 20, 30];   // min pour 1000 km
const CONSTRUCTIONS = [12, 25]; // min pour le niveau 1

console.log('=== BALAYAGE : ratio trajet ÷ construction ===');
console.log(`${SEEDS} saisons par combinaison, ${N} joueurs\n`);
console.log('trajet  constr  ratio |  domin  hegem  influ |  duree  finies  diverg  decis/h  combats  ecart');
console.log('─'.repeat(100));

const resultats = [];
for (const T of TRAJETS) for (const C of CONSTRUCTIONS) {
  const cfg = { ...BASE, TRAJET_MIN_PAR_1000KM: T, CONSTRUCTION_BASE_MIN: C };
  cfg.SEUIL = calibrer(cfg, 30, N);
  const r = campagne(cfg, SEEDS, N);
  // ratio : trajet médian (~7000 km) sur durée d'un bâtiment de niveau 3
  const ratio = (7 * T) / (C * 1.8 ** 2);
  // écart max à 1/3 : 0 = parfaitement équilibré
  const ecart = Math.max(...DOCTRINES.map(d => Math.abs(r.partDoctrine[d] - 1 / 3)));
  resultats.push({ T, C, ratio, ecart, ...r });
  const pc = d => (r.partDoctrine[d] * 100).toFixed(0).padStart(5) + '%';
  console.log(
    `${String(T).padStart(6)}  ${String(C).padStart(6)}  ${ratio.toFixed(2).padStart(5)} | ` +
    `${pc('domination')} ${pc('hegemonie')} ${pc('influence')} | ` +
    `${r.dureeMed.toFixed(1).padStart(5)}h ${(r.tauxPremature * 100).toFixed(0).padStart(5)}% ${(r.divergenceMed * 100).toFixed(0).padStart(6)}% ` +
    `${r.decisionsParHeure.toFixed(2).padStart(8)} ${r.combatsMoy.toFixed(1).padStart(8)} ${r.raidsMoy.toFixed(1).padStart(6)}  ` +
    `${(ecart * 100).toFixed(0).padStart(4)} pts`);
}

const best = resultats.reduce((a, b) => a.ecart <= b.ecart ? a : b);
console.log('\n=== MEILLEUR COMPROMIS ===');
console.log(`  trajet ${best.T} min/1000 km, construction ${best.C} min au niveau 1 (ratio ${best.ratio.toFixed(2)})`);
console.log(`  Paris-Berlin ${(0.88 * best.T).toFixed(0)} min · Paris-Tokyo ${(9.7 * best.T).toFixed(0)} min · bâtiment niveau 3 ${(best.C * 3.24).toFixed(0)} min`);
console.log(`  parts : domination ${(best.partDoctrine.domination*100).toFixed(0)}%, hégémonie ${(best.partDoctrine.hegemonie*100).toFixed(0)}%, influence ${(best.partDoctrine.influence*100).toFixed(0)}%`);
console.log(`  décisions par heure et par joueur : ${best.decisionsParHeure.toFixed(2)}`);
console.log(`  divergence : le vainqueur prend la tête définitivement à ${(best.divergenceMed*100).toFixed(0)}% de la saison`);

/* ---------- couples nation × doctrine ---------- */
console.log('\n=== COUPLES NATION × DOCTRINE (meilleur réglage, 400 saisons) ===');
const cfgB = { ...BASE, TRAJET_MIN_PAR_1000KM: best.T, CONSTRUCTION_BASE_MIN: best.C };
cfgB.SEUIL = calibrer(cfgB, 40, N);
const gros = campagne(cfgB, 900, N);
const attendu = 1 / NATIONS.length;
const lignes = [];
for (const nat of NATIONS) for (const d of DOCTRINES) {
  const v = gros.parCouple[nat.n + ' × ' + d] || 0;
  lignes.push({ cle: nat.n + ' × ' + d, v, part: v / 900 });
}
lignes.sort((a, b) => b.v - a.v);
console.log('  attendu si parfaitement neutre : ' + (100 / (NATIONS.length * 3)).toFixed(1) + '% par couple\n');
for (const l of lignes.slice(0, 6)) console.log(`   fort   ${l.cle.padEnd(34)} ${(l.part*100).toFixed(1)}%`);
console.log('   ...');
for (const l of lignes.slice(-5)) console.log(`   faible ${l.cle.padEnd(34)} ${(l.part*100).toFixed(1)}%`);


/* ---------- contre-épreuve : le triangle est-il vraiment mécanique ? ---------- */
console.log('\n=== CONTRE-ÉPREUVE : retirer les outils de soustraction ===');
const cfgSans = { ...cfgB, COUT_EMBARGO_R: 1e9, COUT_EXPOSITION_R: 1e9, SANS_RAID: true };
cfgSans.SEUIL = calibrer(cfgSans, 40, N);
const sans = campagne(cfgSans, 200, N);
const ecartSans = Math.max(...DOCTRINES.map(d => Math.abs(sans.partDoctrine[d] - 1 / 3)));
const ecartAvec = Math.max(...DOCTRINES.map(d => Math.abs(gros.partDoctrine[d] - 1 / 3)));
console.log('  avec outils  : ' + DOCTRINES.map(d => d + ' ' + (gros.partDoctrine[d]*100).toFixed(0) + '%').join(', ') + `  (ecart ${(ecartAvec*100).toFixed(0)} pts)`);
console.log('  sans outils  : ' + DOCTRINES.map(d => d + ' ' + (sans.partDoctrine[d]*100).toFixed(0) + '%').join(', ') + `  (ecart ${(ecartSans*100).toFixed(0)} pts)`);

import fs from 'fs';
fs.writeFileSync('resultats.json', JSON.stringify({ resultats, best, couples: lignes }, null, 1));
console.log('\nresultats.json ecrit');
