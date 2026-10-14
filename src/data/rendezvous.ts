import { REMINDER_MINUTES } from '@/domain/operation-order';

const stamp = (at: number): string =>
  new Date(at)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** **Le rendez-vous à l'agenda** : un fichier `.ics` écrit ici, en UTC — chaque agenda le lit
 *  dans l'heure de son propriétaire. Deux heures, et le même rappel que la notification. */
export function downloadRendezvous({
  at,
  title,
  code,
}: {
  at: number;
  title: string;
  code: string;
}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//La Manchette//FR',
    'BEGIN:VEVENT',
    `UID:${code}-${String(at)}@la-manchette`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(at)}`,
    `DTEND:${stamp(at + 2 * 3_600_000)}`,
    `SUMMARY:${title}`,
    `URL:${window.location.origin}/rejoindre/${code}`,
    'BEGIN:VALARM',
    `TRIGGER:-PT${String(REMINDER_MINUTES)}M`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${title}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  link.download = `${code}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
}
