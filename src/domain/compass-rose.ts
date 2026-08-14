import { fr, nationLabel } from '@/i18n/fr';
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
export type CompassPictogram = 'cabin' | 'crane' | 'anchor' | 'helmet' | 'propeller' | 'rifles';

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
  | {
      readonly key: 'send';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly destination: string | null;
      readonly type: MovementType | null;
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

const sendMovement = (destination: string | null, view: PlayerView): CompassAction => ({
  key: 'send',
  pictogram: 'propeller',
  label: fr.compass.sendMovement,
  cost: slotCost(view),
  consequence:
    destination === null
      ? fr.compass.sendConsequenceBlank
      : fr.compass.sendConsequenceTo(countryName(destination)),
  destination,
  type: null,
});

const foundOutpost = (destination: string, view: PlayerView): CompassAction => ({
  key: 'send',
  pictogram: 'anchor',
  label: fr.compass.foundOutpost,
  cost: slotCost(view),
  consequence: fr.compass.foundConsequence(countryName(destination)),
  destination,
  type: 'outpost',
});

/**
 * A target's compass, or `null` when no action leads anywhere — the right click then stays
 * inert rather than opening an empty fan.
 */
export function compassOf(target: CompassTarget, view: PlayerView): Compass | null {
  const compass = build(target, view);
  return compass.actions.length === 0 ? null : compass;
}

function build(target: CompassTarget, view: PlayerView): Compass {
  switch (target.kind) {
    case 'country': {
      const allegiance = countryAllegiance(target.country, view);
      const held = view.me.outposts.some((outpost) => outpost.hostCountry === target.country);
      const foundable = allegiance === 'neutral' && !held;
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
        actions: [
          ...(foundable ? [foundOutpost(target.country, view)] : []),
          viewCountry(target.country),
        ],
      };
    }
    case 'outpost':
      return {
        kicker: fr.compass.outpostAt(countryName(target.hostCountry)),
        name: target.name,
        actions: [viewCountry(target.hostCountry)],
      };
    case 'force': {
      const atHome = target.country !== null && countryAllegiance(target.country, view) === 'mine';
      return {
        kicker: fr.compass.myForce(target.headcount),
        name: target.name,
        actions: [
          sendMovement(atHome ? null : target.country, view),
          ...(target.country === null ? [] : [viewCountry(target.country)]),
        ],
      };
    }
  }
}
