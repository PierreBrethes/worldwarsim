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

/**
 * **Le compte à rebours plié** : « 1:29 », heures et minutes, là où il n'y a pas la place de
 * trois champs — la colonne « En cours » repliée, le coin d'une entrée de la barre de pied.
 * L'horloge complète est un toucher plus loin, et c'est elle qui bat à la seconde.
 */
export const asShortDuration = (minutes: number) => {
  const total = Math.max(0, Math.floor(minutes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const asLocalTime = (instant: number) =>
  new Date(instant).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/**
 * **L'heure ronde, sans les secondes** : une échéance qu'on attend sans la regarder tourner — le
 * retour d'un avant-poste hors service, qui se compte en heures. Les secondes y seraient une
 * précision que personne n'utilise et une horloge de plus à faire battre.
 */
export const asClockTime = (instant: number) =>
  new Date(instant).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

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

/**
 * **Une date de presse, pas une ancienneté.** Le relevé d'une région se lit « relevé du 12 août »
 * et jamais « il y a 17 h » : la carte est un document d'état-major de 1940, et un document porte
 * la date à laquelle il a été dressé. L'ancienneté, elle, se voit déjà — c'est le délavage de la
 * teinte (ADR 0020 §5), en permanence et sans survol.
 */
export const asPressDate = (instant: number) =>
  new Date(instant).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

export const reloadClock = (ms: number): string => {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
