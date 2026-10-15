import { fr } from '@/i18n/fr';

/**
 * **Deux cartouches qui se chevauchent n'en font qu'un** (carte-lisible, 03/10). Une pile se lit
 * « Lieu · n » ; deux piles trop proches pour leurs deux cartouches se lisent « 2 piles · n », et
 * les mâts de bâtiments suivent la même règle. Les planches restent — on voit toujours *qu'il y
 * a* deux choses là — seuls les mots se mettent en commun.
 *
 * Tout se mesure en pixels d'écran : c'est le chevauchement à l'écran qui rend illisible, pas la
 * distance au sol, et la même paire se sépare d'elle-même quand la caméra s'approche.
 */
type GroupKind = 'stack' | 'building';

export type ScreenBox = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

export type GroupCandidate = {
  readonly id: string;
  readonly kind: GroupKind;
  /** Le cartouche mesuré — la barre et les mots, jamais la planche. */
  readonly box: ScreenBox;
  /** Le point désigné à l'écran : le pied du mât. */
  readonly x: number;
  readonly y: number;
  /** Les troupes d'une pile ; un bâtiment compte pour un. */
  readonly count: number;
};

export type LabelGroup = {
  readonly id: string;
  readonly kind: GroupKind;
  /** Dans l'ordre des candidats : le premier est celui dont le regroupement prend la place. */
  readonly members: ReadonlyArray<string>;
  readonly caption: string;
  /** Le cartouche réuni couvre ce que couvraient les siens : le repli des autres le lit. */
  readonly box: ScreenBox;
  /**
   * **Les siens tombent au même point de l'écran** — des mâts d'une même région pendent tous de
   * son point intérieur : aucune distance ne les séparera, et la pile s'ouvre en liste au lieu de
   * rapprocher la caméra (refonte mobile, 1r). **Des mâts seulement** : la liste ne sait ouvrir
   * qu'un bâtiment, et des piles confondues y tombaient vides — elles s'écartent comme avant.
   */
  readonly coincident: boolean;
};

/** En deçà d'un pixel, deux pieds de mât sont le même point : la projection arrondit. */
const COINCIDENT_PX = 1;

/**
 * **La marge du repli, et pas une autre** : 14 px de chaque côté, l'écart minimal de la maquette
 * des étiquettes. Plus étroite, deux piles trop loin pour se regrouper restaient assez près pour
 * que l'une replie l'autre — on aurait vu deux planches et un seul mot, sans rien à toucher pour
 * les séparer.
 */
export const GROUP_MARGIN_PX = 14;

export const boxesOverlap = (first: ScreenBox, second: ScreenBox, margin: number): boolean =>
  first.left - margin < second.right + margin &&
  first.right + margin > second.left - margin &&
  first.top - margin < second.bottom + margin &&
  first.bottom + margin > second.top - margin;

/**
 * Le regroupement est **transitif** : A touche B, B touche C, les trois font un cartouche — sinon
 * B serait à la fois seul avec A et seul avec C. Il ne mélange jamais une pile et un bâtiment :
 * « 2 piles » ne compte pas une caserne, et entre deux natures c'est le repli par priorité qui
 * tranche, comme avant. Un candidat sans voisin ne forme aucun groupe.
 */
export function groupOverlapping(
  candidates: ReadonlyArray<GroupCandidate>,
  margin = GROUP_MARGIN_PX,
): ReadonlyArray<LabelGroup> {
  const parent = candidates.map((_, index) => index);
  const root = (index: number): number => {
    let at = index;
    while (parent[at] !== at) at = parent[at]!;
    return at;
  };

  candidates.forEach((first, i) => {
    for (let j = i + 1; j < candidates.length; j++) {
      const second = candidates[j]!;
      if (first.kind !== second.kind || !boxesOverlap(first.box, second.box, margin)) continue;
      const [a, b] = [root(i), root(j)];
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  });

  const byRoot = new Map<number, GroupCandidate[]>();
  candidates.forEach((candidate, index) => {
    const at = root(index);
    const members = byRoot.get(at);
    if (members === undefined) byRoot.set(at, [candidate]);
    else members.push(candidate);
  });

  return [...byRoot.values()]
    .filter((members) => members.length > 1)
    .map((members) => {
      const first = members[0]!;
      const troops = members.reduce((sum, member) => sum + member.count, 0);
      return {
        id: `group-${first.id}`,
        kind: first.kind,
        members: members.map((member) => member.id),
        caption:
          first.kind === 'stack'
            ? fr.labels.stackGroup(members.length, troops)
            : fr.labels.buildingGroup(members.length),
        box: {
          left: Math.min(...members.map((member) => member.box.left)),
          top: Math.min(...members.map((member) => member.box.top)),
          right: Math.max(...members.map((member) => member.box.right)),
          bottom: Math.max(...members.map((member) => member.box.bottom)),
        },
        coincident:
          first.kind === 'building' &&
          members.every(
            (member) => Math.hypot(member.x - first.x, member.y - first.y) < COINCIDENT_PX,
          ),
      };
    });
}

/**
 * **Toucher un regroupement rapproche la caméra jusqu'à ce que les siens se séparent.** Sur un
 * écran, l'écart entre deux points du plateau varie comme l'inverse de la distance de la
 * caméra : pour que la paire la plus serrée s'écarte de `neededPx`, il faut diviser la distance
 * par le rapport des deux. Deux points confondus n'ont pas de distance qui les sépare — on rend
 * zéro, et la caméra s'arrête à son plancher.
 */
export function separatingDistance(
  currentDistance: number,
  points: ReadonlyArray<{ readonly x: number; readonly y: number }>,
  neededPx: number,
): number {
  let tightest = Infinity;
  points.forEach((first, i) => {
    for (let j = i + 1; j < points.length; j++) {
      const second = points[j]!;
      tightest = Math.min(tightest, Math.hypot(first.x - second.x, first.y - second.y));
    }
  });
  if (!Number.isFinite(tightest)) return currentDistance;
  if (tightest === 0) return 0;
  return Math.min(currentDistance, currentDistance * (tightest / neededPx));
}

/**
 * **L'éventail, au plancher du zoom** : chaque cartouche monte juste assez pour ne plus toucher
 * ceux qui le précèdent, et jamais ne descend — le mât s'allonge, le pied reste sur son point.
 * Les décalages sont en pixels, dans l'ordre des boîtes ; le premier ne bouge pas.
 */
export function fanOffsets(boxes: ReadonlyArray<ScreenBox>, gap = 2): ReadonlyArray<number> {
  const placed: ScreenBox[] = [];
  return boxes.map((box) => {
    let lift = 0;
    for (let moved = true; moved;) {
      moved = false;
      for (const other of placed) {
        const shifted = { ...box, top: box.top - lift, bottom: box.bottom - lift };
        if (!boxesOverlap(shifted, other, gap / 2)) continue;
        lift = box.bottom - other.top + gap;
        moved = true;
      }
    }
    placed.push({ ...box, top: box.top - lift, bottom: box.bottom - lift });
    return lift;
  });
}
