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

/**
 * **Le relevé, et sa péremption** (ADR 0020 §5). Ce qui précède calcule *la vérité* — qui tient
 * quoi, au moment où on le demande. Ce qui suit calcule *la connaissance* : ce que ce joueur-là
 * a vu la dernière fois qu'il a regardé, avec sa date.
 *
 * Trois états d'une région, et le premier n'est pas une couleur : **vierge** (jamais observée,
 * absente de la réponse), **relevée** (observée à une date, possiblement fausse depuis),
 * **à jour** (couverte à l'instant par une portée du joueur, ou son propre sol).
 */

/** Un détecteur posé, tel que le relevé le lit : un point et une portée, jamais ce qu'il est.
 *  Une troupe, une station, un avant-poste ne se distinguent en rien ici — ils regardent. */
export type Observer = {
  readonly point: LonLat;
  readonly radiusKm: number;
};

/**
 * **Ce qu'un jeu de portées couvre**, et rien de ce qui s'y trouve : la couverture dit où l'on
 * voit, jamais ce qu'on y voit. Les deux se croisent chez l'appelant, qui est le seul à avoir le
 * droit de tenir la vérité en main.
 *
 * Le tri par latitude n'est pas une optimisation gratuite : un relevé de trajet porte plusieurs
 * dizaines de portées contre les 4 589 régions cuites, et une bande de latitude retire d'un coup
 * ce qu'aucun rayon terrestre ne peut atteindre. Elle est seule à filtrer — un encadrement en
 * longitude devrait franchir l'antiméridien, et un mauvais enroulement se lirait comme un trou
 * dans la carte plutôt que comme un bug.
 */
export function coveredRegions(
  regions: ReadonlyArray<ControlledRegion>,
  observers: ReadonlyArray<Observer>,
): ReadonlySet<string> {
  const covered = new Set<string>();
  if (observers.length === 0) return covered;

  const degrees = (km: number) => km / 111.32;
  const south = Math.min(...observers.map(({ point, radiusKm }) => point[1] - degrees(radiusKm)));
  const north = Math.max(...observers.map(({ point, radiusKm }) => point[1] + degrees(radiusKm)));

  for (const region of regions) {
    const latitude = region.point[1];
    if (latitude < south || latitude > north) continue;
    for (const observer of observers) {
      if (distanceKm(observer.point, region.point) > observer.radiusKm) continue;
      covered.add(region.id);
      break;
    }
  }
  return covered;
}

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
