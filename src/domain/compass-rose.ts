import { countryLabel, fr } from '@/i18n/fr';
import { buildOptionsAt } from './construction';
import {
  legalMovementTypes,
  liftOf,
  ORDERABLE_TYPES,
  refusalOf,
  type Column,
  type MovementAim,
  type OrderRefusal,
} from './movement-orders';
import { NATION_BY_ADM0 } from './nations';
import type { MovementType } from './ids';
import type { PlayerView } from './player-view';

/**
 * What the right click touched. A discriminated union rather than an object with optional
 * fields: a force has no declared host country — picking says which land it stands on — and
 * an outpost always has one.
 *
 * Every `country` here is a Natural Earth `adm0_a3`, the key the server, the regions and the
 * outposts share: a target and an outpost's host compare directly, and a label goes through
 * `countryLabel` and nowhere else.
 */
export type CompassTarget =
  | { readonly kind: 'country'; readonly country: string }
  /**
   * The same land, aimed at up close: below the regions' fade-in threshold the right click
   * lands on an admin-1 region rather than on the country. The id is the Natural Earth
   * `adm1_code` — admin-1 names repeat from one country to the next, ids do not — and
   * `country` stays the map country the region belongs to, so the country's own actions keep
   * working underneath.
   */
  | {
      readonly kind: 'region';
      readonly id: string;
      readonly name: string;
      readonly country: string;
    }
  | {
      readonly kind: 'outpost';
      readonly id: string;
      readonly hostCountry: string;
      readonly name: string;
    }
  /**
   * The map itself, wherever it carries nothing clickable — the open sea, and every scale above
   * the regions' fade-in threshold, where no region is drawn to be picked. `regionId` travels
   * with it because a **foundation** still goes on a region: an outpost is placed on ground that
   * produces, not on a coordinate. `name` is what the fan writes at its centre, which the click
   * knows and the point does not.
   */
  | {
      readonly kind: 'point';
      readonly lon: number;
      readonly lat: number;
      readonly regionId: string | null;
      readonly country: string | null;
      readonly name: string;
    }
  | {
      readonly kind: 'force';
      readonly id: string;
      readonly country: string | null;
      readonly name: string;
      readonly headcount: number;
    };

/**
 * The pictograms of the radial menu plate. Two mark nothing yet — the helmet awaits the agent,
 * the propeller the day something flies — and are declared here so that when the day comes there
 * is only wiring to write, never a drawing to find.
 *
 * `silhouette` is the decoy's, and it is the plate's one hollow drawing: the march's hut with
 * nothing inside it. A feint is the shape of a column and none of its substance, and the
 * pictogram says exactly that before the tooltip does.
 */
export type CompassPictogram =
  'cabin' | 'crane' | 'anchor' | 'helmet' | 'propeller' | 'rifles' | 'pennant' | 'silhouette';

/**
 * Only actions with a real destination exist — nothing greyed out, ever. The pictogram stays
 * mute: label, cost and consequence only appear on hover, in the tooltip. The array order is
 * the fan order, due north then clockwise.
 */
export type CompassAction =
  | {
      readonly key: 'view';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly country: string;
    }
  /**
   * The aimed march. It only exists while a column is armed, and the fan then holds **exactly**
   * the types the server will accept for this target — `legalMovementTypes` is the same
   * function the mutations refuse with, not a copy of its table (ADR 0015).
   */
  | {
      readonly key: 'aim';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly aim: MovementAim;
      readonly type: MovementType;
    }
  | {
      readonly key: 'build';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly regionId: string;
      readonly regionName: string;
    };

type Fan = {
  /** The tooltip's context line: the target's nature and qualification. */
  readonly kicker: string;
  readonly name: string;
  readonly actions: ReadonlyArray<CompassAction>;
};

export type Compass = Fan & {
  /**
   * Why the fan is empty, when it is — **and only while aiming**. A column whose domain door is
   * shut has no legal type, and returning nothing there would give back, one notch further, the
   * very silence ADR 0019 was written against. Unarmed, an empty fan is not a refusal: there is
   * simply nothing to do on that ground, and the right click stays inert as it always did.
   *
   * ADR 0015 forbids **offering a dead choice**, not **explaining an absence**: the rose in
   * refusal draws no branch one could click.
   */
  readonly refusal: string | null;
};

type Allegiance = 'mine' | 'enemy' | 'neutral';

function countryAllegiance(country: string, view: PlayerView): Allegiance {
  const nation = NATION_BY_ADM0.get(country);
  if (nation === undefined) return 'neutral';
  if (nation === view.me.nation) return 'mine';
  return view.opponents.some((opponent) => opponent.nation === nation) ? 'enemy' : 'neutral';
}

/**
 * The only cost the game can quantify today. The steel and duration of a founding exist
 * nowhere — displaying them would mean inventing them.
 */
function slotCost(view: PlayerView): string {
  const free = view.me.slots.total - view.me.slots.used;
  return fr.compass.slotsCost(free);
}

const viewCountry = (country: string): CompassAction => ({
  key: 'view',
  pictogram: 'cabin',
  label: fr.compass.seeCountry,
  cost: null,
  consequence: fr.compass.seeCountryConsequence(countryLabel(country)),
  country,
});

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
  recall: 'anchor',
  agent: 'helmet',
  decoy: 'silhouette',
  return: 'anchor',
};

const march = (type: MovementType, aim: MovementAim, view: PlayerView): CompassAction => ({
  key: 'aim',
  pictogram: AIM_PICTOGRAM[type],
  label: fr.movementTypes[type],
  cost: slotCost(view),
  /** **The forfait is not quantified here, and that is deliberate**: the figure lives in
   *  `convex/constants.ts` with every other balance number, and the domain does not read it
   *  (ADR 0016, the layering of `CLAUDE.md`). The aiming card says it, one gesture later, at the
   *  moment it is a price rather than a warning. */
  consequence:
    type === 'decoy'
      ? fr.compass.decoyConsequence
      : fr.compass.marchConsequence(fr.movementTypes[type]),
  aim,
  type,
});

/**
 * The crane, and the crane only where something can actually go up. **Nothing greyed out,
 * ever**: on enemy ground or out of reach it is simply not in the fan — what a player cannot
 * do teaches him nothing, and that is the fog's rule as much as the menu's.
 *
 * A ceiling reached does not withdraw it: that block is a circumstance, the panel keeps the
 * lines and names the remedy. A crane vanishing five minutes after it was there reads as a
 * bug, not as a rule.
 */
const buildOn = (target: Extract<CompassTarget, { kind: 'region' }>): CompassAction => ({
  key: 'build',
  pictogram: 'crane',
  label: fr.compass.build,
  cost: null,
  consequence: fr.compass.buildConsequence(target.name),
  regionId: target.id,
  regionName: target.name,
});

/**
 * A target's compass, or `null` when there is nothing to say — the right click then stays inert
 * rather than opening an empty fan.
 *
 * `column` is what the player has armed from a garrison. Given, the board is **in aim** and the
 * fan holds nothing but marches; the ordinary actions step aside, because a right click while
 * aiming means "this one, and how" and nothing else. Aiming, `null` is reserved for the targets
 * one does not march at — a whole country, a column in flight; everywhere a march could have
 * been asked for, the rose opens, branches or motive.
 */
export function compassOf(
  target: CompassTarget,
  view: PlayerView,
  column: Column | null = null,
): Compass | null {
  if (column !== null) return aim(target, view, column);
  const fan = build(target, view);
  return fan.actions.length === 0 ? null : { ...fan, refusal: null };
}

/**
 * The aiming fan. A **country** carries none — a whole country is not a place one walks to — and
 * it no longer needs to: above the fade-in threshold the right click lands on a point, which is
 * a place at every scale. The state "I am aiming and nothing answers" is what that removes.
 *
 * **A march is aimed at a point or at an outpost, and at nothing else.** The region stopped
 * being an aim of its own the day founding stopped being a march: one no longer walks *at*
 * ground to plant a point there, one plants it where one already stands (`foundOutpostHere`).
 * What is left aims at places — which is what ADR 0019 §1 says a movement does. Aiming, the map
 * hands back a point at every scale, so no region target ever reaches here.
 */
function aim(target: CompassTarget, view: PlayerView, column: Column): Compass | null {
  if (target.kind === 'outpost') {
    return fanOf(target.name, view, column, [
      { kind: 'outpost', outpostId: target.id, hostCountry: target.hostCountry },
    ]);
  }
  if (target.kind !== 'point') return null;
  /**
   * The arrival reads what stands within `ARRIVAL_RADIUS_KM` of where the column stopped
   * (`defenceNear`, `convex/movements.ts`), so the destination is the place the player pointed
   * at and nothing rounds it to a centroid.
   */
  return fanOf(target.name, view, column, [{ kind: 'point', lon: target.lon, lat: target.lat }]);
}

/**
 * One branch per legal type, and never two for the same type: the first aim that legalises a type
 * is the one it marches with, so a point and the region under it cannot both offer an attack.
 *
 * No legal type at all is not a reason to keep quiet: the fan comes back empty and carrying the
 * motive, which is the whole of the refusal state.
 */
function fanOf(
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
   * **The motive is about the marches, and the decoy is not one.** A feint asks nothing of the
   * pile — it carries none — so it stands on ground a hull with no quay cannot leave, and a fan
   * holding nothing but the feint is a fan whose marches were all refused. Reading the motive
   * off `actions.length` would have swallowed it the day the decoy landed, and the player would
   * have watched his marches vanish with no sentence to say why.
   */
  const marches = actions.filter((action) => action.key === 'aim' && action.type !== 'decoy');
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
  'NO_AIRFIELD_AT_DEPARTURE',
  'NO_PORT_AT_DEPARTURE',
  'NOT_ENOUGH_LIFT',
  'INFANTRY_ONLY',
  'FRIENDLY_TARGET',
  'OUTPOST_TARGET_ONLY',
  'POINT_TARGET_ONLY',
  'NOT_ORDERABLE',
];

/**
 * The refusal in the **same words the server would use**: the sentence is written once, in
 * `fr.errors`, and the rose borrows it rather than paraphrasing it — a player must not read one
 * thing before the click and another after it.
 */
function refusalIn(aims: ReadonlyArray<MovementAim>, column: Column): string | null {
  const met = new Set(
    aims.flatMap((aimed) =>
      ORDERABLE_TYPES.filter((type) => type !== 'decoy').map((type) =>
        refusalOf(type, aimed, column),
      ),
    ),
  );
  const code = REFUSAL_PRIORITY.find((candidate) => met.has(candidate));
  if (code === undefined) return null;
  return fr.errors[code](code === 'NOT_ENOUGH_LIFT' ? { ...liftOf(column.roles) } : {});
}

function build(target: CompassTarget, view: PlayerView): Fan {
  switch (target.kind) {
    case 'region': {
      // The country's fan, plus one branch. A region is the same land seen closer: taking
      // away what the country offered would make zooming in cost the player actions.
      const country = build({ kind: 'country', country: target.country }, view);
      const buildable = buildOptionsAt(view, target.id, view.loadedAt).length > 0;
      return {
        kicker: fr.compass.region(country.name),
        name: target.name,
        actions: [...(buildable ? [buildOn(target)] : []), ...country.actions],
      };
    }
    case 'country': {
      const allegiance = countryAllegiance(target.country, view);
      const held = view.me.outposts.some((outpost) => outpost.hostCountry === target.country);
      return {
        kicker:
          allegiance === 'neutral'
            ? held
              ? fr.compass.neutralHeld
              : fr.compass.neutralFree
            : allegiance === 'mine'
              ? fr.compass.myTerritory
              : fr.compass.enemyNation,
        name: countryLabel(target.country),
        actions: [viewCountry(target.country)],
      };
    }
    case 'outpost':
      return {
        kicker: fr.compass.outpostAt(countryLabel(target.hostCountry)),
        name: target.name,
        actions: [viewCountry(target.hostCountry)],
      };
    /**
     * A column on the map is a movement in flight, and **a movement in flight takes no order**:
     * the fan says where it is, never what to do with it. The irreversibility is the game's
     * thesis, not an interface limitation (decision 13a).
     */
    case 'force':
      return {
        kicker: fr.compass.myForce(target.headcount),
        name: target.name,
        actions: target.country === null ? [] : [viewCountry(target.country)],
      };
    /**
     * Unarmed, a point is just the land under it: one builds on a region and looks at a country,
     * and a coordinate is neither. Over water there is nothing to offer and the fan stays shut,
     * exactly as the open sea does today.
     */
    case 'point':
      return target.country === null
        ? { kicker: fr.compass.openWater, name: target.name, actions: [] }
        : build({ kind: 'country', country: target.country }, view);
  }
}
