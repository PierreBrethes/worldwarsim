import { distanceKm, type LonLat } from './geo';
import { NATION_BY_ADM0 } from './nations';
import type { PlayerView } from './player-view';

/**
 * **Ce que la vue du joueur donne pour attaquable en un point** — et il n'y a pas de seconde
 * source (décision Pierre, 29/08) : on n'ordonne un assaut que sur un objectif identifié, donc le
 * renseignement devient le préalable de l'attaque.
 *
 * ⚠️ **Tout se lit dans `PlayerView` et nulle part ailleurs.** Poser la question à l'état serveur
 * dirait au joueur qu'il y a quelque chose là où il croyait viser du vide : le menu percerait le
 * brouillard que le reste du jeu tient (ADR 0005). Un relevé périmé qui laisse l'option ouverte
 * est donc un comportement **correct** — le serveur résoudra une bredouille, et c'est le prix
 * assumé de ne jamais rien révéler.
 *
 * Deux choses seulement répondent aujourd'hui, parce que ce sont les deux seules que la vue
 * porte : le sol d'un adversaire, qui est public dès l'entrée en guerre, et le fil d'un relevé,
 * pris là où la carte le dessine à l'instant. Un avant-poste adverse répondrait aussi le jour où
 * la vue en servirait un — `isMine` est déjà là pour ça.
 */
export function knownObjectiveAt(
  view: PlayerView,
  at: LonLat,
  country: string | null,
  radiusKm: number,
): boolean {
  if (country !== null && onOpponentSoil(view, country)) return true;
  const outposts = view.me.outposts.some(
    (outpost) => !outpost.isMine && distanceKm(outpost.lonLat, at) <= radiusKm,
  );
  if (outposts) return true;
  return view.arcs.some(
    (arc) =>
      (arc.state === 'enemyDetected' || arc.state === 'lastKnown') &&
      distanceKm(headOf(arc.route.points, arc.progress), at) <= radiusKm,
  );
}

const onOpponentSoil = (view: PlayerView, country: string): boolean => {
  const nation = NATION_BY_ADM0.get(country);
  return nation !== undefined && view.opponents.some((opponent) => opponent.nation === nation);
};

/**
 * Où le fil se tient à l'instant, sur sa propre polyligne — le point que la carte dessine, pas
 * le trajet entier : un relevé dit où passe une colonne maintenant, et viser une trace vieille de
 * six heures n'est pas viser un objectif.
 */
function headOf(points: ReadonlyArray<LonLat>, progress: number): LonLat {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return [0, 0];
  const legs = points.slice(1).map((point, index) => distanceKm(points[index]!, point));
  const total = legs.reduce((sum, leg) => sum + leg, 0);
  if (total === 0) return first;

  let walked = Math.min(1, Math.max(0, progress)) * total;
  for (const [index, leg] of legs.entries()) {
    if (walked <= leg || index === legs.length - 1) {
      const from = points[index]!;
      const to = points[index + 1]!;
      const share = leg === 0 ? 0 : Math.min(1, walked / leg);
      return [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
    }
    walked -= leg;
  }
  return last;
}
