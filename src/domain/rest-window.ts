export type TimeWindow = { readonly startMinutes: number; readonly endMinutes: number };

export function parseWindow(window: string): TimeWindow | null {
  const hours = window.match(/(\d{1,2})[h:](\d{2})/g);
  if (!hours || hours.length < 2) return null;
  const toMinutes = (raw: string) => {
    const [hour = '0', minute = '0'] = raw.split(/[h:]/);
    return Number(hour) * 60 + Number(minute);
  };
  return { startMinutes: toMinutes(hours[0]!), endMinutes: toMinutes(hours[1]!) };
}

export function formatWindow({ startMinutes, endMinutes }: TimeWindow): string {
  const hour = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}h${String(minutes % 60).padStart(2, '0')}`;
  return `${hour(startMinutes)} – ${hour(endMinutes)}`;
}

/**
 * **La plage se stocke et se juge en minutes UTC** — un entier, pas de table de fuseaux. Le
 * navigateur lit `Date` à l'heure de Paris, l'isolat Convex la lit en UTC : jugée en heure
 * locale, une plage déclarée « 23h00 » mordait deux heures plus tard que dite, l'été. Ce qui
 * reste local est la déclaration et l'affichage, et la conversion se fait aux deux bords.
 */
export const minutesSinceMidnight = (instant: number): number => {
  const utc = new Date(instant);
  return utc.getUTCHours() * 60 + utc.getUTCMinutes();
};

/** `offsetMinutes` vaut `-new Date().getTimezoneOffset()`, et vient de l'appelant : le domaine
 *  ne lit jamais l'horloge. */
export const toUtcMinutes = (localMinutes: number, offsetMinutes: number): number =>
  (((localMinutes - offsetMinutes) % 1440) + 1440) % 1440;

export const toLocalMinutes = (utcMinutes: number, offsetMinutes: number): number =>
  (((utcMinutes + offsetMinutes) % 1440) + 1440) % 1440;

/**
 * A movement that would arrive during its target's rest window stalls at the border: it only
 * resolves when the window ends. Returns the resolution instant, or `null` when the arrival
 * falls outside the window — resolution then happens on arrival.
 */
export function windowExit(arrivalAt: number, window: TimeWindow): number | null {
  const minutes = minutesSinceMidnight(arrivalAt);
  if (!insideWindow(minutes, window)) return null;
  const wait = (window.endMinutes - minutes + 1440) % 1440;
  return arrivalAt + wait * 60_000;
}

export function insideWindow(minutes: number, window: TimeWindow): boolean {
  const { startMinutes, endMinutes } = window;
  if (startMinutes <= endMinutes) return minutes >= startMinutes && minutes < endMinutes;
  return minutes >= startMinutes || minutes < endMinutes;
}
