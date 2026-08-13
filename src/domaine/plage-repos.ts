export type PlageHoraire = { readonly debutMinutes: number; readonly finMinutes: number };

export function lirePlage(plage: string): PlageHoraire | null {
  const heures = plage.match(/(\d{1,2})[h:](\d{2})/g);
  if (!heures || heures.length < 2) return null;
  const enMinutes = (brut: string) => {
    const [heure = '0', minute = '0'] = brut.split(/[h:]/);
    return Number(heure) * 60 + Number(minute);
  };
  return { debutMinutes: enMinutes(heures[0]!), finMinutes: enMinutes(heures[1]!) };
}

export function formaterPlage({ debutMinutes, finMinutes }: PlageHoraire): string {
  const heure = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}h${String(minutes % 60).padStart(2, '0')}`;
  return `${heure(debutMinutes)} – ${heure(finMinutes)}`;
}

export const minutesDepuisMinuit = (instant: number): number => {
  const local = new Date(instant);
  return local.getHours() * 60 + local.getMinutes();
};

/**
 * Un mouvement qui arriverait pendant la plage de repos de sa cible s'immobilise à la
 * frontière : il ne se résout qu'à la sortie de plage. Rend l'instant de résolution, ou
 * `null` quand l'arrivée tombe hors plage — la résolution a lieu à l'arrivée.
 */
export function sortieDePlage(arriveeA: number, plage: PlageHoraire): number | null {
  const minutes = minutesDepuisMinuit(arriveeA);
  if (!dansLaPlage(minutes, plage)) return null;
  const attente = (plage.finMinutes - minutes + 1440) % 1440;
  return arriveeA + attente * 60_000;
}

export function dansLaPlage(minutes: number, plage: PlageHoraire): boolean {
  const { debutMinutes, finMinutes } = plage;
  if (debutMinutes <= finMinutes) return minutes >= debutMinutes && minutes < finMinutes;
  return minutes >= debutMinutes || minutes < finMinutes;
}
