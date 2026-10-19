import { searcherLevel } from './research';
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

/** What the bubble says, named here and worded in `fr.firstSteps.cue`. */
export type CueSay =
  'hq' | 'move' | 'tiles' | 'pieces' | 'center' | 'research' | 'truck' | 'load' | 'outpost';

/** Where the bubble stands — over a rack of the personal board, or under a piece on the map —
 *  and what it says there. */
export type FirstStepCue =
  | { readonly kind: 'rack'; readonly rack: 'tiles' | 'pieces' | 'research'; readonly say: CueSay }
  | { readonly kind: 'piece'; readonly station: TroopStation; readonly say: CueSay };

const filled = (load: Readonly<Record<string, number>> | undefined): boolean =>
  load !== undefined && Object.values(load).some((amount) => amount > 0);

/**
 * **The steps this view shows done** — in what is under way, and in the durable trace each
 * gesture leaves, so that a place already played checks its steps on the first look: a troop
 * stood away from the headquarters has moved, a troop other than the gift company was formed,
 * a depot holding something or a delivery told in the journal was delivered.
 */
export function stepsDoneIn(view: PlayerView): ReadonlyArray<FirstStep> {
  const { me } = view;
  const mine = view.arcs.flatMap((arc) => (arc.state === 'mine' ? [arc] : []));
  const hqIds = new Set(
    me.buildings.flatMap((building) => (building.key === 'hq' ? [building.id] : [])),
  );
  const seen: Readonly<Record<FirstStep, boolean>> = {
    hq: me.hqLevel > 0,
    move:
      mine.some((arc) => arc.type !== 'return') ||
      me.troops.some(
        ({ stationedAt: at }) =>
          at.kind === 'point' ||
          at.kind === 'outpost' ||
          (at.kind === 'building' && !hqIds.has(at.buildingId)),
      ),
    form:
      me.recruiting.length > 0 ||
      me.troops.length > 1 ||
      me.troops.some((troop) => troop.role !== 'infantry' || troop.tier !== 1),
    research: me.research.running !== null || me.research.researched.length > 0,
    deliver:
      mine.some((arc) => arc.delivery === true) ||
      me.outposts.some((outpost) => filled(outpost.depot)) ||
      view.journal.some((dispatch) => dispatch.kind === 'supplyDelivered'),
  };
  return FIRST_STEPS.filter((step) => seen[step]);
}

export const litStepOf = (done: ReadonlyArray<FirstStep>): FirstStep | null =>
  FIRST_STEPS.find((step) => !done.includes(step)) ?? null;

/** Nothing to learn in a Blitz, for an observer, or in a concluded season. */
export const firstStepsApply = (view: PlayerView): boolean =>
  view.mode !== 'blitz' && !view.me.defeated && view.season.outcome.concludedAt === null;

/** **The step on show** — the one lit, while the list is neither passed nor finished. */
export const shownStepOf = (view: PlayerView): FirstStep | null =>
  firstStepsApply(view) && view.firstSteps.shown !== 'skipped'
    ? litStepOf(view.firstSteps.done)
    : null;

/** Without an outpost of mine, the delivery begins by founding one. */
export const outpostFirst = (view: PlayerView): boolean => view.me.outposts.length === 0;

const PROJECTION_KEYS: ReadonlySet<string> = new Set(Object.values(PROJECTION_BY_DOMAIN));

/** Where the gesture of a step is made, as this view allows it; `null` when nothing on the
 *  board can take it yet (no troop to lift). */
export function cueOf(step: FirstStep, view: PlayerView): FirstStepCue | null {
  const marching = marchingTroopIds(view.arcs);
  const standing = (wanted: (troop: TroopView) => boolean) =>
    view.me.troops.find(
      (troop) => wanted(troop) && !marching.has(troop.id) && troop.stationedAt.kind !== 'home',
    );
  const onPiece = (troop: TroopView | undefined, say: CueSay): FirstStepCue | null =>
    troop === undefined ? null : { kind: 'piece', station: troop.stationedAt, say };
  switch (step) {
    case 'hq':
      return { kind: 'rack', rack: 'tiles', say: 'hq' };
    case 'move':
      return onPiece(
        standing(() => true),
        'move',
      );
    case 'form':
      return view.me.buildings.some((building) => PROJECTION_KEYS.has(building.key))
        ? { kind: 'rack', rack: 'pieces', say: 'pieces' }
        : { kind: 'rack', rack: 'tiles', say: 'tiles' };
    case 'research':
      return searcherLevel(view.me.buildings) !== null
        ? { kind: 'rack', rack: 'research', say: 'research' }
        : { kind: 'rack', rack: 'tiles', say: 'center' };
    case 'deliver': {
      if (outpostFirst(view))
        return onPiece(
          standing(() => true),
          'outpost',
        );
      const truck = standing((troop) => loadCapacityOf(troop.role) > 0);
      return truck === undefined
        ? { kind: 'rack', rack: 'pieces', say: 'truck' }
        : onPiece(truck, 'load');
    }
  }
}
