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

export type ArcTiming = {
  readonly minutesLeft: number;
  readonly progress: number;
  readonly borderWait: { readonly resolutionInMinutes: number } | null;
};

export function arcTiming(
  { departedAt, arrivesAt, heldAt, holdUntil }: ArcSchedule,
  now: number,
): ArcTiming {
  if (heldAt !== null) {
    return {
      minutesLeft: 0,
      progress: 1,
      borderWait: { resolutionInMinutes: Math.max(0, (arrivesAt - now) / 60_000) },
    };
  }
  const span = arrivesAt - departedAt;
  return {
    minutesLeft: Math.max(0, (arrivesAt - now) / 60_000),
    progress: span <= 0 ? 1 : Math.min(1, Math.max(0, (now - departedAt) / span)),
    borderWait:
      holdUntil === null ? null : { resolutionInMinutes: Math.max(0, (holdUntil - now) / 60_000) },
  };
}
