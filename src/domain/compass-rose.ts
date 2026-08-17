import { fr, nationLabel } from '@/i18n/fr';
import { buildOptionsAt } from './construction';
import { legalMovementTypes, type Column, type MovementAim } from './movement-orders';
import { NATION_BY_COUNTRY } from './nations';
import type { MovementType } from './ids';
import type { PlayerView } from './player-view';

/**
 * What the right click touched. A discriminated union rather than an object with optional
 * fields: a force has no declared host country — picking says which land it stands on — and
 * an outpost always has one.
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
  | { readonly kind: 'region'; readonly id: string; readonly name: string; readonly country: string }
  | { readonly kind: 'outpost'; readonly id: string; readonly hostCountry: string; readonly name: string }
  | {
      readonly kind: 'force';
      readonly id: string;
      readonly country: string | null;
      readonly name: string;
      readonly headcount: number;
    };

/**
 * The six pictograms of the radial menu plate. Three mark nothing yet — the crane awaits
 * economy v2, the helmet the agent, the rifles the force sheet — and are declared here so
 * that when the day comes there is only wiring to write, never a drawing to find.
 */
export type CompassPictogram =
  | 'cabin'
  | 'crane'
  | 'anchor'
  | 'helmet'
  | 'propeller'
  | 'rifles'
  | 'pennant';

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

export type Compass = {
  /** The tooltip's context line: the target's nature and qualification. */
  readonly kicker: string;
  readonly name: string;
  readonly actions: ReadonlyArray<CompassAction>;
};

type Allegiance = 'mine' | 'enemy' | 'neutral';

function countryAllegiance(country: string, view: PlayerView): Allegiance {
  const nation = NATION_BY_COUNTRY.get(country);
  if (nation === undefined) return 'neutral';
  if (nation === view.me.nation) return 'mine';
  return view.opponents.some((opponent) => opponent.nation === nation) ? 'enemy' : 'neutral';
}

/** The tooltip names the nation when the map country carries one, the country otherwise. */
const countryName = (country: string): string => {
  const nation = NATION_BY_COUNTRY.get(country);
  return nation === undefined ? country : nationLabel(nation);
};

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
  consequence: fr.compass.seeCountryConsequence(countryName(country)),
  country,
});

/**
 * The pictogram plate of the aiming fan, taken from the mockup: the crossed rifles for the
 * assault, the pennant for the raid, the cabin for a point planted. The three the game cannot
 * order yet are here so the day they land there is a branch to fill, never a drawing to find.
 */
const AIM_PICTOGRAM: Readonly<Record<MovementType, CompassPictogram>> = {
  attack: 'rifles',
  raid: 'pennant',
  outpost: 'cabin',
  agent: 'helmet',
  decoy: 'propeller',
  return: 'anchor',
};

const march = (type: MovementType, aim: MovementAim, view: PlayerView): CompassAction => ({
  key: 'aim',
  pictogram: AIM_PICTOGRAM[type],
  label: fr.movementTypes[type],
  cost: slotCost(view),
  consequence: fr.compass.marchConsequence(fr.movementTypes[type]),
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
 * A target's compass, or `null` when no action leads anywhere — the right click then stays
 * inert rather than opening an empty fan.
 *
 * `column` is what the player has armed from a garrison. Given, the board is **in aim** and the
 * fan holds nothing but marches; the ordinary actions step aside, because a right click while
 * aiming means "this one, and how" and nothing else.
 */
export function compassOf(
  target: CompassTarget,
  view: PlayerView,
  column: Column | null = null,
): Compass | null {
  const compass = column === null ? build(target, view) : aim(target, view, column);
  return compass === null || compass.actions.length === 0 ? null : compass;
}

/**
 * The aiming fan. A **country** carries none: the server marches at a region or at an outpost,
 * and a whole country is not a place one can walk to — beyond the regions' fade-in threshold
 * the player has to come closer before he can aim.
 */
function aim(target: CompassTarget, view: PlayerView, column: Column): Compass | null {
  if (target.kind !== 'region' && target.kind !== 'outpost') return null;
  const aimed: MovementAim =
    target.kind === 'region'
      ? { kind: 'region', regionId: target.id, country: target.country }
      : { kind: 'outpost', outpostId: target.id, hostCountry: target.hostCountry };

  return {
    kicker: fr.compass.aiming(column.roles.length),
    name: target.name,
    actions: legalMovementTypes(aimed, column).map((type) => march(type, aimed, view)),
  };
}

function build(target: CompassTarget, view: PlayerView): Compass {
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
        name: countryName(target.country),
        actions: [viewCountry(target.country)],
      };
    }
    case 'outpost':
      return {
        kicker: fr.compass.outpostAt(countryName(target.hostCountry)),
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
  }
}
