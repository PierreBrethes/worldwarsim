/* Génère un état de partie de référence, destiné à peupler des maquettes.
   ------------------------------------------------------------------------
   On fait tourner une vraie saison, on la gèle à 31 h sur 48, et on exporte la
   vue du joueur France — brouillard appliqué. Les chiffres sont donc cohérents
   entre eux : ressources, débits, coûts, armées et progressions viennent tous de
   la même partie.

   node etat-reference.mjs
*/

import fs from 'fs';
import { simulerSaison, chargerMonde, brut, BASE, NATIONS, ROLES, UNITES, MATRICE } from './sim.mjs';

const monde = chargerMonde('world.json');
const DUREE_H = 48;

const base = {
  ...BASE,
  TRAJET_MIN_PAR_1000KM: 14,         // réglage retenu par le rapport
  CONSTRUCTION_BASE_MIN: 12,
  SEUIL: { domination: 0.62, hegemonie: 168, influence: 7 },
};

// On cherche le couple (graine, heure de gel) qui donne l'instantané le plus
// riche : la France présente, plusieurs mouvements en vol chez elle ET chez les
// autres. Un état de maquette vide ne sert à rien.
let r = null, cfg = null, GEL_H = 0, meilleur = -1;
for (let s = 0; s < 260; s++) {
  for (const gel of [16, 19, 22, 25, 28, 31, 34]) {
    const c = { ...base, DUREE_H: gel };
    const t = simulerSaison({ seed: s * 7919 + 13, n: 6, cfg: c, monde });
    const fr = t.joueurs.find(p => p.nation.n === 'France');
    if (!fr) continue;
    const advEnVol = t.joueurs.filter(p => p.id !== fr.id).reduce((a, p) => a + p.mouvements.length, 0);
    const progMax = Math.max(...t.progression);
    // La saison doit être EN COURS et disputée : personne au bout, un peloton de
    // tête, et au moins une barre encore anonyme pour montrer les trois états.
    if (progMax >= 0.9) continue;
    const anonymes = t.joueurs.filter(p => p.id !== fr.id && t.progression[p.id] < 0.25).length;
    const attribuees = t.joueurs.filter(p => p.id !== fr.id && t.progression[p.id] >= 0.25).length;
    if (!anonymes || !attribuees) continue;
    const score = Math.min(fr.mouvements.length, 3) * 4 + Math.min(advEnVol, 8)
                + Math.min(t.journal.combats, 8) * 0.5 + Math.min(fr.avantPostes.length, 5)
                + progMax * 6;
    if (fr.mouvements.length >= 2 && advEnVol >= 3 && score > meilleur) {
      meilleur = score; r = t; cfg = c; GEL_H = gel;
    }
  }
}
if (!r) throw new Error('aucun instantané satisfaisant');

const moi = r.joueurs.find(p => p.nation.n === 'France');
const tMin = GEL_H * 60;

/* ---------- outillage ---------- */
const rad = d => d * Math.PI / 180;
const distKm = (a, b) => {
  const dLat = rad(b[1] - a[1]);
  let dLon = Math.abs(b[0] - a[0]); if (dLon > 180) dLon = 360 - dLon;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(dLon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const r1 = v => Math.round(v);
const hhmm = min => `${String(Math.floor(min / 60)).padStart(2, '0')}h${String(r1(min % 60)).padStart(2, '0')}`;

const LABEL = {
  inf: 'Infanterie', bli: 'Blindé', trt: 'Transport terrestre', cha: 'Chasseur',
  bom: 'Bombardier', tra: 'Transport aérien', esc: 'Escorte', car: 'Cargo', pav: 'Porte-avions',
};
const ENCRE = {
  France: '#3f5a7d', 'Royaume-Uni': '#4a4f7a', 'États-Unis': '#4a7060', URSS: '#9d4638',
  Allemagne: '#6e6a5e', Japon: '#a44a5e', Italie: '#a86c4a', Chine: '#b07434',
};
const POUVOIR = {
  France: 'Projection outre-mer — avant-postes à n’importe quelle distance, coût croissant',
  'Royaume-Uni': 'Maîtrise des mers — voit tous les arcs maritimes, sans origine ni destination',
  'États-Unis': 'Arsenal — convertit ravitaillement en acier, un sens seulement',
  URSS: 'Profondeur stratégique — l’occupation ne réduit pas sa production',
  Allemagne: 'Guerre éclair — enchaîne deux mouvements sans cooldown de slot',
  Japon: 'Doctrine du porte-avions — réoriente un mouvement en vol, avant mi-parcours',
  Italie: 'Reconnaissance aérienne — voit la composition des piles qu’elle détecte',
  Chine: 'Masse — pas de plafond d’effectifs, mais entretien croissant',
};
const BAT = {
  qg: 'Quartier général', ind: 'Complexe industriel', log: 'Centre logistique',
  cons: 'Conscription', ecoute: 'Station d’écoute',
};

/* ---------- portée de détection ----------
   Le brouillard n'est pas modélisé par le simulateur : on l'applique ici, selon
   les règles de la fiche 04. Un mouvement adverse n'est visible que s'il passe
   dans le rayon d'un de mes détecteurs. */
const RAYON_TERRITOIRE = 1600 + 900 * (moi.bat.ecoute - 1);
const RAYON_AP = 1100;
const detecteurs = [
  { nom: 'Territoire national', ll: moi.ll, rayon: RAYON_TERRITOIRE },
  ...moi.avantPostes.map(a => ({ nom: `Avant-poste — ${a.hote}`, ll: a.ll, rayon: RAYON_AP })),
  ...moi.agents.map(a => ({ nom: `Agent dormant — ${a.hote}`, ll: a.ll, rayon: 1400 })),
];
const detecte = ll => detecteurs.some(d => distKm(d.ll, ll) <= d.rayon);

/* ---------- mes mouvements ---------- */
const TYPE = { attaque: 'Attaque', raid: 'Raid d’avant-poste', ap: 'Fondation d’avant-poste', agent: 'Agent dormant' };
const mesMouvements = moi.mouvements.map((m, i) => {
  const dest = m.type === 'attaque' || m.type === 'raid' ? r.joueurs[m.cible].nation.n : m.hote.n;
  const restant = Math.max(0, m.arrivee - tMin);
  return {
    id: `MVT-${String(i + 1).padStart(3, '0')}`,
    etat: 'mien',
    type: TYPE[m.type],
    origine: 'France',
    destination: dest,
    distanceKm: r1(m.km),
    minutesRestantes: r1(restant),
    arriveeDans: hhmm(restant),
    slotOccupe: true,
    pile: m.pile ? Object.fromEntries(ROLES.filter(x => m.pile[x] > 0).map(x => [LABEL[x], m.pile[x]])) : null,
    traverseAntimeridien: Math.abs(moi.ll[0] - (m.hote?.ll?.[0] ?? r.joueurs[m.cible]?.ll[0] ?? 0)) > 180,
  };
});

/* ---------- mouvements adverses, filtrés par le brouillard ---------- */
const adverses = [];
let nAdv = 0;
for (const p of r.joueurs) {
  if (p.id === moi.id) continue;
  for (const m of p.mouvements) {
    nAdv++;
    const cibleLL = m.hote?.ll ?? r.joueurs[m.cible]?.ll;
    if (!cibleLL) continue;
    const mi = [(p.ll[0] + cibleLL[0]) / 2, (p.ll[1] + cibleLL[1]) / 2];   // point courant approché
    const vu = detecte(mi) || detecte(cibleLL);
    if (!vu) continue;                       // invisible : il n'apparaît nulle part dans l'UI
    const frais = detecte(mi);
    adverses.push({
      id: `ARC-${String(adverses.length + 1).padStart(3, '0')}`,
      etat: frais ? 'adverse-detecte' : 'adverse-derniere-position-connue',
      nationSuspectee: frais ? p.nation.n : null,
      type: null,                            // JAMAIS révélé pour un mouvement adverse
      pile: null,                            // idem
      capDegres: r1((Math.atan2(cibleLL[0] - p.ll[0], cibleLL[1] - p.ll[1]) * 180 / Math.PI + 360) % 360),
      arriveeEstimeeDans: frais ? hhmm(Math.max(0, m.arrivee - tMin)) : null,
      vuIlYaMin: frais ? 0 : 44,
    });
  }
}

/* ---------- journal d'événements ---------- */
const journal = [
  { t: '−12 min', gravite: 'critique', texte: 'Avant-poste d’extraction désactivé par raid — Algérie', lien: 'rejeu:BAT-004' },
  { t: '−48 min', gravite: 'critique', texte: 'Embargo subi — production militaire plafonnée', restant: '2h51' },
  { t: '−1h20', gravite: 'notable', texte: 'Combat résolu à Tunisie — victoire, 4 blindés perdus', lien: 'rejeu:BAT-003' },
  { t: '−2h05', gravite: 'notable', texte: 'Mouvement immobilisé à la frontière — plage de repos de l’URSS', resolutionA: '06h00' },
  { t: '−3h40', gravite: 'routine', texte: 'Chantier terminé — Centre logistique niveau 3' },
  { t: '−4h15', gravite: 'routine', texte: 'Agent dormant en place — Turquie' },
];

/* ---------- adversaires ---------- */
const adversaires = r.joueurs.filter(p => p.id !== moi.id).map(p => {
  const prog = r.progression[p.id];
  const etat = prog >= 0.25 ? 'attribuee' : 'anonyme';
  return {
    nation: p.nation.n,
    encre: ENCRE[p.nation.n],
    pouvoir: POUVOIR[p.nation.n],
    barre: {
      etat,                                 // anonyme | attribuee | exposee
      progressionPourcent: r1(prog * 100),
      doctrine: etat === 'attribuee' ? p.doctrine : null,
    },
    plageRepos: `${String(p.reposDebut).padStart(2, '0')}h00 – ${String((p.reposDebut + 7) % 24).padStart(2, '0')}h00`,
    dernierRenseignement: detecte(p.ll) ? 'il y a 18 min' : 'jamais',
  };
});

/* ---------- rejeu de bataille ---------- */
const rejeu = {
  id: 'BAT-003',
  lieu: 'Tunisie',
  attaquant: { nation: 'France', capArriveeDegres: 148, capLibelle: 'depuis le nord-ouest, par la mer' },
  defenseur: { nation: 'Italie', bonusDefenseur: 1.15 },
  pilesAvant: {
    attaquant: { Blindé: 22, Bombardier: 14, Chasseur: 9 },
    defenseur: { Infanterie: 40, Escorte: 6, Chasseur: 4 },
  },
  passes: [
    { n: 1, pertesAttaquant: { Blindé: 3 }, pertesDefenseur: { Infanterie: 11, Chasseur: 1 } },
    { n: 2, pertesAttaquant: { Blindé: 1, Chasseur: 2 }, pertesDefenseur: { Infanterie: 13, Escorte: 2 } },
    { n: 3, pertesAttaquant: {}, pertesDefenseur: { Infanterie: 9, Escorte: 3, Chasseur: 3 } },
  ],
  pilesApres: {
    attaquant: { Blindé: 18, Bombardier: 14, Chasseur: 7 },
    defenseur: { Infanterie: 7, Escorte: 1, Chasseur: 0 },
  },
  issue: 'Victoire de l’attaquant — 82 % de la garnison détruite',
};

/* ---------- catalogue de production ----------
   Coûts réels, et pour chaque rôle les deux meilleures cibles et les deux pires.
   Le joueur ne doit JAMAIS voir la matrice 9×9 entière : deux listes courtes. */
const catalogue = ROLES.map(rr => {
  const ligne = Object.entries(MATRICE[rr]).filter(([, v]) => v !== null && v > 0);
  const colonne = ROLES.map(ra => [ra, MATRICE[ra][rr]]).filter(([, v]) => v !== null && v > 0);
  return {
    cle: rr, nom: LABEL[rr], domaine: ['inf','bli','trt'].includes(rr) ? 'Terre' : ['cha','bom','tra'].includes(rr) ? 'Air' : 'Mer',
    coutAcier: UNITES[rr].A, coutEffectifs: UNITES[rr].E,
    palier2: ['inf','bli','pav'].includes(rr),
    fortContre: ligne.sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => LABEL[k]),
    vulnerableA: colonne.sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => LABEL[k]),
  };
});

/* ---------- espionnage ----------
   La France joue Hégémonie dans cet instantané : elle n'a pas d'agent. On ajoute
   des sondes pour que l'écran d'espionnage ait de quoi être maquetté. Synthétisé. */
const espionnage = {
  _synthetise: true,
  sondes: [
    { cible: 'États-Unis', resteMin: 47, mouvementsReveles: 2 },
    { cible: 'URSS', resteMin: 0, mouvementsReveles: 0, etat: 'expiree' },
  ],
  leurresEnVol: 1,
  zonesAveugles: ['Atlantique nord', 'Pacifique', 'Asie orientale'],
  couverturePourcent: nAdv ? r1(adverses.length / nAdv * 100) : 0,
};

/* ---------- pays neutres ---------- */
const neutres = [...new Set(moi.avantPostes.map(a => a.hote))].map(nom => ({
  pays: nom,
  relationAvecMoi: 62,
  capaciteEchangeRestantePourcent: 45,
  avantPostesPresents: [{ proprietaire: 'France', specialisation: 'Extraction' }],
  agentsPresents: 0,
}));

/* ---------- assemblage ---------- */
const etat = {
  _note: 'État de référence pour maquettes. Vue du joueur France, brouillard appliqué. ' +
         'Généré par etat-reference.mjs à partir d’une saison réellement simulée.',
  saison: {
    numero: 1, dureeHeures: DUREE_H, ecouleHeures: GEL_H, restantHeures: DUREE_H - GEL_H,
    joueurs: 6, regionJouable: 'Europe + Méditerranée + Moyen-Orient',
    trajetMinPar1000km: 14,
  },
  moi: {
    nation: 'France',
    encre: ENCRE.France,
    pouvoir: POUVOIR.France,
    doctrine: moi.doctrine,
    doctrineRevelee: r.progression[moi.id] >= 0.25,
    progressionPourcent: r1(r.progression[moi.id] * 100),
    plageRepos: `${String(moi.reposDebut).padStart(2, '0')}h00 – ${String((moi.reposDebut + 7) % 24).padStart(2, '0')}h00`,
    ressources: {
      ravitaillement: { stock: r1(moi.R), debitParHeure: r1(cfg.RAVITO_BASE_H * (1 + 0.16 * (moi.bat.qg - 1))) },
      acier: { stock: r1(moi.A), debitParHeure: r1(moi.avantPostes.reduce((s, a) => s + cfg.ACIER_PAR_EXTRACTION_H * a.part, 0)) },
      effectifs: {
        stock: r1(moi.E),
        plafond: r1(cfg.EFFECTIFS_PLAFOND * (1 + 0.42 * (moi.bat.cons - 1))),
        debitParHeure: r1(cfg.EFFECTIFS_BASE_H * (1 + 0.34 * (moi.bat.cons - 1))),
        note: 'ni achetables ni convertibles',
      },
    },
    slots: { total: 1 + moi.bat.log, utilises: moi.mouvements.length },
    batiments: Object.entries(moi.bat).map(([k, niv]) => ({
      cle: k, nom: BAT[k], niveau: niv,
      coutNiveauSuivant: r1(cfg.COUT_BASE[k] * cfg.COUT_FACTEUR ** niv),
      dureeNiveauSuivantMin: r1(cfg.CONSTRUCTION_BASE_MIN * cfg.CONSTRUCTION_FACTEUR ** niv),
      plafonneParQG: k !== 'qg' && niv >= moi.bat.qg,
    })),
    chantier: moi.chantier
      ? { nom: BAT[moi.chantier.bat], resteMin: r1(Math.max(0, moi.chantier.finMin - tMin)) }
      : null,
    armee: {
      presente: Object.fromEntries(ROLES.filter(x => moi.armee[x] > 0).map(x => [LABEL[x], Math.floor(moi.armee[x])])),
      enTransit: Object.fromEntries(
        ROLES.map(x => [LABEL[x], moi.mouvements.reduce((s, m) => s + (m.pile?.[x] || 0), 0)])
          .filter(([, v]) => v > 0)),
    },
    avantPostes: moi.avantPostes.map((a, i) => ({
      id: `AP-${String(i + 1).padStart(2, '0')}`,
      paysHote: a.hote, specialisation: 'Extraction',
      rendementRelatif: +a.part.toFixed(2), garnison: a.garnison,
      immunitePostRaidMin: i === 0 ? 26 : 0,
    })),
    agents: moi.agents.map(a => ({ paysHote: a.hote, aligne: !!a.aligne, progresMin: r1(a.progres) })),
  },
  mouvements: { miens: mesMouvements, adversesVisibles: adverses },
  brouillard: {
    detecteurs: detecteurs.map(d => ({ nom: d.nom, rayonKm: d.rayon })),
    mouvementsAdversesTotal: nAdv,
    mouvementsAdversesVisibles: adverses.length,
    couverturePourcent: nAdv ? r1(adverses.length / nAdv * 100) : 0,
  },
  journal,
  adversaires,
  catalogueProduction: catalogue,
  espionnage,
  paysNeutres: neutres,
  rejeu,
};

fs.writeFileSync('etat-reference.json', JSON.stringify(etat, null, 2));
console.log(`etat-reference.json ecrit — gel a ${GEL_H}h sur ${DUREE_H}`);
console.log(`  joueur : ${etat.moi.nation} / ${etat.moi.doctrine} — ${etat.moi.progressionPourcent}%`);
console.log(`  slots : ${etat.moi.slots.utilises}/${etat.moi.slots.total} · mes mouvements : ${mesMouvements.length}`);
console.log(`  brouillard : ${adverses.length}/${nAdv} mouvements adverses visibles (${etat.brouillard.couverturePourcent}%)`);
console.log(`  avant-postes : ${etat.moi.avantPostes.length} · agents : ${etat.moi.agents.length}`);
