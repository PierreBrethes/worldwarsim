export type RegionJouable = 'Europe' | 'Europe + Méditerranée + Moyen-Orient' | 'Monde';

export function regionJouable(nombreDeJoueurs: number): RegionJouable {
  if (nombreDeJoueurs <= 3) return 'Europe';
  if (nombreDeJoueurs <= 6) return 'Europe + Méditerranée + Moyen-Orient';
  return 'Monde';
}

const ALPHABET_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function codeDePartie(aleatoire: () => number): string {
  return Array.from({ length: 6 }, () => ALPHABET_CODE[Math.floor(aleatoire() * ALPHABET_CODE.length)]).join('');
}

export function stockAccumule(
  { stock, tauxParHeure, majLe }: { stock: number; tauxParHeure: number; majLe: number },
  maintenant: number,
  plafond?: number,
): number {
  const heures = Math.max(0, maintenant - majLe) / 3_600_000;
  const brut = stock + tauxParHeure * heures;
  return plafond === undefined ? brut : Math.min(plafond, brut);
}
