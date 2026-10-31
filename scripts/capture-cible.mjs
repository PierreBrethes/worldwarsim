/**
 * Ce que `capture.mjs` sait lire d'une cible : l'heure (`--heure`) et un lieu écrit `@id` ou
 * `@nom` (`lieu=@…`, `toucher=@…`). Pur : le navigateur n'y entre pas.
 */

/** Midi UTC : le soleil haut, et jamais la nuit du cycle de deux heures. */
const NOON = 'T12:00:00.000Z';

/** `--heure` : un instant ISO qui finit par Z, rendu normalisé ; midi du jour sans l'option. */
export function hourOf(raw) {
  if (raw === undefined) return `${new Date().toISOString().slice(0, 10)}${NOON}`;
  const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(raw)
    ? Date.parse(raw)
    : Number.NaN;
  if (Number.isNaN(instant)) throw new Error(`--heure : "${raw}" n'est pas un instant ISO avec Z`);
  return new Date(instant).toISOString();
}

/**
 * `@id` ou `@nom` : l'id d'une pile (`stack-point:lon,lat`) ou d'un bâtiment (`building-…@lon,lat`)
 * garde son id, que la page retrouve dessiné ; le nom d'un lieu de la démo ne donne que son point.
 */
export function spotOf(spec, places = {}) {
  const name = spec.replace(/^@/, '');
  if (places[name]) return { id: null, lonLat: places[name] };
  const point = name.match(/[:@](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (point) return { id: name, lonLat: [Number(point[1]), Number(point[2])] };
  const known = Object.keys(places).join(', ') || 'aucun (relance `npm run demo:mondiale`)';
  throw new Error(`@${name} : ni un id de pile ou de bâtiment, ni un lieu de la démo (${known})`);
}

/** `lieu=@id,distance,pente` : l'id porte sa propre virgule (`…@lon,lat`), le reste est à part. */
export function splitSpot(value) {
  const [, spec, rest = ''] = value.match(/^(@[^,@:]*(?:[:@]-?[\d.]+,-?[\d.]+)?)(?:,(.*))?$/s);
  return { spec, rest: rest === '' ? [] : rest.split(',').map(Number) };
}
