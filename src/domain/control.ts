import { distanceKm, type LonLat } from './geo';

/**
 * **Qui tient quoi** (ADR 0020 §1). Une région est *tenue* — jamais annexée, jamais prise
 * (ADR 0004) — par le joueur dont un avant-poste vivant la couvre, ou par la nation dont elle
 * est le sol d'origine.
 *
 * **Tenu par le disque, plus par le pôle** (révision du 17/09/2026) : une région est couverte dès
 * qu'une de ses **cellules** est dans le rayon (`coveredByDisc`, ADR 0023), et non quand son pôle
 * d'inaccessibilité y tombe. Le pôle d'une région géante est à des centaines de kilomètres de sa
 * frontière — 969 régions sur 4 589 avaient celui de leur voisine à plus de 120 km — de sorte que
 * le cercle ne tenait rien au-delà de la région du point, quel que soit le niveau. La précision du
 * 04/09 (« un point tient d'abord la région où il se tient ») est **absorbée** : sa cellule est à
 * distance nulle, donc la règle la donne sans branche à part.
 *
 * **Le rayon de contrôle est le rayon de construction** (`outpostReachKm`), et il n'entre plus
 * ici : l'appelant le mesure une fois par point et tend la couverture. *Là où je peux bâtir est
 * là où je tiens* — la vue lit la **même** fonction pour offrir le sol (`convex/view.ts`), sans
 * quoi le serveur accepterait ce que l'écran refuserait.
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
  /**
   * **Ce que son disque touche**, et la distance à la cellule la plus proche de chaque région
   * (`coveredByDisc`). Le rayon et le point sont déjà dedans : les mesurer une seconde fois ici
   * ferait de la portée une règle à deux endroits, et c'est exactement ce que la révision du
   * 17/09 a retiré.
   */
  readonly covers: ReadonlyMap<string, number>;
  /**
   * **Hors service, il ne tient plus rien** (ADR 0020 §7). Un avant-poste désactivé par un raid
   * décolore sa zone pendant toute la désactivation — c'est le premier retour visuel d'un
   * mécanisme codé et jusque-là muet, et c'est ce qui donne au raid une valeur indépendante du
   * butin. Il n'est pas déraciné pour autant (ADR 0004) : il paie son entretien, il garde ses
   * bâtiments debout, et sa couleur revient seule à la fin de la fenêtre.
   *
   * La désactivation est lue par l'appelant, qui seul connaît l'heure : le domaine ne date rien.
   */
  readonly disabled: boolean;
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
}: {
  readonly regions: ReadonlyArray<ControlledRegion>;
  readonly outposts: ReadonlyArray<ControlOutpost>;
  readonly homeGrounds: ReadonlyArray<HomeGround>;
}): ReadonlyMap<string, string> {
  const homeOwner = new Map(homeGrounds.map(({ country, owner }) => [country, owner]));
  const held = new Map<string, string>();
  for (const region of regions) {
    const home = homeOwner.get(region.country);
    if (home !== undefined) {
      held.set(region.id, home);
      continue;
    }
    const holder = nearestHolder(region.id, outposts);
    if (holder !== null) held.set(region.id, holder);
  }
  return held;
}

/**
 * Le plus proche propriétaire, `null` s'il n'y en a aucun **ou** si deux se disputent la région à
 * la même distance au kilomètre près.
 *
 * La distance comparée est celle de la **cellule la plus proche** de la région (`coveredByDisc`),
 * là où elle était celle du pôle : deux points adverses plantés dans la même région sont tous
 * deux à zéro, donc à égalité exacte, donc personne ne la tient — ce que la règle du litige dit
 * déjà, sans exception ajoutée.
 *
 * **Un point hors service ne concourt pas** (§7), et il ne dispute donc rien non plus : la
 * région qu'il tenait revient au voisin qui la couvre, adverse compris. C'est exactement ce
 * qu'un raid vient chercher.
 */
function nearestHolder(regionId: string, outposts: ReadonlyArray<ControlOutpost>): string | null {
  let best: { owner: string; km: number } | null = null;
  let disputed = false;
  for (const outpost of outposts) {
    if (outpost.disabled) continue;
    const km = outpost.covers.get(regionId);
    if (km === undefined) continue;
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
 * vieux rose, sépia. Rien de fluorescent — le plateau est de l'encre sur papier (fiche 10), et
 * une couleur d'écran posée sur la mer gravée casserait le budget de contraste que la carte
 * tient.
 *
 * **Elles ont été montées d'un cran le 31/08** (contrôle visuel de Pierre) : au premier lavis
 * réel, `#2f5d7c` se lisait gris plutôt que bleu, et sa propre couleur est la seule chose qu'un
 * joueur doit reconnaître sans y penser. Le sépia a été assombri du même coup — il tombait entre
 * le rouge et l'ocre, et c'est le seul écart que la saturation avait resserré au lieu de
 * l'ouvrir. **Le bleu a quitté le sarcelle le 13/10** (`#276893` → `#2457a8`) : posé en lavis
 * sur le sable (`lavis`, `map/engine/palette.ts`), il virait au gris-vert.
 */
export const SEAT_INKS: ReadonlyArray<string> = [
  '#2457a8',
  '#b2432f',
  '#66833c',
  '#c09533',
  '#7e4377',
  '#37908a',
  '#b96472',
  '#77492a',
];

/** L'encre d'un siège, par son rang d'entrée. Le modulo n'a pas d'usage — le salon plafonne à
 *  huit joueurs — mais une neuvième entrée doit sortir une couleur, pas `undefined`. */
export const seatInk = (rank: number): string => SEAT_INKS[rank % SEAT_INKS.length]!;

/**
 * **Le relevé, et sa péremption** (ADR 0020 §5). Ce qui précède calcule *la vérité* — qui tient
 * quoi, au moment où on le demande. Ce qui suit calcule *la connaissance* : ce que ce joueur-là
 * a vu la dernière fois qu'il a regardé, avec sa date.
 *
 * Trois états d'une région, et le premier n'est pas une couleur : **vierge** (jamais observée,
 * absente de la réponse), **relevée** (observée à une date, possiblement fausse depuis),
 * **à jour** (couverte à l'instant par une portée du joueur, ou son propre sol).
 *
 * **Ce qu'une portée couvre ne se mesure plus ici** (révision du 17/09) : c'est la même question
 * de sol que la couleur, donc la même fonction — le disque sur le raster (`coveredByDisc`, lu par
 * `regionsCoveredBy`). Deux géométries pour le même sol feraient qu'un joueur tiendrait l'Ontario
 * sans jamais en recevoir la ligne de relevé qui le lui montre.
 */

/**
 * **Les points où un trajet relève.** Une colonne voit le couloir qu'elle a marché, pas les
 * sommets que Dijkstra a retenus : la polyligne est donc réechantillonnée au **demi-rayon**, ce
 * qui couvre le couloir sans trou et borne le nombre de cercles à tester — une route
 * transcontinentale vaut quelques dizaines de haltes, jamais ses centaines de mailles de grille.
 */
export function surveyStops(
  points: ReadonlyArray<LonLat>,
  radiusKm: number,
): ReadonlyArray<LonLat> {
  const first = points[0];
  if (first === undefined) return [];
  const stops: Array<LonLat> = [first];
  let last = first;
  for (const point of points.slice(1)) {
    if (distanceKm(last, point) < radiusKm / 2) continue;
    stops.push(point);
    last = point;
  }
  const end = points.at(-1)!;
  if (end !== last) stops.push(end);
  return stops;
}

/** Une ligne de relevé, telle qu'elle est stockée par observateur. `owner` à `null` est une
 *  observation qui a **vu que personne ne tenait** — elle corrige une couleur périmée, elle
 *  n'est pas l'absence de relevé. */
export type Survey = {
  readonly regionId: string;
  readonly owner: string | null;
  readonly seenAt: number;
};

/**
 * Ce qu'un joueur sait d'une région, et dans quel état il le sait. Une union discriminée plutôt
 * qu'un `seenAt` nullable : une région à jour n'a **pas** de date de relevé à afficher, et le
 * compilateur est le bon endroit pour le dire (CONVENTIONS §8).
 */
export type KnownRegion = {
  readonly regionId: string;
  readonly owner: string;
} & ({ readonly state: 'current' } | { readonly state: 'surveyed'; readonly seenAt: number });

/**
 * **La carte d'un joueur**, assemblée dans cet ordre exact :
 *
 * - **son sol** passe avant tout et n'est jamais daté — une nation n'est jamais annexée
 *   (ADR 0004), donc il n'y a rien à y relever et rien qui puisse s'y périmer ;
 * - **ce qu'une de ses portées couvre à l'instant** est à jour : il est sur place, la date
 *   n'apprendrait rien ;
 * - **le reste est son dernier relevé**, avec sa date, et il peut être faux.
 *
 * Les régions vierges n'y sont pas, et une région relevée tenue par personne non plus : les
 * deux n'ont pas de couleur, et une ligne vide serait une couleur de plus dans la légende.
 */
export function knownRegions({
  home,
  covered,
  surveys,
}: {
  readonly home: { readonly owner: string; readonly regionIds: ReadonlyArray<string> };
  readonly covered: ReadonlySet<string>;
  readonly surveys: ReadonlyArray<Survey>;
}): ReadonlyArray<KnownRegion> {
  const known = new Map<string, KnownRegion>();
  for (const regionId of home.regionIds) {
    known.set(regionId, { regionId, owner: home.owner, state: 'current' });
  }
  for (const survey of surveys) {
    if (survey.owner === null || known.has(survey.regionId)) continue;
    known.set(
      survey.regionId,
      covered.has(survey.regionId)
        ? { regionId: survey.regionId, owner: survey.owner, state: 'current' }
        : {
            regionId: survey.regionId,
            owner: survey.owner,
            state: 'surveyed',
            seenAt: survey.seenAt,
          },
    );
  }
  return [...known.values()];
}

/**
 * **Le délavage d'un relevé** — l'ancienneté se voit en permanence, jamais au survol seul
 * (ADR 0020 §5). Sans ce signal, un joueur qui décide sur une information périmée lira un bug
 * plutôt qu'une règle, et il aura raison de se plaindre.
 *
 * Le résultat est **cranté**, et c'est ce qui le rend utilisable : la teinte est un maillage
 * fusionné par couleur, donc une valeur continue referait la géométrie à chaque minute pour un
 * pixel de différence. Cinq crans se voient et ne coûtent rien.
 *
 * Il ne descend jamais à zéro : un relevé vieux d'une semaine reste une chose qu'on a vue, et
 * l'effacer le rendrait indistinguable d'une région vierge.
 */
export const FADED_WASH = 0.35;

const WASH_STEPS = 4;

export function surveyWash(ageMs: number, fadedAfterMs: number): number {
  const aged = Math.min(1, Math.max(0, ageMs / fadedAfterMs));
  /** Le cran se prend sur l'âge et pas sur la teinte : arrondir la teinte raterait le plancher,
   *  qui n'est pas un multiple du pas. */
  return 1 - (Math.round(aged * WASH_STEPS) / WASH_STEPS) * (1 - FADED_WASH);
}
