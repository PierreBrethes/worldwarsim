export const enHeuresMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;

/**
 * Un compte à rebours rafraîchi à la seconde et affiché à la minute paraît figé : la frise
 * a besoin des secondes, les panneaux qui donnent une échéance lointaine n'en veulent pas.
 */
export function enHeuresMinutesSecondes(millisecondes: number): string {
  const total = Math.max(0, Math.floor(millisecondes / 1000));
  const deuxChiffres = (valeur: number) => String(valeur).padStart(2, '0');
  return `${deuxChiffres(Math.floor(total / 3600))}:${deuxChiffres(Math.floor(total / 60) % 60)}:${deuxChiffres(total % 60)}`;
}

export const enHeureLocale = (instant: number) =>
  new Date(instant).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
