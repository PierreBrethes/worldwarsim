export const asHoursMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;

export const asLocalTime = (instant: number) =>
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
