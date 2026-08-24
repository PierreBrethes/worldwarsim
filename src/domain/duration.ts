/**
 * **Une durée se lit à la seconde.** Le jeu est asynchrone, pas immobile : un chantier à
 * « 00:12 » qui ne bouge pas d'une minute entière se lit comme une horloge arrêtée, alors que
 * toutes les surfaces qui l'affichent battent déjà à la seconde (`useClock`, et la lampe des
 * étiquettes de carte). Le format porte donc les trois champs partout, y compris quand la
 * source est une durée ronde — un devis à « 02:00:00 » est bavard, une horloge qui ment ne
 * l'est pas.
 *
 * Plancher plutôt qu'arrondi : un compte à rebours doit finir à 00:00:00, pas y sauter une
 * seconde trop tôt.
 */
export const asDuration = (minutes: number) => {
  const total = Math.max(0, Math.floor(minutes * 60));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

export const asLocalTime = (instant: number) =>
  new Date(instant).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/**
 * A due time far enough out that the hour alone would be ambiguous — a lot of a thousand
 * munitions runs for a fortnight, and "à 09 h" without a date is a lie by omission.
 */
export const asDayAndTime = (instant: number) =>
  new Date(instant).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
