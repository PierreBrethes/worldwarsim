#!/usr/bin/env node
// Vérifie un GLB livré par Claude Design contre son prompt (WWS/prototypes/glb/prompts/).
//   node verifier-glb.mjs <fichier.glb> <modèle> [--nation france|uk|usa|ussr|germany|japan|italy|china]
//   node verifier-glb.mjs --coherence     (chaque nom attendu ci-dessous figure dans son prompt)
// Sortie : une ligne par contrôle (ok / ÉCHEC / à voir) ; code 1 si un ÉCHEC.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIONS = ['france', 'uk', 'usa', 'ussr', 'germany', 'japan', 'italy', 'china'];
const per = (values) => Object.fromEntries(NATIONS.map((n, k) => [n, values[k]]));
const AMARRES = ['avant_babord', 'avant_tribord', 'arriere_babord', 'arriere_tribord'].map((s) => `fx_amarre_${s}`);
const FLAG = { names: ['hampe', 'drapeau', 'fx_tete_hampe'], pivots: { hampe: 'pied', drapeau: 'coin-haut' } };
const MAN = ['body', 'head', 'arm_left', 'forearm_left', 'arm_right', 'forearm_right', 'leg_left', 'shin_left', 'leg_right', 'shin_right'];
const MAN_PIVOTS = { head: 'bas', arm_left: 'haut', arm_right: 'haut', forearm_left: 'haut', forearm_right: 'haut', leg_left: 'haut', leg_right: 'haut', shin_left: 'haut', shin_right: 'haut' };
const TRACKED = ['hull', 'turret', 'gun', 'hatch', 'tracks_left', 'tracks_right', 'wheels_left', 'wheels_right', 'barbotin_left', 'barbotin_right', 'roue_folle_left', 'roue_folle_right', 'galet_left_*|galets_left', 'galet_right_*|galets_right', 'fx_muzzle', 'fx_smoke', 'fx_poussiere'];
const TRACKED_PIVOTS = { turret: 'axe-y', gun: 'tourillons', barbotin_left: 'centre', barbotin_right: 'centre', roue_folle_left: 'centre', roue_folle_right: 'centre', 'galet_left_*': 'centre', 'galet_right_*': 'centre' };
const PLANE = ['fuselage', 'gear_left', 'gear_right', 'wheel_left', 'wheel_right', 'tailwheel', 'fx_smoke'];
const PLANE_PIVOTS = { 'prop*': 'moyeu', gear_left: 'haut', gear_right: 'haut', wheel_left: 'centre', wheel_right: 'centre' };

// measure : [nœud ou null pour tout le modèle, axe 'x' | 'y' | 'z', mètres (ou valeurs par nation), tolérance]
const EXPECT = {
  barracks: {
    measure: ['murs', 'x', 50, 0.04], triangles: 3500, materials: ['vitres'],
    names: ['murs', 'porte_gauche', 'porte_droite', 'fond_sombre', 'remise_murs', 'remise_toit', 'remise_porte_gauche', 'remise_porte_droite', 'remise_fond_sombre', 'fx_entree', 'fx_sortie', 'fx_entree_remise', 'fx_sortie_remise', 'fx_smoke', ...FLAG.names],
    pivots: { porte_gauche: 'gond', porte_droite: 'gond', remise_porte_gauche: 'gond', remise_porte_droite: 'gond', ...FLAG.pivots },
    absent: ['porte'],
  },
  airfield: {
    measure: [null, 'x', 50, 0.05], triangles: 3500, materials: ['vitres'],
    names: ['rail_porte', 'porte_gauche_1', 'porte_gauche_2', 'porte_droite_1', 'porte_droite_2', 'fond_sombre', 'fx_entree', 'fx_sortie', ...FLAG.names],
    pivots: { porte_gauche_1: 'bout-haut', porte_gauche_2: 'bout-haut', porte_droite_1: 'bout-haut', porte_droite_2: 'bout-haut', ...FLAG.pivots },
    absent: ['porte', 'mat_manche', 'manche_cerceau', 'windsock'],
  },
  port: {
    measure: [null, 'z', 210, 0.05], except: ['avant_cale'], below: ['avant_cale'], triangles: 3500, materials: ['vitres'],
    names: ['coque_cale', 'ber_1', 'ber_2', 'ber_3', 'accore_1', 'accore_2', 'accore_3', 'accore_4', 'accore_5', 'accore_6', 'avant_cale', 'grue', 'grue_couronne', 'fleche', 'cable', 'crochet', 'fx_bord_eau', 'fx_smoke', ...FLAG.names],
    pivots: { coque_cale: 'zmax-bas', 'ber_*': 'pied', 'accore_*': 'pied', grue_couronne: 'axe-y', fleche: 'bout', cable: 'haut', crochet: 'haut', ...FLAG.pivots },
    markers: { fx_bord_eau: 'zmax' },
    absent: ['coque', 'door_left', 'door_right', 'vantail', 'moufle', 'cable_crochet'],
  },
  warehouse: {
    measure: ['murs', 'x', 60, 0.04], triangles: 3500, materials: ['vitres'],
    names: ['murs', 'porte', 'rail', 'galet', 'galet_2', 'fond_sombre', 'caisse_1', 'caisse_2', 'caisse_3', 'caisse_4', 'caisse_5', 'fx_quai', 'fx_entree', 'fx_sortie', ...FLAG.names],
    pivots: { porte: 'bout-haut', galet: 'centre', galet_2: 'centre', 'caisse_*': 'pied', ...FLAG.pivots },
  },
  hq: {
    measure: [null, 'x', 60, 0.05], triangles: 3500, materials: ['vitres'],
    names: ['porte_gauche', 'porte_droite', 'fond_sombre', 'porte_service', 'fond_sombre_service', 'fx_entree', 'fx_sortie', 'fx_quai', 'fx_smoke', ...FLAG.names],
    pivots: { porte_gauche: 'gond', porte_droite: 'gond', porte_service: 'gond', ...FLAG.pivots },
    absent: ['flag', 'fanion'],
  },
  arsenal: {
    measure: [null, 'x', 80, 0.05], triangles: 3500, materials: ['vitres'],
    names: ['murs', 'porte', 'rail_porte', 'fond_sombre', 'fx_quai', 'fx_sortie', 'fx_smoke', ...FLAG.names],
    pivots: { porte: 'bout-haut', ...FLAG.pivots },
  },
  farm: {
    measure: [null, 'x', 40, 0.06], triangles: 3500, materials: ['vitres'],
    names: ['eolienne_tete', 'eolienne_roue', 'fx_smoke', ...FLAG.names],
    pivots: { eolienne_roue: 'centre', ...FLAG.pivots },
  },
  mine: {
    measure: [null, 'x', 50, 0.06], triangles: 3500, materials: ['vitres'],
    names: ['molette_1', 'molette_2', 'wagonnet', 'wagonnet_caisse', 'rail', 'fx_smoke', 'fx_sortie', ...FLAG.names],
    pivots: { molette_1: 'centre', molette_2: 'centre', wagonnet: 'pied', ...FLAG.pivots },
    absent: ['sheave_1', 'sheave_2'],
  },
  coalMine: {
    measure: [null, 'x', 50, 0.06], triangles: 3500, materials: ['vitres'],
    names: ['molette_1', 'molette_2', 'wagonnet', 'wagonnet_caisse', 'rail', 'fx_smoke', 'fx_sortie', ...FLAG.names],
    pivots: { molette_1: 'centre', molette_2: 'centre', wagonnet: 'pied', ...FLAG.pivots },
    absent: ['sheave_1', 'sheave_2'],
  },
  oilWell: {
    measure: [null, 'x', 25, 0.06], triangles: 3500,
    names: ['balancier', 'tete_de_cheval', 'manivelle', 'contrepoids', 'bielle', 'tige', 'fx_smoke', ...FLAG.names],
    pivots: { balancier: 'interieur', manivelle: 'interieur', bielle: 'bout', tige: 'haut', ...FLAG.pivots },
    absent: ['walking_beam', 'crank'],
  },
  researchCenter: {
    measure: [null, 'x', 50, 0.06], triangles: 3500, materials: ['vitres'],
    names: ['coupole', 'volet_coupole', 'lunette', 'porte_gauche', 'porte_droite', 'fond_sombre', 'fx_sortie', 'fx_smoke', ...FLAG.names],
    pivots: { coupole: 'pied', porte_gauche: 'gond', porte_droite: 'gond', ...FLAG.pivots },
  },
  listening: {
    measure: [null, 'x', 30, 0.06], triangles: 3500, materials: ['vitres', 'feux'],
    names: ['cadre_gonio', 'porte', 'fond_sombre', 'fx_sortie', 'fx_smoke', ...FLAG.names],
    pivots: { cadre_gonio: 'axe-y', porte: 'gond', ...FLAG.pivots },
  },
  city: {
    measure: [null, 'x', 50, 0.05], triangles: 3500, materials: ['vitres'],
    names: ['fx_smoke', ...FLAG.names], pivots: { ...FLAG.pivots },
  },

  landTransport: {
    measure: [null, 'z', per([5.3, 5.97, 6.86, 6.06, 6.02, 5.4, 5.8, 6.0]), 0.08], triangles: 1500, materials: ['vitres', 'phares'],
    names: ['body', 'wheels_left', 'wheels_right', 'roue_left_*', 'roue_right_*', 'tailgate', 'tarp', 'fond_sombre', 'fx_smoke', 'fx_poussiere', 'fx_hayon'],
    pivots: { 'roue_left_*': 'centre', 'roue_right_*': 'centre', tailgate: 'arete-basse' },
  },
  'infantry-1': {
    measure: [null, 'y', 1.75, 0.06], triangles: 800,
    names: [...MAN, 'rifle', 'fx_muzzle'], pivots: MAN_PIVOTS, parents: { rifle: 'forearm_right' },
  },
  'infantry-2': {
    triangles: per([800, 800, 800, 800, 800, 1200, 800, 800]),
    names: [...MAN, 'rifle|weapon|gun', 'fx_muzzle'], pivots: MAN_PIVOTS,
    byNation: { japan: ['gun', 'wheels_left', 'wheels_right', 'trail_left', 'trail_right', 'fx_smoke'] },
  },
  'armor-1': {
    measure: ['hull', 'z', per([4.02, 3.96, 4.84, 5.66, 4.81, 4.38, 3.17, 4.88]), 0.08], triangles: 1200, materials: ['phares'],
    names: TRACKED, pivots: TRACKED_PIVOTS,
  },
  'armor-2': {
    measure: ['hull', 'z', per([6.37, 5.61, 5.84, 6.68, 5.92, 5.52, 4.92, 4.62]), 0.08], triangles: 1200, materials: ['phares'],
    names: TRACKED, pivots: { ...TRACKED_PIVOTS, gun_hull: 'tourillons' }, byNation: { france: ['gun_hull'] },
  },
  artillery: {
    measure: [null, 'z', per([4.5, 4.6, 5.94, 7.0, 6.1, 5.7, 5.4, 4.2]), 0.1], triangles: 3000,
    names: ['carriage', 'barrel', 'shield', 'wheels_left', 'wheels_right', 'trail_left', 'trail_right', 'fx_muzzle', 'fx_smoke', 'fx_poussiere'],
    pivots: { barrel: 'tourillons', wheels_left: 'centre', wheels_right: 'centre', trail_left: 'bout', trail_right: 'bout' },
    byNation: { uk: ['platform'] },
  },
  fighter: {
    measure: [null, 'x', per([10.18, 11.23, 11.38, 10.0, 9.87, 12.0, 10.58, 9.75]), 0.06], triangles: 2500, materials: ['vitres', 'feux'],
    names: [...PLANE, 'prop', 'fx_muzzle'], pivots: PLANE_PIVOTS,
  },
  bomber: {
    measure: [null, 'x', per([22.52, 26.26, 31.62, 14.6, 13.8, 25.0, 21.2, 20.33]), 0.06], maxSpan: 31.8, triangles: 1500, materials: ['vitres', 'feux'],
    names: [...PLANE, 'prop*', 'fx_muzzle'], pivots: PLANE_PIVOTS,
  },
  airTransport: {
    measure: [null, 'x', per([29.36, 29.18, 29.11, 28.81, 29.25, 22.6, 29.68, 28.96]), 0.06], maxSpan: 31.8, triangles: 1500, materials: ['vitres', 'feux'],
    names: [...PLANE, 'prop_*', 'cabin_door', 'bay_door', 'fond_sombre', 'fond_sombre_soute', 'fx_porte', 'fx_parachute'],
    pivots: { ...PLANE_PIVOTS, cabin_door: 'zmax', bay_door: 'zmax' },
  },
  escort: {
    measure: [null, 'z', per([132.4, 62.5, 114.8, 112.8, 119.0, 67.5, 106.7, 109.7]), 0.06], below: ['hull'], triangles: 4000, materials: ['vitres', 'feux'],
    names: ['hull', 'turret_*', 'gun_*', 'boat_left', 'boat_right', 'fx_muzzle', 'fx_smoke', 'fx_sillage', ...AMARRES],
    pivots: { 'turret_*': 'axe-y', 'gun_*': 'tourillons' },
  },
  cargo: {
    measure: [null, 'z', per([130, 128, 134.6, 120, 130, 130, 125, 55]), 0.08], below: ['hull'], triangles: 4000, materials: ['vitres', 'feux'],
    names: ['hull', 'mat_charge_*', 'hold_hatch_*', 'fond_sombre_*', 'boat_left', 'fx_charge_*', 'fx_smoke', 'fx_sillage', 'fx_passerelle', ...AMARRES],
    pivots: { 'mat_charge_*': 'bout', 'hold_hatch_*': 'arete' },
    byNation: Object.fromEntries(NATIONS.filter((n) => n !== 'china').map((n) => [n, ['boat_right']])),
  },
  carrier: {
    measure: [null, 'z', per([182.6, 229.7, 250, 195, 262.5, 260.7, 231.5, 150]), 0.07], below: ['hull'], triangles: 4000, materials: ['vitres', 'feux'],
    names: ['hull', 'ascenseur', 'fond_sombre', 'boat_left', 'boat_right', 'fx_smoke', 'fx_sillage', 'fx_pont', ...AMARRES],
    pivots: { ascenseur: 'haut' },
  },

  piste: {
    roots: { piste_troncon: [30, 10, 500], piste_seuil: [30, 10, 500], piste_bout: [30, 5, 500] }, materials: ['feux'],
    repeated: ['balise_gauche', 'balise_droite', 'feu_gauche', 'feu_droit'],
    names: ['piste_troncon', 'piste_seuil', 'piste_bout', 'balise_gauche', 'balise_droite', 'feu_gauche', 'feu_droit', 'fx_seuil'],
    pivots: { balise_gauche: 'pied', balise_droite: 'pied', feu_gauche: 'pied', feu_droit: 'pied' },
  },
  mole: {
    roots: { mole_troncon: [20, 10, 500], mole_tete: [24, 24, 800] }, floor: -1.05, materials: ['feux'],
    names: ['mole_troncon', 'bitte', 'defense', 'lampadaire', 'mole_tete', 'feu_musoir', 'fx_amarre', 'fx_amarre_tete'],
    pivots: { bitte: 'pied', lampadaire: 'pied', defense: 'haut' },
  },
  manche: {
    measure: ['mat_manche', 'y', 6, 0.06], triangles: 1200, materials: ['feux'],
    names: ['mat_manche', 'manche', 'manche_cerceau', 'manche_troncon_1', 'manche_troncon_2', 'manche_troncon_3', 'manche_troncon_4', 'manche_troncon_5'],
    pivots: { mat_manche: 'pied', manche_cerceau: 'centre', 'manche_troncon_*': 'zmax' },
  },
};

// ---------- GLB ----------
function readGlb(path) {
  const bytes = readFileSync(path);
  let json, bin;
  for (let at = 12; at < bytes.length; ) {
    const length = bytes.readUInt32LE(at), type = bytes.readUInt32LE(at + 4);
    const chunk = bytes.subarray(at + 8, at + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    at += 8 + length;
  }
  return { gltf: json, bin };
}

const mul = (a, b) => {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return r;
};
const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function localOf(n) {
  if (n.matrix) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0], [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const apply = (m, [x, y, z]) => [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
const emptyBox = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
const isEmpty = (b) => b.min[0] === Infinity;
const size = (b) => [0, 1, 2].map((i) => b.max[i] - b.min[i]);

// Boîte de la géométrie sous `index`, dans le repère de `index`, sans descendre dans `stop`.
function boxUnder(gltf, index, stop = () => false, frame = ID) {
  const box = emptyBox();
  const visit = (i, m, top) => {
    const n = gltf.nodes[i];
    if (!top && stop(i)) return;
    if (n.mesh !== undefined)
      for (const p of gltf.meshes[n.mesh].primitives) {
        const a = gltf.accessors[p.attributes.POSITION];
        if (!a.min) continue;
        for (let c = 0; c < 8; c++) {
          const w = apply(m, [c & 1 ? a.max[0] : a.min[0], c & 2 ? a.max[1] : a.min[1], c & 4 ? a.max[2] : a.min[2]]);
          for (let k = 0; k < 3; k++) { box.min[k] = Math.min(box.min[k], w[k]); box.max[k] = Math.max(box.max[k], w[k]); }
        }
      }
    for (const c of n.children ?? []) visit(c, mul(m, localOf(gltf.nodes[c])), false);
  };
  visit(index, frame, true);
  return box;
}

function imageSize(buf) {
  if (buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  }
  return null;
}

// ---------- contrôles ----------
const matches = (pattern, name) => pattern.split('|').some((p) => (p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : name === p));

function pivotOk(rule, b) {
  const s = size(b), c = [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2);
  const tol = (i, share = 0.12) => Math.max(0.08, share * s[i]);
  const near = (v, i, share) => Math.abs(v) <= tol(i, share);
  const xEdge = near(b.min[0], 0) || near(b.max[0], 0);
  const centredXZ = near(c[0], 0, 0.3) && near(c[2], 2, 0.3);
  const longest = s.indexOf(Math.max(...s));
  switch (rule) {
    case 'centre': return [0, 1, 2].every((i) => near(c[i], i));
    // hélice à trois pales : sa boîte n'est pas centrée sur le moyeu ; le moyeu reste dedans, au milieu en z
    case 'moyeu': return near(c[2], 2) && [0, 1].every((i) => b.min[i] - tol(i) <= 0 && 0 <= b.max[i] + tol(i) && Math.abs(c[i]) <= 0.3 * s[i] + 0.08);
    case 'axe-y': return centredXZ;
    case 'pied': return near(b.min[1], 1) && centredXZ;
    case 'haut': return near(b.max[1], 1, 0.15);
    case 'bas': return near(b.min[1], 1, 0.15);
    case 'gond': return (xEdge || near(b.min[2], 2) || near(b.max[2], 2)) && near(b.min[1], 1);
    case 'arete': return xEdge || near(b.min[2], 2) || near(b.max[2], 2);
    case 'arete-basse': return near(b.min[1], 1, 0.2);
    case 'zmax': return near(b.max[2], 2);
    case 'zmax-bas': return near(b.max[2], 2, 0.05) && near(b.min[1], 1, 0.15);
    case 'bout-haut': return xEdge && near(b.max[1], 1);
    case 'coin-haut': return xEdge && near(b.max[1], 1);
    case 'bout': return Math.abs(b.min[longest]) <= 0.15 * s[longest] || Math.abs(b.max[longest]) <= 0.15 * s[longest];
    case 'tourillons': return b.max[2] > 0 && Math.abs(b.min[2]) <= 0.45 * s[2];
    case 'interieur': return [0, 1, 2].every((i) => b.min[i] - tol(i) <= 0 && 0 <= b.max[i] + tol(i));
    default: throw new Error(`règle de pivot inconnue : ${rule}`);
  }
}

function verify(path, key, nation) {
  const spec = EXPECT[key];
  if (!spec) throw new Error(`modèle inconnu : ${key} (connus : ${Object.keys(EXPECT).join(', ')})`);
  const valueOf = (v) => (typeof v === 'object' ? v[nation] : v);
  const { gltf, bin } = readGlb(path);
  const report = [];
  const ok = (what) => report.push(['ok', what]);
  const fail = (what) => report.push(['ÉCHEC', what]);
  const check = (cond, what) => (cond ? ok(what) : fail(what));
  const look = (what) => report.push(['à voir', what]);
  const nodes = gltf.nodes ?? [];
  const named = nodes.map((n, i) => [n.name ?? '', i]);
  const expected = [...spec.names, ...(spec.byNation?.[nation] ?? [])];
  // A part is the topmost node a pattern names: `prop_left`, not its blades `prop_left_pale_1`.
  const top = (p, i) => matches(p, nodes[i].name ?? '') && !(parent.has(i) && matches(p, nodes[parent.get(i)].name ?? ''));
  const patterns = [...expected, ...Object.keys(spec.pivots ?? {})];
  const isPart = (i) => patterns.some((p) => top(p, i));

  // Monde : matrice de chaque nœud.
  const world = new Map();
  const parent = new Map();
  const roots = gltf.scenes[gltf.scene ?? 0].nodes;
  const walk = (i, m) => { const w = mul(m, localOf(nodes[i])); world.set(i, w); for (const c of nodes[i].children ?? []) { parent.set(c, i); walk(c, w); } };
  roots.forEach((r) => walk(r, ID));

  // Noms.
  for (const p of expected) check(named.some(([n]) => matches(p, n)), `nom ${p}`);
  for (const n of spec.absent ?? []) check(!named.some(([name]) => name === n), `ancien nom ${n} retiré`);
  // un nom de pièce attendu désigne un seul nœud : three renomme le second (`manche` → `manche_1`)
  for (const p of expected.filter((p) => !/[*|]/.test(p) && !(spec.repeated ?? []).includes(p))) {
    const n = named.filter(([name]) => name === p).length;
    if (n > 1) fail(`nom ${p} porté par ${n} nœuds`);
  }
  const fx = named.filter(([n]) => n.startsWith('fx_')).map(([n]) => n);
  const twice = [...new Set(fx.filter((n, k) => fx.indexOf(n) !== k))];
  check(twice.length === 0, `repères fx_* uniques${twice.length ? ` (doublons : ${twice.join(', ')})` : ''}`);
  for (const [n, i] of named.filter(([n]) => n.startsWith('fx_')))
    check(isEmpty(boxUnder(gltf, i)), `${n} est un repère vide`);
  for (const [child, anc] of Object.entries(spec.parents ?? {})) {
    const i = named.find(([n]) => n === child)?.[1];
    let up = i, found = false;
    while (up !== undefined && !found) { up = parent.get(up); found = up !== undefined && nodes[up].name === anc; }
    check(found, `${child} est sous ${anc}`);
  }

  // Pivots : l'origine du nœud, lue sur la boîte de sa propre géométrie (sans ses sous-pièces nommées).
  for (const [pattern, rule] of Object.entries(spec.pivots ?? {}))
    for (const [n, i] of named.filter(([, i]) => top(pattern, i))) {
      const b = boxUnder(gltf, i, isPart);
      if (isEmpty(b)) { look(`pivot ${n} : aucune géométrie propre`); continue; }
      check(pivotOk(rule, b), `pivot ${n} (${rule}) — boîte locale min ${b.min.map((v) => v.toFixed(2))} max ${b.max.map((v) => v.toFixed(2))}`);
    }

  // Boîte, sol, repères liés à la boîte.
  const except = new Set(['hampe', 'drapeau', ...(spec.except ?? [])]);
  const below = new Set(spec.below ?? []);
  const all = emptyBox(), measured = emptyBox(), aboveFloor = emptyBox();
  for (const r of roots) {
    const add = (box, stop) => { const b = boxUnder(gltf, r, stop, localOf(nodes[r])); for (let k = 0; k < 3; k++) { box.min[k] = Math.min(box.min[k], b.min[k]); box.max[k] = Math.max(box.max[k], b.max[k]); } };
    add(all, () => false);
    add(measured, (i) => except.has(nodes[i].name));
    add(aboveFloor, (i) => below.has(nodes[i].name));
  }
  const s = size(measured);
  report.push(['info', `boîte du modèle (m) : ${size(all).map((v) => v.toFixed(2)).join(' × ')} ; y de ${all.min[1].toFixed(2)} à ${all.max[1].toFixed(2)}`]);
  const floor = spec.floor ?? -0.02;
  check(aboveFloor.min[1] >= floor, `rien sous y = ${floor} hors ${[...below].join(', ') || 'exception'} (min ${aboveFloor.min[1].toFixed(3)})`);
  if (!below.size && spec.floor === undefined) check(Math.abs(aboveFloor.min[1]) < 0.06, `posé au sol (min y ${aboveFloor.min[1].toFixed(3)})`);
  if (spec.measure) {
    const [node, axis, metres, tolerance] = spec.measure;
    const want = valueOf(metres);
    const k = { x: 0, y: 1, z: 2 }[axis];
    let got;
    if (node) {
      const i = named.find(([n]) => n === node)?.[1];
      got = i === undefined ? NaN : size(boxUnder(gltf, i, isPart, world.get(i)))[k];
    } else got = s[k];
    if (want === undefined) look(`mesure en ${axis} : ${got.toFixed(2)} m (passe --nation pour la comparer)`);
    else check(Math.abs(got - want) <= tolerance * want, `mesure ${node ?? 'du modèle'} en ${axis} : ${got.toFixed(2)} m pour ${want} m (± ${Math.round(tolerance * 100)} %)`);
  }
  if (spec.maxSpan) check(s[0] <= spec.maxSpan, `envergure ${s[0].toFixed(2)} m ≤ ${spec.maxSpan} m (baie du hangar)`);
  for (const [marker, rule] of Object.entries(spec.markers ?? {})) {
    const i = named.find(([n]) => n === marker)?.[1];
    if (i === undefined) continue;
    const p = apply(world.get(i), [0, 0, 0]);
    if (rule === 'zmax') check(Math.abs(p[2] - measured.max[2]) < 2, `${marker} au bord +z de l'emprise (z ${p[2].toFixed(1)} pour ${measured.max[2].toFixed(1)})`);
  }

  // Triangles.
  const trianglesUnder = (i) => {
    let t = 0;
    const visit = (j) => { const n = nodes[j]; if (n.mesh !== undefined) for (const p of gltf.meshes[n.mesh].primitives) t += gltf.accessors[p.indices ?? p.attributes.POSITION].count / 3; (n.children ?? []).forEach(visit); };
    visit(i);
    return t;
  };
  if (spec.roots) {
    for (const [root, [x, z, max]] of Object.entries(spec.roots)) {
      const i = named.find(([n]) => n === root)?.[1];
      if (i === undefined) continue;
      const t = nodes[i].translation ?? [0, 0, 0];
      check(roots.includes(i) && t.every((v) => Math.abs(v) < 1e-4), `${root} est une racine à l'origine`);
      const b = size(boxUnder(gltf, i));
      check(Math.abs(b[0] - x) <= 0.05 * x + 0.3 && Math.abs(b[2] - z) <= 0.05 * z + 0.3, `${root} : ${b[0].toFixed(2)} × ${b[2].toFixed(2)} m pour ${x} × ${z}`);
      const n = trianglesUnder(i);
      check(n <= max, `${root} : ${n} triangles ≤ ${max}`);
    }
  } else {
    const n = roots.reduce((sum, r) => sum + trianglesUnder(r), 0);
    const max = valueOf(spec.triangles);
    check(n <= max, `${n} triangles ≤ ${max}`);
  }

  // Matériaux, textures, extensions.
  const materials = (gltf.materials ?? []).map((m) => m.name);
  for (const m of spec.materials ?? []) check(materials.includes(m), `matériau ${m}`);
  const unnamed = (gltf.meshes ?? []).flatMap((m) => m.primitives).filter((p) => p.material === undefined).length;
  check(unnamed === 0, `chaque primitive a son matériau${unnamed ? ` (${unnamed} sans)` : ''}`);
  const images = gltf.images ?? [];
  check(images.length <= 1, `une seule texture (${images.length})`);
  for (const [k, img] of images.entries()) {
    const view = gltf.bufferViews[img.bufferView];
    const buf = img.bufferView === undefined ? null : bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const dims = buf && imageSize(buf);
    if (dims) check(Math.max(...dims) <= 1024, `texture ${k} : ${dims.join(' × ')} px ≤ 1 024`);
    check(img.mimeType === 'image/webp', `texture ${k} en WebP (${img.mimeType ?? 'uri'})${img.mimeType === 'image/webp' ? '' : ' — npx @gltf-transform/cli webp in.glb out.glb --quality 90'}`);
  }
  const used = gltf.extensionsUsed ?? [];
  for (const e of ['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_draco_mesh_compression', 'KHR_lights_punctual'])
    check(!used.includes(e), `sans ${e}`);
  check(!(gltf.cameras ?? []).length && !nodes.some((n) => n.camera !== undefined), 'sans caméra');

  return report;
}

function coherence() {
  const here = dirname(fileURLToPath(import.meta.url));
  let failures = 0;
  for (const [key, spec] of Object.entries(EXPECT)) {
    const text = readFileSync(join(here, `${key}.md`), 'utf8');
    const names = [...spec.names, ...Object.values(spec.byNation ?? {}).flat(), ...Object.keys(spec.pivots ?? {}), ...(spec.materials ?? [])];
    const missing = [...new Set(names)].filter((p) => !p.split('|').some((n) => text.includes(n.replace(/\*$/, '').replace(/_\d+$/, '_'))));
    if (missing.length) failures++;
    console.log(`${missing.length ? 'ÉCHEC' : 'ok   '} ${key}.md${missing.length ? ` : absents ${missing.join(', ')}` : ''}`);
  }
  return failures;
}

const args = process.argv.slice(2);
if (args[0] === '--coherence') process.exit(coherence() ? 1 : 0);
const nation = args.includes('--nation') ? args[args.indexOf('--nation') + 1] : undefined;
const [path, key] = args.filter((a, k) => a !== '--nation' && args[k - 1] !== '--nation');
if (!path || !key) {
  console.log('usage : node verifier-glb.mjs <fichier.glb> <modèle> [--nation <nation>]   |   --coherence');
  process.exit(2);
}
if (nation && !NATIONS.includes(nation)) throw new Error(`nation inconnue : ${nation}`);
const report = verify(path, key, nation);
for (const [status, what] of report) console.log(`${status.padEnd(6)} ${what}`);
process.exit(report.some(([s]) => s === 'ÉCHEC') ? 1 : 0);
