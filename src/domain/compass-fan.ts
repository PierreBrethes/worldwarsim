import { fr } from '@/i18n/fr';
import {
  freeSlotsOf,
  legalMovementTypes,
  ORDERABLE_TYPES,
  refusalDetails,
  refusalOf,
  type Column,
  type MovementAim,
  type OrderRefusal,
} from './movement-orders';
import { marchingTroopIds, stationKeyOf, troopsAt } from './troops';
import type { MovementType } from './ids';
import { type PlayerView, type TroopStation } from './player-view';
import type { Compass, CompassAction, CompassPictogram, CompassTarget } from './compass-rose';

/**
 * The only cost the game can quantify today. The steel and duration of a founding exist
 * nowhere — displaying them would mean inventing them.
 */
export function slotCost(view: PlayerView): string | null {
  /** Pas de slots en Blitz (B5) : la branche ne porte pas de prix. */
  if (view.mode === 'blitz') return null;
  const free = freeSlotsOf(view.me.slots);
  return fr.compass.slotsCost(free);
}

/**
 * The pictogram plate of the aiming fan, taken from the mockup: the crossed rifles for the
 * assault, the pennant for the raid, the cabin for a point planted. The three the game cannot
 * order yet are here so the day they land there is a branch to fill, never a drawing to find.
 */
const AIM_PICTOGRAM: Readonly<Record<MovementType, CompassPictogram>> = {
  /** The hut for the march, because a march ends in a camp (ADR 0019 §7). It is the cabin the
   *  foundation used to wear, free since founding stopped being a march — and the fan that
   *  offers "voir le pays" under the same drawing is the unarmed one, never this one. */
  march: 'cabin',
  attack: 'rifles',
  raid: 'pennant',
  outpost: 'cabin',
  agent: 'helmet',
  return: 'anchor',
};

/**
 * One branch per march. **The march aimed at a building of one's own is « entrer en garnison »**
 * (decisions 64b, 69a): the same type on the wire — `march`, go there and stay — but the branch
 * says where the column ends, because « marche » on a mast would read as a walk to the doorstep.
 */
const march = (type: MovementType, aim: MovementAim, view: PlayerView): CompassAction => {
  /** **Un point à soi s'entre comme un mât** (décision du 16/09) : la marche y finit en
   *  garnison, et la seule marche légale sur un avant-poste est celle-là (`refusalOf`). */
  const garrison = type === 'march' && (aim.kind === 'building' || aim.kind === 'outpost');
  const label = garrison ? fr.compass.garrison : fr.movementTypes[type];
  return {
    key: 'aim',
    pictogram: garrison ? 'doorway' : AIM_PICTOGRAM[type],
    label,
    cost: slotCost(view),
    /** **The forfait is not quantified here, and that is deliberate**: the figure lives in
     *  `convex/constants.ts` with every other balance number, and the domain does not read it
     *  (ADR 0016, the layering of `CLAUDE.md`). The aiming card says it, one gesture later, at the
     *  moment it is a price rather than a warning. */
    consequence: fr.compass.marchConsequence(label),
    aim,
    type,
  };
};

/** La marche légale d'un éventail : celle que livrer, tourner et larguer empruntent. */
export const marchOf = (fan: Compass) =>
  fan.actions.find(
    (action): action is Extract<CompassAction, { key: 'aim' }> =>
      action.key === 'aim' && action.type === 'march',
  );

/**
 * One branch per legal type, and never two for the same type: the first aim that legalises a type
 * is the one it marches with, so a point and the region under it cannot both offer an attack.
 *
 * No legal type at all is not a reason to keep quiet: the fan comes back empty and carrying the
 * motive, which is the whole of the refusal state.
 */
export function fanOf(
  name: string,
  view: PlayerView,
  column: Column,
  aims: ReadonlyArray<MovementAim>,
): Compass {
  const taken = new Set<MovementType>();
  const actions = aims.flatMap((aimed) =>
    legalMovementTypes(aimed, column)
      .filter((type) => !taken.has(type) && taken.add(type) !== undefined)
      .map((type) => march(type, aimed, view)),
  );
  /**
   * **Le motif ne sort que lorsque la plate est vide de marches.** Tant qu'il reste un ordre à
   * donner là, il n'y a rien à expliquer ; le motif est pour le cas qu'aucune carte ne peut dire
   — une porte de domaine fermée, une pile trop lourde — et c'est le seul que l'ADR 0019 voulait
   * sortir du silence.
   */
  const marches = actions.filter((action) => action.key === 'aim');
  return {
    kicker: fr.compass.aiming(column.roles.length),
    name,
    actions,
    refusal: marches.length === 0 ? refusalIn(aims, column) : null,
  };
}

/**
 * **One motive on screen, and it is the one the map cannot show.** Several types refuse for
 * several reasons; the order runs from what the column carries to what the target is. A player
 * reads on the map that this ground is his own, or that no outpost stands where he pointed —
 * he cannot read there that the pile under his feet has no port to embark from, or too few
 * berths for what it loads. The rose earns its place by saying what the map does not.
 */
const REFUSAL_PRIORITY: ReadonlyArray<OrderRefusal> = [
  'EMPTY_MOVEMENT',
  /** Blitz (lot 5) : la main en tient deux, et la carte ne le dit pas. */
  'ONE_UNIT_ONLY',
  /** La boîte se lit sur la carte, mais un clic au ras du cadre ne dit pas de quel côté il est. */
  'OUTSIDE_THEATRE',
  'RELOADING',
  'NO_AIRFIELD_AT_DEPARTURE',
  'NO_PORT_AT_DEPARTURE',
  /** Juste après les portes de départ, parce que c'en est une : la carte montre une pile sur
   *  l'eau, elle ne montre pas qu'il ne reste rien dessous qui flotte (règle 3 du 18/09). */
  'NO_HULL_AT_SEA',
  'NOT_ENOUGH_LIFT',
  'AIR_TRANSPORT_SEATS_INFANTRY',
  /** Après les portes de départ et avant l'allégeance : la carte montre bien une côte, mais pas
   *  la cellule que la grille de routage tient pour telle — le joueur ne peut pas la lire. */
  'LANDING_NEEDS_A_COAST',
  /** Comme la plage : la carte montre le sol visé, pas qu'un avion chargé n'y descend pas. */
  'AIRFIELD_TARGET_REQUIRED',
  'LAND_TARGET_REQUIRED',
  'NO_FOOTING',
  'SEA_TARGET_REQUIRED',
  'LAKE_TARGET',
  'INFANTRY_ONLY',
  /** Before the allegiance: an attack on one's own mast is refused as friendly, and that is
   *  not what the player asked — he asked to enter, and the door is what he cannot see. */
  'NOT_A_GARRISON_FOR',
  'BUILDING_OCCUPIED',
  /** Before the friendly refusal: the column asked to enter the very garrison it is. */
  'ALREADY_HERE',
  'FRIENDLY_TARGET',
  'OUTPOST_TARGET_ONLY',
  'POINT_TARGET_ONLY',
  /** Ce que la carte ne dit pas : une réserve se **porte**, et un mât de blindés n'a rien pour
   *  la rapporter. Le motif vient avant le sol vide, qui se lit, lui. */
  'INFANTRY_REQUIRED',
  'UNIT_TARGET_ONLY',
  'INDIRECT_FIRE_ONLY',
  /** En dernier : la carte montre un sol vide, et c'est précisément ce que le joueur y lit. */
  'NOTHING_TO_ATTACK',
  'NOT_ORDERABLE',
];

/**
 * The refusal in the **same words the server would use**: the sentence is written once, in
 * `fr.errors`, and the rose borrows it rather than paraphrasing it — a player must not read one
 * thing before the click and another after it.
 */
function refusalIn(aims: ReadonlyArray<MovementAim>, column: Column): string | null {
  const met = new Set(
    aims.flatMap((aimed) => ORDERABLE_TYPES.map((type) => refusalOf(type, aimed, column))),
  );
  const code = REFUSAL_PRIORITY.find((candidate) => met.has(candidate));
  if (code === undefined) return null;
  return fr.errors[code](
    aims.reduce<Record<string, unknown>>(
      (details, aimed) => ({ ...details, ...refusalDetails(aimed, column) }),
      {},
    ),
  );
}

/** L'adresse d'une pile posée est un point, toujours : une garnison se lit sur le mât déjà
 *  dessiné, jamais sur une étiquette de pile (`postedStacks`). */
export const posted = (
  target: Extract<CompassTarget, { kind: 'force' }>,
): Extract<TroopStation, { kind: 'point' }> | null =>
  target.station !== null && target.station.kind === 'point' ? target.station : null;

/** Ce qui se tient là, une seule lecture pour les deux branches de la pile : elles doivent
 *  parler de la même colonne, sinon « fonder » et « envoyer » n'emportent pas les mêmes troupes. */
export const pileAt = (station: TroopStation, view: PlayerView) =>
  troopsAt(view.me, stationKeyOf(station), marchingTroopIds(view.arcs));
