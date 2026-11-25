import { useMutation } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { handleError } from '@/data/errors';
import type { Seat } from '@/data/session';
import { keptLevelOf } from '@/domain/construction';
import { worksMinutes } from '@/domain/level-speed';
import { workMinutesLeft, type PlayerView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';

/** Le chantier en tête puis la file, avec ce qui reste à chacun : le temps de la tête se lit
 *  depuis sa date, celui d'une ligne en file est sa durée entière. */
export function worksOf(view: PlayerView, now: number) {
  const head = view.me.construction;
  return [
    ...(head === null ? [] : [{ work: head, running: true as const }]),
    ...view.me.constructionQueue.map((work) => ({ work, running: false as const })),
  ].map(({ work, running }) => {
    const total =
      (running ? work.minutes : undefined) ?? worksMinutes(work.key, work.level, view.me.hqLevel);
    return {
      work,
      running,
      total,
      left: running ? workMinutesLeft(work, view.loadedAt, now) : total,
      /** Figé sous son QG désactivé (ADR 0046 §8) : il a commencé, mais ne décompte pas. */
      frozen: running && 'frozen' in work && work.frozen === true,
      name: fr.personalBoard.work(
        work.name,
        work.kept === undefined ? work.level : keptLevelOf(work.kept, view.me.hqLevel),
      ),
    };
  });
}

/** Une ligne en file se retire et se rembourse (`constructions.cancel`) ; son refus se dit. */
export function useCancelWork(seat: Seat, onSpent: () => void) {
  const drop = useMutation(api.constructions.cancel);
  const [error, setError] = useState<string | null>(null);
  const cancel = (id: string) => {
    setError(null);
    drop({ ...seat, constructionId: id as Id<'constructions'> }).then(onSpent, (problem: unknown) =>
      handleError(problem, setError),
    );
  };
  return { cancel, error };
}
