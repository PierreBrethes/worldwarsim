/** Vérification du chiffrage de combat : lisibilité, absence de contre absolu, riposte non nulle. */

const NOMINAL = {
  INF1: 50, INF2: 30, BLI1: 12, BLI2: 6, TRT: 24,
  CHA: 12, BOM: 9, TRA: 6,
  ESC: 6, CAR: 8, PAV: 24,
};

const LIBELLE = {
  INF1: 'infanterie MK1', INF2: 'infanterie MK2', BLI1: 'blindé MK1', BLI2: 'blindé MK2',
  TRT: 'transport terrestre', CHA: 'chasseur', BOM: 'bombardier', TRA: 'transport aérien',
  ESC: 'escorte', CAR: 'cargo', PAV: 'porte-avions',
};

const R = Object.keys(NOMINAL);
const _ = null;

// part de l'effectif nominal du défenseur détruite par UNE passe d'un attaquant à pleine force
const D = {
  INF1: { INF1:.50, INF2:.55, BLI1:.15, BLI2:.05, TRT:.70, CHA:_,   BOM:_,   TRA:_,   ESC:_,   CAR:_,   PAV:_   },
  INF2: { INF1:.35, INF2:.40, BLI1:.65, BLI2:.45, TRT:.60, CHA:.06, BOM:.10, TRA:.12, ESC:_,   CAR:_,   PAV:_   },
  BLI1: { INF1:.70, INF2:.65, BLI1:.50, BLI2:.25, TRT:.85, CHA:_,   BOM:_,   TRA:_,   ESC:_,   CAR:_,   PAV:_   },
  BLI2: { INF1:.75, INF2:.70, BLI1:.75, BLI2:.50, TRT:.90, CHA:_,   BOM:_,   TRA:_,   ESC:_,   CAR:_,   PAV:_   },
  TRT:  { INF1:.10, INF2:.10, BLI1:.05, BLI2:.02, TRT:.15, CHA:_,   BOM:_,   TRA:_,   ESC:_,   CAR:_,   PAV:_   },
  CHA:  { INF1:.25, INF2:.25, BLI1:.10, BLI2:.05, TRT:.45, CHA:.50, BOM:.75, TRA:.85, ESC:.10, CAR:.25, PAV:.12 },
  BOM:  { INF1:.45, INF2:.45, BLI1:.60, BLI2:.55, TRT:.60, CHA:.08, BOM:.20, TRA:.25, ESC:.55, CAR:.60, PAV:.65 },
  TRA:  { INF1:_,   INF2:_,   BLI1:_,   BLI2:_,   TRT:_,   CHA:_,   BOM:_,   TRA:_,   ESC:_,   CAR:_,   PAV:_   },
  ESC:  { INF1:.10, INF2:.10, BLI1:.05, BLI2:.02, TRT:.12, CHA:.15, BOM:.15, TRA:.18, ESC:.50, CAR:.70, PAV:.45 },
  CAR:  { INF1:_,   INF2:_,   BLI1:_,   BLI2:_,   TRT:_,   CHA:_,   BOM:_,   TRA:_,   ESC:.05, CAR:.10, PAV:.05 },
  PAV:  { INF1:.15, INF2:.15, BLI1:.08, BLI2:.04, TRT:.25, CHA:.40, BOM:.35, TRA:.45, ESC:.30, CAR:.40, PAV:.30 },
};

const BONUS_DEFENSEUR = 1.15;
const SEUIL_DEROUTE = 0.25;
/** Une passe de résolution = l'attaquant frappe, le défenseur riposte. Une seule.
 *  L'ADR 0014 abandonne explicitement la résolution à plusieurs passes. */
const PASSES_MAX = 1;

const pertes = (att, def, forceAtt, mult = 1) => {
  const base = D[att][def];
  if (base === null) return 0;
  return Math.min(NOMINAL[def], Math.round(base * forceAtt * mult * NOMINAL[def]));
};

/** Un engagement : l'attaquant frappe, le défenseur riposte avec ses survivants. */
function engagement(att, def, { terrain = 1, tenaille = 1 } = {}) {
  let a = NOMINAL[att], d = NOMINAL[def];
  const journal = [];
  for (let passe = 1; passe <= PASSES_MAX; passe++) {
    const subiesD = pertes(att, def, a / NOMINAL[att], tenaille / (BONUS_DEFENSEUR * terrain));
    d = Math.max(0, d - subiesD);
    const subiesA = d > 0 ? pertes(def, att, d / NOMINAL[def], BONUS_DEFENSEUR * terrain) : 0;
    a = Math.max(0, a - subiesA);
    journal.push({ passe, subiesD, subiesA, a, d });
    if (d === 0 || a === 0) break;
    if (d / NOMINAL[def] < SEUIL_DEROUTE || a / NOMINAL[att] < SEUIL_DEROUTE) break;
  }
  return { a, d, journal, perteA: NOMINAL[att] - a, perteD: NOMINAL[def] - d };
}

console.log('=== Lisibilité : première passe, attaquant à pleine force, défenseur en plaine ===\n');
console.log('attaquant             défenseur             il perd   je perds   verdict');
console.log('─'.repeat(84));
const alertes = [];
for (const att of R) {
  for (const def of R) {
    if (D[att][def] === null) continue;
    const r = engagement(att, def);
    const partD = r.perteD / NOMINAL[def];
    const partA = r.perteA / NOMINAL[att];
    let verdict = '';
    const victime = def === 'TRT' || def === 'TRA' || def === 'CAR';
    if (partD >= 0.95 && partA <= 0.05 && !victime) { verdict = '⚠ contre absolu'; alertes.push(`${att}→${def} : contre absolu (${Math.round(partD*100)}% / ${Math.round(partA*100)}%)`); }
    else if (partD >= 0.95 && victime) verdict = 'victime par design';
    else if (r.perteA === 0 && D[def][att] !== null && D[def][att] >= 0.15) { verdict = '⚠ riposte nulle'; alertes.push(`${att}→${def} : le défenseur peut toucher mais n'inflige rien`); }
    else if (D[def][att] === null) verdict = 'riposte impossible (voulu)';
    console.log(
      LIBELLE[att].padEnd(22) + LIBELLE[def].padEnd(22) +
      String(r.perteD).padStart(4) + '/' + String(NOMINAL[def]).padEnd(4) +
      String(r.perteA).padStart(5) + '/' + String(NOMINAL[att]).padEnd(5) + '  ' + verdict
    );
  }
}

console.log('\n=== Le cas de référence de l\'ADR 0014 : 50 soldats contre 50 soldats ===\n');
for (const [nom, opts] of [['plaine', {}], ['forêt ×1.10', { terrain: 1.10 }], ['montagne ×1.20', { terrain: 1.20 }], ['tenaille ×1.20', { tenaille: 1.20 }]]) {
  const r = engagement('INF1', 'INF1', opts);
  console.log(`${nom.padEnd(16)} → le défenseur perd ${r.perteD}, l'attaquant perd ${r.perteA}` +
    `   (passes : ${r.journal.length})`);
}

console.log('\n=== L\'infanterie seule face au blindé lourd : le besoin d\'antichar ===\n');
for (const att of ['INF1', 'INF2']) {
  const r = engagement(att, 'BLI2');
  console.log(`${LIBELLE[att].padEnd(16)} → détruit ${r.perteD}/${NOMINAL.BLI2} chars lourds, perd ${r.perteA}/${NOMINAL[att]}`);
}
for (const def of ['INF1', 'INF2']) {
  const r = engagement('BLI2', def);
  console.log(`blindé MK2 attaque ${LIBELLE[def].padEnd(16)} → il perd ${r.perteD}/${NOMINAL[def]}, le char perd ${r.perteA}/${NOMINAL.BLI2}`);
}

console.log('\n=== Aviation contre force terrestre pure : le trou de la défense antiaérienne ===\n');
for (const def of ['INF1', 'INF2', 'BLI2']) {
  const r = engagement('BOM', def);
  console.log(`bombardier → ${LIBELLE[def].padEnd(20)} il perd ${r.perteD}/${NOMINAL[def]}, le bombardier perd ${r.perteA}/${NOMINAL.BOM}`);
}

console.log('\n=== Contrôle des garde-fous ===\n');
if (alertes.length === 0) console.log('Aucune alerte : pas de contre absolu, pas de riposte nulle non voulue.');
else alertes.forEach((a) => console.log('  ' + a));

const atteignables = R.flatMap((a) => R.filter((d) => D[a][d] !== null).map((d) => `${a}→${d}`));
console.log(`\n${atteignables.length} couples atteignables sur ${R.length * R.length} — ${R.length * R.length - atteignables.length} cases vides.`);
