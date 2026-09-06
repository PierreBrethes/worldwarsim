/* WorldWarSim — simulateur de saison
   ------------------------------------------------------------------
   Objectif : répondre à la question bloquante n°1 de QUESTIONS.md — le ratio
   temps de trajet ÷ temps de construction — et vérifier qu'aucune doctrine ni
   aucun couple nation × doctrine n'écrase les autres.

   Ce n'est PAS un prototype de jeu. C'est un instrument de mesure : des joueurs
   virtuels suivent des politiques fixes, on fait tourner 48 h, on compte.
*/

import fs from 'fs';

/* ================= 1. Constantes ================= */

export const BASE = {
  DUREE_H: 48,
  PAS_MIN: 1,

  // --- le paramètre qui nous intéresse ---
  TRAJET_MIN_PAR_1000KM: 8,   // 8 min pour 1000 km -> Paris-Berlin ~7 min, Paris-Tokyo ~78 min
  CONSTRUCTION_BASE_MIN: 20,  // durée du niveau 1 ; ×1.8 par niveau
  CONSTRUCTION_FACTEUR: 1.8,

  // --- économie ---
  RAVITO_BASE_H: 520,
  ACIER_PAR_EXTRACTION_H: 90,
  EFFECTIFS_BASE_H: 14,
  EFFECTIFS_PLAFOND: 130,

  COUT_BASE: { qg: 800, ind: 620, log: 580, cons: 520, ecoute: 480 },
  COUT_FACTEUR: 1.95,
  NIVEAU_MAX: 6,

  COUT_AVANT_POSTE: { R: 620, E: 10 },
  COUT_AGENT_R: 380,
  COUT_EMBARGO_R: 900, EMBARGO_MIN: 240,     // Hégémonie étrangle la production adverse
  COUT_EXPOSITION_R: 700, EXPOSITION_MIN: 150, // Influence gèle la progression adverse
  ACTIONS_PAR_SESSION: 8,
  RENDEMENT_DECROISSANT: 0.62,   // n-ième avant-poste chez le même hôte

  // --- rythme de jeu ---
  SESSIONS_PAR_JOUR: 9,
  REPOS_H: 7,

  // --- victoire (mise à l'échelle du nombre de joueurs) ---
  // Seuils de victoire, calibrés sur les scores bruts mesurés (voir run.mjs).
  // Infinity = personne ne gagne, ce qui est le mode calibration.
  SEUIL: { domination: Infinity, hegemonie: Infinity, influence: Infinity },
  ALIGNEMENT_MIN: 55,            // minutes d'agent pour aligner un PNJ
};

/* ================= 2. Unités et matrice ================= */

export const ROLES = ['inf', 'bli', 'trt', 'cha', 'bom', 'tra', 'esc', 'car', 'pav'];

// ligne = attaquant, colonne = défenseur, null = ne peut pas atteindre
export const MATRICE = {
  inf: { inf: 1.0, bli: 0.5, trt: 1.5, cha: 0.3, bom: 0.3, tra: 0.4, esc: null, car: null, pav: null },
  bli: { inf: 1.8, bli: 1.0, trt: 2.0, cha: null, bom: null, tra: 0.2, esc: null, car: null, pav: null },
  trt: { inf: 0.2, bli: 0.1, trt: 0.3, cha: null, bom: null, tra: null, esc: null, car: null, pav: null },
  cha: { inf: 0.6, bli: 0.3, trt: 1.2, cha: 1.0, bom: 1.9, tra: 2.2, esc: 0.4, car: 0.8, pav: 0.5 },
  bom: { inf: 1.2, bli: 1.8, trt: 1.6, cha: 0.2, bom: 0.5, tra: 0.6, esc: 1.7, car: 1.5, pav: 2.0 },
  tra: { inf: null, bli: null, trt: null, cha: null, bom: null, tra: null, esc: null, car: null, pav: null },
  esc: { inf: 0.3, bli: 0.2, trt: 0.4, cha: 0.5, bom: 0.5, tra: 0.5, esc: 1.0, car: 1.9, pav: 1.4 },
  car: { inf: null, bli: null, trt: null, cha: null, bom: null, tra: null, esc: 0.1, car: 0.2, pav: 0.1 },
  pav: { inf: 0.4, bli: 0.2, trt: 0.8, cha: 1.5, bom: 1.2, tra: 1.4, esc: 0.9, car: 1.1, pav: 0.8 },
};

// coût en acier + effectifs, et « valeur » servant à mesurer la capacité militaire
export const UNITES = {
  inf: { A: 18,  E: 6, pv: 10, val: 1.0 },
  bli: { A: 95,  E: 3, pv: 26, val: 3.4 },
  trt: { A: 40,  E: 2, pv: 12, val: 0.6, transport: 8 },
  cha: { A: 110, E: 2, pv: 16, val: 3.2 },
  bom: { A: 160, E: 3, pv: 20, val: 4.4 },
  tra: { A: 90,  E: 2, pv: 14, val: 0.6, transport: 14 },
  esc: { A: 175, E: 5, pv: 34, val: 4.6 },
  car: { A: 120, E: 3, pv: 22, val: 0.8, transport: 22 },
  pav: { A: 430, E: 9, pv: 62, val: 9.0 },
};

/* ================= 3. Nations ================= */
// Chaque nation modifie UNE ligne ou UNE colonne, jamais la matrice entière.

export const NATIONS = [
  { n: 'Allemagne',    pays: 'Germany',                  ligne: 'bli', mult: 1.25 },
  { n: 'Royaume-Uni',  pays: 'United Kingdom',           colDef: 'cha', mult: 1.30 },
  { n: 'États-Unis',   pays: 'United States of America', ligne: 'bom', mult: 1.25 },
  { n: 'URSS',         pays: 'Russia',                   colDef: 'inf', mult: 1.30 },
  { n: 'Japon',        pays: 'Japan',                    ligne: 'pav', mult: 1.30 },
  { n: 'France',       pays: 'France',                   projection: true },
  // Italie : *Reconnaissance aérienne* (fiche 06) touche au brouillard, que ce
  // simulateur ne modélise pas. Aucun effet ici — son taux de victoire mesuré est
  // donc celui d'une nation sans pouvoir.
  { n: 'Italie',       pays: 'Italy',                    recon: true },
  { n: 'Chine',        pays: 'China',                    masse: true },
];

/* ================= 4. Géographie ================= */

const R_TERRE = 6371;
const rad = d => d * Math.PI / 180;
function distanceKm(a, b) {
  // la longitude s'enroule : on prend toujours le plus court des deux sens
  const dLat = rad(b[1] - a[1]);
  let dLon = Math.abs(b[0] - a[0]); if (dLon > 180) dLon = 360 - dLon;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(dLon) / 2) ** 2;
  return 2 * R_TERRE * Math.asin(Math.sqrt(h));
}

export function chargerMonde(chemin) {
  const w = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  const parNom = {};
  for (const c of w.countries) parNom[c.n] = c.ll;
  return { parNom, tous: w.countries.map(c => ({ n: c.n, ll: c.ll })) };
}

/* ================= 5. Aléa reproductible ================= */

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* ================= 6. Joueur ================= */

function nouveauJoueur(id, nation, doctrine, ll, cfg, alea) {
  return {
    id, nation, doctrine, ll,
    R: 1200, A: 400, E: 60,
    bat: { qg: 1, ind: 1, log: 1, cons: 1, ecoute: 1 },
    chantier: null,                       // { bat, finMin }
    armee: Object.fromEntries(ROLES.map(r => [r, 0])),
    avantPostes: [],                      // { type, hote, part, actifDepuis }
    agents: [],                           // { hote, progres }
    pnjAlignes: 0,
    apHeures: 0,
    degatsInfliges: {},                   // idCible -> fraction cumulée détruite
    mouvements: [],
    slotsUtilises: 0,
    embargoJusqu: 0,      // production militaire plafonnée (outil d'Hégémonie)
    geleJusqu: 0,         // progression figée (outil d'Influence)
    decisions: 0,
    combats: 0,
    // la plage de repos est publique et décalée d'un joueur à l'autre
    reposDebut: Math.floor(alea() * 24),
    progressionHisto: [],
    vivant: true,
  };
}

const coutBat = (cfg, b, niv) => cfg.COUT_BASE[b] * cfg.COUT_FACTEUR ** (niv - 1);
const dureeBat = (cfg, niv) => cfg.CONSTRUCTION_BASE_MIN * cfg.CONSTRUCTION_FACTEUR ** (niv - 1);
const slots = p => 1 + p.bat.log;
const capaciteMilitaire = p => ROLES.reduce((s, r) => s + p.armee[r] * UNITES[r].val, 0);

function enRepos(p, tMin) {
  const h = (tMin / 60) % 24;
  const d = p.reposDebut;
  const f = (d + BASE.REPOS_H) % 24;
  return d < f ? (h >= d && h < f) : (h >= d || h < f);
}

/* ================= 7. Priorités par doctrine ================= */

const PRIORITES = {
  domination: ['ind', 'log', 'cons', 'qg', 'ecoute'],
  hegemonie:  ['qg', 'log', 'cons', 'ind', 'ecoute'],
  influence:  ['ecoute', 'qg', 'log', 'cons', 'ind'],
};

const MELANGE = {
  domination: { bom: 0.30, bli: 0.28, cha: 0.24, inf: 0.18 },
  hegemonie:  { inf: 0.45, bli: 0.20, cha: 0.20, esc: 0.15 },
  influence:  { inf: 0.35, cha: 0.30, esc: 0.20, tra: 0.15 },
};

/* ================= 8. Combat ================= */

function mult(att, def, attRole, defRole) {
  let v = MATRICE[attRole][defRole];
  if (v === null) return 0;
  if (att.nation.ligne === attRole) v *= att.nation.mult;
  if (def.nation.colDef === defRole) v /= def.nation.mult;   // colonne = défense
  return v;
}

// Résolution simultanée : les deux camps tirent avec leur puissance d'avant-passe.
function resoudreCombat(att, def, pileAtt, pileDef, capArrivee = 1, bonusDef = 1.15) {
  const A = { ...pileAtt }, D = { ...pileDef };
  const pv = pile => ROLES.reduce((s, r) => s + pile[r] * UNITES[r].pv, 0);
  const pv0A = pv(A), pv0D = pv(D);

  for (let passe = 0; passe < 4; passe++) {
    const feu = (src, cible, srcJ, cibJ, gain) => {
      const total = ROLES.reduce((s, r) => s + cible[r], 0);
      if (!total) return {};
      const degats = {};
      for (const ra of ROLES) {
        if (!src[ra]) continue;
        for (const rd of ROLES) {
          if (!cible[rd]) continue;
          const part = cible[rd] / total;
          const m = mult(srcJ, cibJ, ra, rd);
          degats[rd] = (degats[rd] || 0) + src[ra] * m * part * gain * 2.6;
        }
      }
      return degats;
    };
    const dA = feu(A, D, att, def, capArrivee);
    const dD = feu(D, A, def, att, bonusDef);
    for (const r of ROLES) {
      if (dA[r]) D[r] = Math.max(0, D[r] - dA[r] / UNITES[r].pv);
      if (dD[r]) A[r] = Math.max(0, A[r] - dD[r] / UNITES[r].pv);
    }
    if (!pv(A) || !pv(D)) break;
  }
  for (const r of ROLES) { A[r] = Math.floor(A[r]); D[r] = Math.floor(D[r]); }
  return {
    resteAtt: A, resteDef: D,
    fractionDefDetruite: pv0D ? 1 - pv(D) / pv0D : 0,
    fractionAttDetruite: pv0A ? 1 - pv(A) / pv0A : 0,
  };
}

/* ================= 9. Progression ================= */

// Score BRUT, indépendant de tout seuil. C'est lui qu'on mesure d'abord, pour
// calibrer ensuite les seuils de victoire sur des données plutôt qu'à l'intuition.
export function brut(p, n) {
  if (p.doctrine === 'domination') {
    const K = Math.ceil((n - 1) / 2);
    const parts = Object.values(p.degatsInfliges).sort((a, b) => b - a).slice(0, K);
    while (parts.length < K) parts.push(0);
    return parts.reduce((s, v) => s + v, 0) / K;
  }
  if (p.doctrine === 'hegemonie') return p.apHeures;
  return p.pnjAlignes;
}

function progression(p, cfg, n) {
  const v = brut(p, n);
  if (p.doctrine === 'domination') return Math.min(1, v / cfg.SEUIL.domination);
  if (p.doctrine === 'hegemonie') return Math.min(1, v / cfg.SEUIL.hegemonie);
  return Math.min(1, v / cfg.SEUIL.influence);
}

/* ================= 10. Décisions ================= */

function agir(p, monde, joueurs, cfg, tMin, alea, journal) {
  // Une session = plusieurs décisions, jusqu'à ce que plus rien ne soit finançable.
  for (let k = 0; k < cfg.ACTIONS_PAR_SESSION; k++) {
    if (!uneAction(p, monde, joueurs, cfg, tMin, alea, journal)) break;
  }
}

// L'acier ne vient QUE des avant-postes d'extraction : toutes les doctrines
// doivent en poser, sinon elles ne produisent aucune unité. Seul le seuil diffère.
const CIBLE_EXTRACTION = { domination: 4, hegemonie: 9, influence: 3 };

function uneAction(p, monde, joueurs, cfg, tMin, alea, journal) {
  const libres = slots(p) - p.slotsUtilises;

  // 1 — chantier
  if (!p.chantier) {
    for (const b of PRIORITES[p.doctrine]) {
      const niv = p.bat[b];
      if (niv >= cfg.NIVEAU_MAX) continue;
      if (b !== 'qg' && niv >= p.bat.qg) continue;
      const c = coutBat(cfg, b, niv + 1);
      if (p.R >= c) {
        p.R -= c; p.chantier = { bat: b, finMin: tMin + dureeBat(cfg, niv + 1) };
        p.decisions++; return true;
      }
    }
  }

  // 2 — fonder un avant-poste d'extraction (le convoi voyage, donc occupe un slot)
  const nbExtraction = p.avantPostes.length + p.mouvements.filter(m => m.type === 'ap').length;
  if (libres > 0 && nbExtraction < CIBLE_EXTRACTION[p.doctrine]) {
    const hote = choisirHote(p, monde, alea);
    if (hote) {
      const km = distanceKm(p.ll, hote.ll);
      const cout = cfg.COUT_AVANT_POSTE.R * (p.nation.projection ? 1 + km / 20000 : 1);
      if (p.R >= cout && p.E >= cfg.COUT_AVANT_POSTE.E) {
        p.R -= cout; p.E -= cfg.COUT_AVANT_POSTE.E;
        p.mouvements.push({ type: 'ap', hote, km, arrivee: tMin + tempsTrajet(km, p, cfg) });
        p.slotsUtilises++; p.decisions++; journal.envois++; return true;
      }
    }
  }

  // 3 — produire des unités
  if (p.A > 260 && tMin >= p.embargoJusqu) {
    const budget = p.A * 0.6; let depense = 0;
    for (const [r, part] of Object.entries(MELANGE[p.doctrine])) {
      const u = UNITES[r];
      let nb = Math.min(Math.floor(budget * part / u.A), Math.floor(p.E / u.E));
      if (nb > 0) {
        nb = Math.floor(nb * (1 + 0.10 * (p.bat.ind - 1)));
        p.armee[r] += nb; depense += nb * u.A; p.E -= nb * u.E;
      }
    }
    if (depense > 0) { p.A -= depense; p.decisions++; return true; }
  }

  // 4 — action de doctrine
  if (p.doctrine === 'influence' && libres > 0 && p.R >= cfg.COUT_AGENT_R) {
    const hote = choisirHote(p, monde, alea);
    if (hote) {
      const km = distanceKm(p.ll, hote.ll);
      p.R -= cfg.COUT_AGENT_R;
      p.mouvements.push({ type: 'agent', hote, km, arrivee: tMin + tempsTrajet(km, p, cfg) });
      p.slotsUtilises++; p.decisions++; journal.envois++; return true;
    }
  }

  if (p.doctrine === 'domination' && libres > 0) {
    const cibles = joueurs.filter(q => q.id !== p.id && q.vivant);
    if (cibles.length) {
      cibles.sort((a, b) =>
        (p.degatsInfliges[b.id] || 0) - (p.degatsInfliges[a.id] || 0) ||
        capaciteMilitaire(a) - capaciteMilitaire(b));
      // Cible prioritaire : un avant-poste adverse mal gardé. C'est l'arête
      // « Domination bat Hégémonie » — sans elle, l'hégémon n'a aucun contre.
      const proies = [];
      for (const q of cibles) for (const a of q.avantPostes)
        proies.push({ q, a, km: distanceKm(p.ll, a.ll) });
      proies.sort((x, y) => x.a.garnison - y.a.garnison || x.km - y.km);
      if (!cfg.SANS_RAID && proies.length && capaciteMilitaire(p) > 18) {
        const { q, a, km } = proies[0];
        const pile = {};
        for (const r of ROLES) { pile[r] = Math.floor(p.armee[r] * 0.35); p.armee[r] -= pile[r]; }
        p.mouvements.push({ type: 'raid', cible: q.id, hoteAP: a, pile, km,
                            arrivee: tMin + tempsTrajet(km, p, cfg) });
        p.slotsUtilises++; p.decisions++; journal.envois++; return true;
      }

      const cible = cibles[0];
      const ma = capaciteMilitaire(p);
      if (ma > capaciteMilitaire(cible) * 0.8 && ma > 25) {
        const pile = {};
        for (const r of ROLES) { pile[r] = Math.floor(p.armee[r] * 0.75); p.armee[r] -= pile[r]; }
        const km = distanceKm(p.ll, cible.ll);
        p.mouvements.push({ type: 'attaque', cible: cible.id, pile, km,
                            arrivee: tMin + tempsTrajet(km, p, cfg) });
        p.slotsUtilises++; p.decisions++; journal.envois++; return true;
      }
    }
  }

  // 4bis — outils de soustraction : c'est ce qui rend le triangle mécanique
  //         plutôt que déclaratif (fiche 05 §5.2).
  const leader = () => joueurs.filter(q => q.id !== p.id && q.vivant)
    .sort((a, b) => brut(b, joueurs.length) - brut(a, joueurs.length))[0];

  if (p.doctrine === 'hegemonie' && p.R >= cfg.COUT_EMBARGO_R) {
    const c = leader();
    if (c && tMin >= c.embargoJusqu) {
      p.R -= cfg.COUT_EMBARGO_R; c.embargoJusqu = tMin + cfg.EMBARGO_MIN;
      p.decisions++; return true;
    }
  }
  if (p.doctrine === 'influence' && p.R >= cfg.COUT_EXPOSITION_R && p.pnjAlignes >= 2) {
    const c = leader();
    if (c && tMin >= c.geleJusqu) {
      p.R -= cfg.COUT_EXPOSITION_R; c.geleJusqu = tMin + cfg.EXPOSITION_MIN;
      p.decisions++; return true;
    }
  }

  // 5 — l'Hégémonie garnit ses avant-postes avec ce qu'elle a
  if (p.doctrine === 'hegemonie' && p.armee.inf >= 10) {
    const ap = p.avantPostes.find(a => a.garnison < 20);
    if (ap) { const n = Math.min(10, p.armee.inf); ap.garnison += n; p.armee.inf -= n; p.decisions++; return true; }
  }

  return false;
}

const tempsTrajet = (km, p, cfg) =>
  km / 1000 * cfg.TRAJET_MIN_PAR_1000KM * (1 - 0.07 * (p.bat.log - 1));

function choisirHote(p, monde, alea) {
  const pris = new Set([...p.avantPostes.map(a => a.hote), ...p.agents.map(a => a.hote)]);
  const candidats = monde.tous.filter(c => !pris.has(c.n));
  if (!candidats.length) return null;
  // La France ignore l'adjacence : elle pioche n'importe où. Les autres restent proches.
  if (p.nation.projection) return candidats[Math.floor(alea() * candidats.length)];
  candidats.sort((a, b) => distanceKm(p.ll, a.ll) - distanceKm(p.ll, b.ll));
  return candidats[Math.floor(alea() * Math.min(12, candidats.length))];
}

/* ================= 11. Moteur ================= */

export function simulerSaison({ seed, n = 6, cfg = BASE, monde }) {
  const alea = rng(seed);
  const doctrines = ['domination', 'hegemonie', 'influence'];
  const natsDispo = [...NATIONS];
  const joueurs = [];
  for (let i = 0; i < n; i++) {
    const nat = natsDispo.splice(Math.floor(alea() * natsDispo.length), 1)[0];
    const doc = doctrines[i % 3];
    joueurs.push(Object.assign(
      nouveauJoueur(i, nat, doc, monde.parNom[nat.pays], cfg, alea), { nation: nat }));
  }

  const total = cfg.DUREE_H * 60;
  const journal = { envois: 0, combats: 0, raidsReussis: 0, finPrematuree: null };
  let divergence = null, meneurPrecedent = null;

  for (let t = 0; t < total; t += cfg.PAS_MIN) {
    const dt = cfg.PAS_MIN / 60;

    for (const p of joueurs) {
      if (!p.vivant) continue;

      // --- accumulation paresseuse (ici : par pas, même résultat) ---
      p.R += cfg.RAVITO_BASE_H * (1 + 0.16 * (p.bat.qg - 1)) * dt;
      const gele = t < p.geleJusqu;
      for (const a of p.avantPostes) if (a.type === 'extraction') {
        p.A += cfg.ACIER_PAR_EXTRACTION_H * a.part * dt;
        if (!gele) p.apHeures += dt;    // l'exposition fige la progression, pas l'économie
      }
      const plafond = p.nation.masse ? Infinity : cfg.EFFECTIFS_PLAFOND * (1 + 0.42 * (p.bat.cons - 1));
      p.E = Math.min(plafond, p.E + cfg.EFFECTIFS_BASE_H * (1 + 0.34 * (p.bat.cons - 1)) * dt);
      if (p.nation.masse) p.R -= 0.9 * ROLES.reduce((s, r) => s + p.armee[r], 0) * dt;  // entretien

      // --- chantier ---
      if (p.chantier && t >= p.chantier.finMin) { p.bat[p.chantier.bat]++; p.chantier = null; }

      // --- agents ---
      for (const a of p.agents) {
        if (!gele) a.progres += cfg.PAS_MIN;
        if (a.progres >= cfg.ALIGNEMENT_MIN && !a.aligne) { a.aligne = true; p.pnjAlignes++; }
      }

      // --- session de jeu ---
      if (!enRepos(p, t) && t % Math.round(24 * 60 / cfg.SESSIONS_PAR_JOUR) < cfg.PAS_MIN) {
        agir(p, monde, joueurs, cfg, t, alea, journal);
      }
    }

    // --- arrivées : tout mouvement libère son slot ---
    for (const p of joueurs) {
      for (let i = p.mouvements.length - 1; i >= 0; i--) {
        const m = p.mouvements[i];
        if (t < m.arrivee) continue;

        if (m.type === 'ap') {
          const deja = p.avantPostes.filter(a => a.hote === m.hote.n).length;
          p.avantPostes.push({
            type: 'extraction', hote: m.hote.n, ll: m.hote.ll,
            part: cfg.RENDEMENT_DECROISSANT ** deja, garnison: 0,
          });
        } else if (m.type === 'agent') {
          p.agents.push({ hote: m.hote.n, ll: m.hote.ll, progres: 0 });
        } else if (m.type === 'raid') {
          const cible = joueurs[m.cible];
          const idx = cible.avantPostes.indexOf(m.hoteAP);
          if (idx >= 0 && !enRepos(cible, t)) {
            const garn = Object.fromEntries(ROLES.map(r => [r, 0]));
            garn.inf = m.hoteAP.garnison;
            const res = resoudreCombat(p, cible, m.pile, garn, 1, 1.25);
            const reste = ROLES.reduce((s2, r) => s2 + res.resteDef[r], 0);
            if (reste === 0) { cible.avantPostes.splice(idx, 1); journal.raidsReussis++; }
            else m.hoteAP.garnison = res.resteDef.inf;
            for (const r of ROLES) p.armee[r] += res.resteAtt[r];
            p.degatsInfliges[cible.id] = (p.degatsInfliges[cible.id] || 0) +
              0.12 * (1 - (p.degatsInfliges[cible.id] || 0));
            p.combats++; cible.combats++; journal.combats++;
          } else {
            for (const r of ROLES) p.armee[r] += m.pile[r];
          }
        } else {
          const cible = joueurs[m.cible];
          // La plage de repos décale l'arrivée : le convoi attend à la frontière.
          if (enRepos(cible, t)) { m.arrivee = t + cfg.PAS_MIN; continue; }
          const res = resoudreCombat(p, cible, m.pile, cible.armee, 1, 1.15);
          cible.armee = res.resteDef;
          for (const r of ROLES) p.armee[r] += res.resteAtt[r];
          p.degatsInfliges[cible.id] = (p.degatsInfliges[cible.id] || 0) +
            res.fractionDefDetruite * (1 - (p.degatsInfliges[cible.id] || 0));
          p.combats++; cible.combats++; journal.combats++;
        }
        p.mouvements.splice(i, 1); p.slotsUtilises--;
      }
    }

    // --- progression et divergence ---
    if (t % 30 === 0) {
      const prog = joueurs.map(p => progression(p, cfg, n));
      joueurs.forEach((p, i) => p.progressionHisto.push(prog[i]));
      const meneur = prog.indexOf(Math.max(...prog));
      if (meneur !== meneurPrecedent) { divergence = t; meneurPrecedent = meneur; }
      if (Math.max(...prog) >= 1 && journal.finPrematuree === null) { journal.finPrematuree = t; break; }
    }
  }

  const prog = joueurs.map(p => progression(p, cfg, n));
  const gagnant = prog.indexOf(Math.max(...prog));
  return {
    gagnant: joueurs[gagnant],
    progression: prog,
    joueurs, journal,
    divergenceMin: divergence,
    dureeReelleMin: journal.finPrematuree ?? total,
  };
}
