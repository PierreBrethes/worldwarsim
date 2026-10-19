import { distanceKm } from './geo';
import { loadCapacityOf } from './logistics';
import type { PlayerView, TroopStation, TroopView } from './player-view';
import { PROJECTION_BY_DOMAIN, marchingTroopIds } from './troops';

/**
 * **Les premiers pas** (ADR 0027 §2) : cinq gestes à faire dans la vraie partie, pas une partie
 * d'essai. Chacun se lit dans l'état qu'il laisse, jamais dans un clic sur « suivant » ; ce qui
 * passe vite (un mouvement arrive, un lot se forme) est retenu par la place une fois vu.
 *
 * L'ordre suit ce qu'une place neuve permet : rien ne bouge avant le QG, qui amène la première
 * troupe ; le transport et l'avant-poste viennent en dernier parce qu'ils demandent le plus.
 */
export const FIRST_STEPS = ['hq', 'move', 'form', 'research', 'deliver'] as const;

export type FirstStep = (typeof FIRST_STEPS)[number];

/** La liste dépliée, repliée sur son titre, ou passée — on la reprend depuis l'aide. */
export type FirstStepsShown = 'open' | 'folded' | 'skipped';

/** What the place keeps: the steps once seen done, and how the list stands. */
export type FirstSteps = {
  readonly done: ReadonlyArray<FirstStep>;
  readonly shown: FirstStepsShown;
};

/** Where the bubble stands: over a rack of the personal board, or over a piece on the map. */
export type FirstStepCue =
  | { readonly kind: 'rack'; readonly rack: 'tiles' | 'pieces' | 'research' }
  | { readonly kind: 'piece'; readonly station: TroopStation };

/** A delivery is a march whose end is one of my outposts: the arc keeps no other trace of it. */
const OUTPOST_REACH_KM = 1;

const loaded = (troop: TroopView | undefined): boolean =>
  troop?.load !== undefined && Object.values(troop.load).some((amount) => amount > 0);

/** The steps this view shows done right now. */
export function stepsDoneIn(view: PlayerView): ReadonlyArray<FirstStep> {
  const { me } = view;
  const mine = view.arcs.flatMap((arc) => (arc.state === 'mine' ? [arc] : []));
  const troopById = new Map(me.troops.map((troop) => [troop.id, troop]));
  const seen: Readonly<Record<FirstStep, boolean>> = {
    hq: me.hqLevel > 0,
    move: mine.some((arc) => arc.type !== 'return' && arc.type !== 'recall'),
    form: me.recruiting.length > 0,
    research: me.research.running !== null || me.research.researched.length > 0,
    deliver: mine.some(
      (arc) =>
        arc.troopIds.some((id) => loaded(troopById.get(id))) &&
        me.outposts.some((outpost) => distanceKm(outpost.lonLat, arc.to) < OUTPOST_REACH_KM),
    ),
  };
  return FIRST_STEPS.filter((step) => seen[step]);
}

export const litStepOf = (done: ReadonlyArray<FirstStep>): FirstStep | null =>
  FIRST_STEPS.find((step) => !done.includes(step)) ?? null;

const PROJECTION_KEYS: ReadonlySet<string> = new Set(Object.values(PROJECTION_BY_DOMAIN));

/** Where the gesture of a step is made, as this view allows it; `null` when nothing on the
 *  board can take it yet (no troop to lift). */
export function cueOf(step: FirstStep, view: PlayerView): FirstStepCue | null {
  const marching = marchingTroopIds(view.arcs);
  const standing = (wanted: (troop: TroopView) => boolean) =>
    view.me.troops.find(
      (troop) => wanted(troop) && !marching.has(troop.id) && troop.stationedAt.kind !== 'home',
    );
  switch (step) {
    case 'hq':
      return { kind: 'rack', rack: 'tiles' };
    case 'move': {
      const troop = standing(() => true);
      return troop === undefined ? null : { kind: 'piece', station: troop.stationedAt };
    }
    case 'form':
      return {
        kind: 'rack',
        rack: view.me.buildings.some((building) => PROJECTION_KEYS.has(building.key))
          ? 'pieces'
          : 'tiles',
      };
    case 'research':
      return { kind: 'rack', rack: 'research' };
    case 'deliver': {
      const truck = standing((troop) => loadCapacityOf(troop.role) > 0);
      return truck === undefined
        ? { kind: 'rack', rack: 'pieces' }
        : { kind: 'piece', station: truck.stationedAt };
    }
  }
}
