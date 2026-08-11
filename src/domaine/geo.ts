export type LonLat = readonly [lon: number, lat: number];

const RAYON_TERRE_KM = 6371;
const enRadians = (degres: number) => (degres * Math.PI) / 180;

export function ecartLongitudeLePlusCourt(lonA: number, lonB: number): number {
  const brut = lonB - lonA;
  if (brut > 180) return brut - 360;
  if (brut < -180) return brut + 360;
  return brut;
}

export function distanceKm(a: LonLat, b: LonLat): number {
  const dLat = enRadians(b[1] - a[1]);
  const dLon = enRadians(ecartLongitudeLePlusCourt(a[0], b[0]));
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(enRadians(a[1])) * Math.cos(enRadians(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.sqrt(h));
}

export function traverseAntimeridien(a: LonLat, b: LonLat): boolean {
  return Math.abs(b[0] - a[0]) > 180;
}

export function dureeTrajetMinutes(
  km: number,
  { minutesPar1000km, niveauLogistique }: { minutesPar1000km: number; niveauLogistique: number },
): number {
  return (km / 1000) * minutesPar1000km * (1 - 0.07 * (niveauLogistique - 1));
}
