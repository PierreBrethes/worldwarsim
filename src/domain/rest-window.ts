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

export const minutesSinceMidnight = (instant: number): number => {
  const local = new Date(instant);
  return local.getHours() * 60 + local.getMinutes();
};

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
