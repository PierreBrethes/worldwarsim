import { distanceKm, type LonLat } from './geo';

/**
 * **Qui tient quoi** (ADR 0020 §1). Une région est *tenue* — jamais annexée, jamais prise
 * (ADR 0004) — par le joueur dont un avant-poste vivant la couvre, ou par la nation dont elle
 * est le sol d'origine.
 *
 * **Le rayon de contrôle est le rayon de construction**, `OUTPOST_REACH_KM`, et il arrive en
 * paramètre : *là où je peux bâtir est là où je tiens*. Une seconde constante serait une
 * deuxième règle à apprendre pour le même geste, et l'ADR l'interdit nommément.
 *
 * Rien n'est stocké de tout cela, jamais : la couleur se recalcule depuis les avant-postes
 * debout à l'instant où on la demande — même contrat que la capacité militaire
 * (`domain/victory.ts`), et pour la même raison. Un état dénormalisé se désynchronise le jour
 * où un avant-poste est détruit, et personne ne le voit.
 */
export type ControlledRegion = {
  readonly id: string;
  /** Le code `adm0_a3` du pays hôte — ce qui décide du sol national. */
  readonly country: string;
  /** Le point de la région (`region-index.json`), jamais son polygone : une portée se mesure. */
  readonly point: LonLat;
};

export type ControlOutpost = {
  /** L'identité du propriétaire, telle que l'appelant la nomme — le domaine n'en sait rien. */
  readonly owner: string;
  readonly point: LonLat;
};

/** Le sol d'origine d'une nation en jeu : son pays, et le joueur qui la porte. */
export type HomeGround = {
  readonly owner: string;
  readonly country: string;
};

/**
 * Qui tient quelle région — les régions tenues par personne n'y figurent pas. Sur 4 589 régions
 * cuites, une saison n'en tient qu'une poignée de centaines : rendre la carte entière ferait
 * porter au réseau ce que la règle vient justement d'exclure.
 *
 * Deux départages, et ils ne se ressemblent pas :
 *
 * - **le sol national l'emporte toujours** sur un avant-poste étranger, quelle que soit la
 *   distance. Une nation n'est jamais annexée (ADR 0004) ; poser un avant-poste chez elle donne
 *   le droit d'y bâtir, jamais celui d'y tenir le sol.
 * - **le litige se tranche par la distance** : entre deux avant-postes adverses qui couvrent la
 *   même région, elle revient au plus proche. **À égalité exacte, personne ne la tient** — un
 *   départage arbitraire (l'ordre d'insertion, le nom du joueur) serait une règle que rien
 *   n'énonce et que personne ne pourrait lire sur la carte.
 */
export function heldRegions({
  regions,
  outposts,
  homeGrounds,
  reachKm,
}: {
  readonly regions: ReadonlyArray<ControlledRegion>;
  readonly outposts: ReadonlyArray<ControlOutpost>;
  readonly homeGrounds: ReadonlyArray<HomeGround>;
  readonly reachKm: number;
}): ReadonlyMap<string, string> {
  const homeOwner = new Map(homeGrounds.map(({ country, owner }) => [country, owner]));
  const held = new Map<string, string>();
  for (const region of regions) {
    const home = homeOwner.get(region.country);
    if (home !== undefined) {
      held.set(region.id, home);
      continue;
    }
    const holder = nearestHolder(region.point, outposts, reachKm);
    if (holder !== null) held.set(region.id, holder);
  }
  return held;
}

/** Le plus proche propriétaire à portée, `null` s'il n'y en a aucun **ou** si deux se disputent
 *  la région à la même distance au kilomètre près. */
function nearestHolder(
  point: LonLat,
  outposts: ReadonlyArray<ControlOutpost>,
  reachKm: number,
): string | null {
  let best: { owner: string; km: number } | null = null;
  let disputed = false;
  for (const outpost of outposts) {
    const km = distanceKm(outpost.point, point);
    if (km > reachKm) continue;
    if (best === null || km < best.km) {
      best = { owner: outpost.owner, km };
      disputed = false;
    } else if (km === best.km && outpost.owner !== best.owner) {
      disputed = true;
    }
  }
  return best === null || disputed ? null : best.owner;
}

/**
 * **Les encres de siège.** Une couleur par joueur, attribuée à son entrée dans la saison et
 * stable jusqu'au wipe — jamais dérivée de la nation : deux drapeaux se ressemblent (le
 * Royaume-Uni et la France partagent déjà un bleu), et une nation change de mains d'une saison
 * à l'autre alors que la couleur doit rester celle d'un joueur.
 *
 * Huit encres imprimées, distinctes **à la découpe** : bleu, rouge, vert, ocre, prune, sarcelle,
 * vieux rose, sépia. Rien de saturé — le plateau est de l'encre sur papier (fiche 10), et une
 * couleur d'écran posée sur la mer gravée casserait le budget de contraste que la carte tient.
 */
export const SEAT_INKS: ReadonlyArray<string> = [
  '#2f5d7c',
  '#9c4536',
  '#5c7040',
  '#b08a34',
  '#6d4568',
  '#3d7a76',
  '#a86570',
  '#7a5232',
];

/** L'encre d'un siège, par son rang d'entrée. Le modulo n'a pas d'usage — le salon plafonne à
 *  huit joueurs — mais une neuvième entrée doit sortir une couleur, pas `undefined`. */
export const seatInk = (rank: number): string => SEAT_INKS[rank % SEAT_INKS.length]!;
