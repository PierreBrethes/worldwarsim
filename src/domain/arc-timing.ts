import type { ArcView } from './player-view';

/**
 * Where a column stands and what it still owes, from the four dates the server keeps on it.
 *
 * **Une arrivée retenue n'est pas une arrivée repoussée.** Quand la plage de repos de l'hôte
 * mord, le serveur repousse `arrivesAt` à la sortie de la plage : lu comme une date d'arrivée
 * ordinaire, ce report renvoie le pion à 5 % du trajet avec sept heures de marche devant lui.
 * `heldAt` est la trace de la retenue, et c'est elle qui décide : la colonne est au bout du fil,
 * elle ne marche plus, et `arrivesAt` ne date plus qu'une passe de résolution.
 */
export type ArcSchedule = {
  readonly departedAt: number;
  readonly arrivesAt: number;
  readonly heldAt: number | null;
  readonly holdUntil: number | null;
};

const share = (from: number, to: number, now: number): number =>
  to <= from ? 1 : Math.min(1, Math.max(0, (now - from) / (to - from)));

/** The share of my column's thread walked at `now`; a column held at the border is at its end. */
export const shareWalked = ({ departedAt, arrivesAt, heldAt }: ArcSchedule, now: number): number =>
  heldAt !== null ? 1 : share(departedAt, arrivesAt, now);

/** When a rest window lets my column go: held, the pass that resolves it; walking towards a
 *  known window, its close; `null` when nothing bites. */
export const borderResolution = ({ arrivesAt, heldAt, holdUntil }: ArcSchedule): number | null =>
  heldAt !== null ? arrivesAt : holdUntil;

/**
 * **Where the pawn stands at `now`** (#183): the arc carries instants and keeps its identity
 * from one answer to the next, so the hour is read here, by whoever draws, every frame. A
 * sighting is paced on its watch window — the thread is the watched stretch — and a last known
 * position stays at its end.
 */
export function arcProgressAt(arc: ArcView, now: number): number {
  switch (arc.state) {
    case 'mine':
      return shareWalked(arc.schedule, now);
    case 'enemyDetected':
      return share(arc.since, arc.seenTo, now);
    case 'lastKnown':
      return 1;
    case 'seaControl':
      return arc.progress;
  }
}
