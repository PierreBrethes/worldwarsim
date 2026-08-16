export const asHoursMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;

/**
 * A countdown refreshed every second but displayed to the minute looks frozen: the timeline
 * needs seconds, panels showing a distant due time do not want them.
 */
export function asHoursMinutesSeconds(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const twoDigits = (value: number) => String(value).padStart(2, '0');
  return `${twoDigits(Math.floor(total / 3600))}:${twoDigits(Math.floor(total / 60) % 60)}:${twoDigits(total % 60)}`;
}

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
