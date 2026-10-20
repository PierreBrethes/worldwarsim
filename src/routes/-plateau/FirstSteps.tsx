import { useMutation } from 'convex/react';
import { useEffect, useRef } from 'react';
import { api } from '../../../convex/_generated/api';
import { handleError } from '@/data/errors';
import type { Seat } from '@/data/session';
import { notify } from '@/shell/notifications';
import {
  FIRST_STEPS,
  cueOf,
  firstStepsApply,
  litStepOf,
  outpostFirst,
  stepsDoneIn,
  type FirstStep,
  type FirstStepCue,
  type FirstStepsShown,
} from '@/domain/first-steps';
import type { PlayerView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';

export type FirstStepsState = {
  readonly done: ReadonlyArray<FirstStep>;
  readonly shown: FirstStepsShown;
  /** The step to do now; `null` once all five are done. */
  readonly lit: FirstStep | null;
  readonly cue: FirstStepCue | null;
  /** Sans avant-poste, la livraison commence par en fonder un : le pas le dit. */
  readonly outpostFirst: boolean;
  readonly show: (shown: FirstStepsShown) => void;
};

/**
 * **Les premiers pas d'une Mondiale** (ADR 0027 §2) : la vue dit quels gestes sont faits, la place
 * les retient. `null` en Blitz, pour un observateur et sur une saison conclue : rien n'y apprend.
 */
export function useFirstSteps(view: PlayerView, seat: Seat): FirstStepsState | null {
  const check = useMutation(api.firstSteps.check);
  const showOn = useMutation(api.firstSteps.show);
  const off = !firstStepsApply(view);
  const { done, shown } = view.firstSteps;
  /** Ce qui est parti et pas encore revenu dans la vue : une seule écriture par pas. */
  const sent = useRef(new Set<FirstStep>());
  const freshKey = off
    ? ''
    : stepsDoneIn(view)
        .filter((step) => !done.includes(step))
        .join();

  useEffect(() => {
    const steps = (freshKey === '' ? [] : (freshKey.split(',') as FirstStep[])).filter(
      (step) => !sent.current.has(step),
    );
    if (steps.length === 0) return;
    for (const step of steps) sent.current.add(step);
    check({ ...seat, steps }).catch((error: unknown) => {
      for (const step of steps) sent.current.delete(step);
      handleError(error, (said) => notify(said));
    });
  }, [freshKey, check, seat]);

  if (off) return null;
  const lit = litStepOf(done);
  return {
    done,
    shown,
    lit,
    cue: lit === null || shown === 'skipped' ? null : cueOf(lit, view),
    outpostFirst: outpostFirst(view),
    show: (next) =>
      void showOn({ ...seat, shown: next }).catch((error: unknown) =>
        handleError(error, (said) => notify(said)),
      ),
  };
}

/**
 * **La liste, en tête de « à faire »** : cinq gestes, le fait coché, celui du moment allumé et
 * menant où il se fait, les suivants à l'encre légère. Elle se replie sur son titre ou se passe ;
 * l'aide la reprend.
 */
export function FirstStepsList({
  steps,
  onLead,
}: {
  steps: FirstStepsState;
  /** Mène au geste du pas allumé : le plateau personnel, ou la pièce sur la carte. */
  onLead: () => void;
}) {
  const folded = steps.shown === 'folded';
  const labelOf = (step: FirstStep): string =>
    step === 'deliver' && steps.outpostFirst
      ? fr.firstSteps.steps.outpost
      : fr.firstSteps.steps[step];
  return (
    <section
      aria-label={fr.firstSteps.header}
      className="border-b-2 border-[var(--ink)] bg-(--arc-mine)/10"
    >
      {/* Le titre replie la liste : le « replier » de la carte, juste au-dessus, est déjà pris. */}
      <div className="flex items-baseline gap-3 px-[13px] pt-[8px] pb-[6px]">
        <button
          type="button"
          aria-expanded={!folded}
          title={folded ? fr.firstSteps.unfold : fr.firstSteps.fold}
          onClick={() => steps.show(folded ? 'open' : 'folded')}
          className="eyebrow min-w-0 flex-1 cursor-pointer text-left"
        >
          <span aria-hidden className="mr-[5px]">
            {folded ? '▸' : '▾'}
          </span>
          {fr.firstSteps.header}{' '}
          <span className="font-(family-name:--font-mono) tracking-normal">
            {fr.firstSteps.progress(steps.done.length, FIRST_STEPS.length)}
          </span>
        </button>
        <button type="button" onClick={() => steps.show('skipped')} className={LINK}>
          {fr.firstSteps.skip}
        </button>
      </div>
      {!folded && (
        <ol className="pb-[6px]">
          {FIRST_STEPS.map((step) =>
            step === steps.lit ? (
              <li key={step}>
                <button
                  type="button"
                  onClick={onLead}
                  className="flex w-full cursor-pointer items-baseline gap-2 border-l-[3px] border-[var(--arc-mine)] px-[10px] py-[6px] text-left hover:bg-(--ink)/7"
                >
                  <span className="min-w-0 flex-1 text-[13px] leading-[1.25] font-semibold">
                    {labelOf(step)}
                  </span>
                  <span className="shrink-0 text-[10px] tracking-[.12em] text-[var(--ink-soft)] uppercase">
                    {steps.cue?.kind === 'map'
                      ? fr.nextActions.toMap
                      : fr.nextActions.toPersonalBoard}{' '}
                    ›
                  </span>
                </button>
              </li>
            ) : (
              <li
                key={step}
                className={`flex gap-2 px-[13px] py-[3px] text-[12px] leading-[1.3] ${
                  steps.done.includes(step)
                    ? 'text-[var(--ink-soft)] line-through decoration-(--ink)/40'
                    : 'text-[var(--ink-soft)]'
                }`}
              >
                <span aria-hidden className="w-[10px] shrink-0 no-underline">
                  {steps.done.includes(step) ? '✓' : '·'}
                </span>
                <span>
                  {steps.done.includes(step) && (
                    <span className="sr-only">{fr.firstSteps.doneLabel} </span>
                  )}
                  {labelOf(step)}
                </span>
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  );
}

const LINK =
  'cursor-pointer font-(family-name:--font-mono) text-[10.5px] tracking-[.12em] text-[var(--ink)] uppercase underline-offset-2 hover:underline';
