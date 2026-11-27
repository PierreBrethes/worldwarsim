import { FIRST_STEPS, type FirstStep } from './first-steps';
import { type NextAction, type NextActionKind } from './next-actions';
import { fr } from '@/i18n/fr';

/**
 * **Ce que porte une pastille du bureau** (#713) : une par ligne de « à faire », tirée de la ligne
 * et de rien d'autre. Aucune famille neuve : la liste (`nextActionsOf`) fait foi, la pastille la
 * lit d'un coup d'œil. Le rang (« 1 / 3 ») est celui du clic, que l'interface retient.
 */
export type TodoChip = {
  /** Celui de la ligne : l'interface s'y retrouve pour le rang et le clic. */
  readonly id: string;
  readonly count: number;
  /** Le libellé court, après le chiffre. */
  readonly word: string;
  /** Le chiffre rouge : seule la ligne qui l'est déjà dans la liste (la capture que je perds). */
  readonly alert: boolean;
  /** Le nombre de cibles : le rang « 1 / 3 › » n'est dit qu'au-delà d'une. */
  readonly targets: number;
  /** La fondation se déplie sur place, dans la liste entière : elle ne mène nulle part. */
  readonly unfolds: boolean;
};

const WORD_OF: Readonly<Record<NextActionKind, (count: number) => string>> = fr.nextActions.chip;

const chipOf = (action: NextAction): TodoChip => ({
  id: action.id,
  count: action.count,
  word: WORD_OF[action.kind](action.count),
  alert: action.kind === 'siteUnderCapture',
  targets: action.targets.length,
  unfolds: action.targets[0].kind === 'unfold',
});

export const chipsOf = (actions: ReadonlyArray<NextAction>): ReadonlyArray<TodoChip> =>
  actions.map(chipOf);

/** La pastille des premiers pas : les pas faits sur tous, la consigne courte du pas allumé. */
export type StepChip = {
  readonly progress: string;
  readonly word: string;
  /** La phrase entière du pas, que la liste dit aussi. */
  readonly title: string;
};

export function stepChipOf(
  done: ReadonlyArray<FirstStep>,
  lit: FirstStep,
  outpostFirst: boolean,
): StepChip {
  const key = lit === 'deliver' && outpostFirst ? 'outpost' : lit;
  return {
    progress: fr.firstSteps.progress(done.length, FIRST_STEPS.length),
    word: fr.firstSteps.short[key],
    title: fr.firstSteps.steps[key],
  };
}
