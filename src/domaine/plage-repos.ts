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

export function dansLaPlage(minutesDepuisMinuit: number, plage: PlageHoraire): boolean {
  const { debutMinutes, finMinutes } = plage;
  if (debutMinutes <= finMinutes) {
    return minutesDepuisMinuit >= debutMinutes && minutesDepuisMinuit < finMinutes;
  }
  return minutesDepuisMinuit >= debutMinutes || minutesDepuisMinuit < finMinutes;
}
