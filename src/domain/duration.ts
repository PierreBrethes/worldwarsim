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

/** One formatter per shape, built once: `toLocaleTimeString` builds one per call, and a server
 *  answer dates every camp and every dispatch of the journal (#183). */
const LOCAL_TIME = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const CLOCK_TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const asLocalTime = (instant: number) => LOCAL_TIME.format(instant);

/**
 * **L'heure ronde, sans les secondes** : une échéance qu'on attend sans la regarder tourner — le
 * retour d'un avant-poste hors service, qui se compte en heures. Les secondes y seraient une
 * précision que personne n'utilise et une horloge de plus à faire battre.
 */
export const asClockTime = (instant: number) => CLOCK_TIME.format(instant);

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

/**
 * **Une durée qu'on lit, sans qu'elle batte** : « 45 s », « 1 min 30 », « 2 h 48 ». Celle d'une
 * statistique (allure, formation, capture) — le compte à rebours, lui, garde `asDuration`.
 */
export const asSpan = (minutes: number): string => {
  if (minutes < 1) return `${Math.round(minutes * 60)} s`;
  if (minutes < 10 && minutes % 1 !== 0) {
    const whole = Math.floor(minutes);
    const seconds = Math.round((minutes - whole) * 60);
    if (seconds === 60) return `${whole + 1} min`;
    return seconds === 0 ? `${whole} min` : `${whole} min ${String(seconds).padStart(2, '0')}`;
  }
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const total = Math.round(minutes);
  const [hours, rest] = [Math.floor(total / 60), total % 60];
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
};
