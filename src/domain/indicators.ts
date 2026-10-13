import { URGENCY_MS, isCountdown, type LabelType, type MapLabel } from './labels';

/**
 * An off-screen entity does not vanish: it parks at the screen edge. The categories are
 * exactly the label types — an indicator invents nothing, it folds to the edge what the map
 * was showing on the ground, same pictogram, same priority.
 *
 * `buildings` are what stands, `constructions` what is being raised: two states of the same
 * object, but one is an economy read on the map and the other a duration to watch. Merging
 * them would light a crane over a foundry finished three seasons ago.
 *
 * `deposits` are neither: what the ground holds, whether or not anything works it. They ride
 * the same bascule idiom because they answer the same question — *what is on this region* —
 * and they must stay separable from it, since a player looks for a deposit precisely when he
 * has not built there yet.
 */
export type IndicatorCategory =
  | 'buildings'
  | 'deposits'
  | 'outposts'
  | 'objectives'
  | 'constructions'
  | 'forces'
  | 'my-movements'
  | 'inbound'
  | 'intel';

/** Private loot stays on the board only; it does not create a new global edge inventory. */
export const CATEGORY_BY_TYPE: Readonly<Partial<Record<LabelType, IndicatorCategory>>> = {
  building: 'buildings',
  deposit: 'deposits',
  outpost: 'outposts',
  /** Une réserve neutre n'est ni à moi ni à l'autre : sa propre couche, qui emporte aussi la
   *  garnison relevée à son pied (`plateau.tsx`). */
  objective: 'objectives',
  /** Le renseignement est tout ce qu'on a relevé chez l'autre : ses colonnes, ses forces posées,
   *  ses installations — trois natures, une seule question, « où est-il ». */
  camp: 'intel',
  installation: 'intel',
  construction: 'constructions',
  stack: 'forces',
  'my-movement': 'my-movements',
  'inbound-movement': 'inbound',
  intel: 'intel',
};

export type IndicatorToggles = Readonly<Record<IndicatorCategory, boolean>>;

/**
 * The screen edge opens on a single alert category: what is coming at me. Turning everything
 * on by default would make the border a second dashboard, and red would no longer mean
 * anything — this is the only default that keeps the alert's value as an alert.
 *
 * `buildings` is the exception, and it is not one of degree: the bascule does not only fold
 * the building to the edge, it decides whether the plate stands on the board at all. Off by
 * default, the player's own economy would be invisible until he found the button.
 *
 * `deposits` is on for the same reason and a sharper one: it is the layer that answers "where
 * do I put a mine", and the fallback for a player who never finds the button is to right-click
 * a hundred regions one by one. Counted on `public/deposits.json`, a playable nation holds
 * nine to seventeen of them — the layer is thin enough that showing it costs nothing to read.
 *
 * `outposts` joins them for exactly the argument written above, and the layer is thinner still:
 * a point is a column already spent, and its garrison has **no other address on the board**.
 * Folded by default, founding one reads as nothing having happened at all.
 */
export const DEFAULT_TOGGLES: IndicatorToggles = {
  buildings: true,
  deposits: true,
  outposts: true,
  /** Allumée pour la même raison que les avant-postes : une réserve annoncée par dépêche qui ne
   *  se tient nulle part sur la carte ne ferait converger personne. */
  objectives: true,
  constructions: false,
  forces: false,
  'my-movements': false,
  inbound: true,
  intel: false,
};

export const CATEGORIES: ReadonlyArray<IndicatorCategory> = [
  'buildings',
  'deposits',
  'outposts',
  'objectives',
  'constructions',
  'forces',
  'my-movements',
  'inbound',
  'intel',
];

/**
 * The inner margin: the indicator sits inside the screen, never astride its edge. The badge
 * being centered on the clamped point, half a badge is added to the mockup's fourteen pixels
 * — otherwise half the glyph would fall off the bottom of the map.
 */
const HALF_BADGE = 15;
export const EDGE_MARGIN = 14 + HALF_BADGE;

export type EdgePoint = { readonly x: number; readonly y: number; readonly heading: number };

/**
 * The screen point of an off-frame anchor, brought back onto the inner rectangle. The heading
 * is not the reached edge's but the real direction's: it is the only information the folding
 * destroys, and it is computed here even if nothing draws it anymore.
 */
export function clampToEdge(
  x: number,
  y: number,
  width: number,
  height: number,
  margin: number = EDGE_MARGIN,
): EdgePoint {
  const centerX = width / 2;
  const centerY = height / 2;
  const halfWidth = Math.max(1, centerX - margin);
  const halfHeight = Math.max(1, centerY - margin);
  const gapX = x - centerX;
  // An anchor exactly at center yet off-frame does not exist geometrically, but a screen one
  // pixel tall does: falling back downward avoids a division by zero.
  const gapY = gapX === 0 && y === centerY ? 1 : y - centerY;

  const factor = Math.min(
    gapX === 0 ? Infinity : halfWidth / Math.abs(gapX),
    gapY === 0 ? Infinity : halfHeight / Math.abs(gapY),
  );

  return {
    x: centerX + gapX * factor,
    y: centerY + gapY * factor,
    heading: Math.atan2(gapY, gapX),
  };
}

export type RawIndicator = {
  readonly id: string;
  readonly category: IndicatorCategory;
  readonly priority: number;
  /** The point folded onto the inner rectangle (`clampToEdge`). */
  readonly x: number;
  readonly y: number;
  /** How far from the screen centre the real point lies, in pixels: the smallest is the nearest. */
  readonly reach: number;
};

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';

export type IndicatorGroup = {
  readonly id: string;
  readonly category: IndicatorCategory;
  readonly priority: number;
  readonly members: ReadonlyArray<string>;
  /** What a click brings back: framing a whole edge of deposits would fly to the world view. */
  readonly nearest: string;
};

/**
 * **One token per edge and per category** (carte allégée, 13/10/2026). Grouping by screen
 * distance left a column of pictograms along each rim, the loudest thing on the screen; the
 * rim only has to say *there is more of this, that way*. The token's place is the mean of its
 * members, which the per-frame pass computes. Depends only on positions, so it is identical
 * from one computation to the next while the camera holds — what allows recomputing at rest.
 */
export function cluster(
  indicators: ReadonlyArray<RawIndicator>,
  width: number,
  height: number,
): ReadonlyArray<IndicatorGroup> {
  const groups = new Map<string, RawIndicator[]>();
  for (const indicator of indicators) {
    const id = `${indicator.category}:${sideOf(indicator, width, height)}`;
    const group = groups.get(id);
    if (group) group.push(indicator);
    else groups.set(id, [indicator]);
  }
  return [...groups].map(([id, members]) => {
    const ranked = [...members].sort((first, second) => second.priority - first.priority);
    const lead = ranked[0] as RawIndicator;
    const nearest = members.reduce((best, member) => (member.reach < best.reach ? member : best));
    return {
      id,
      category: lead.category,
      priority: lead.priority,
      members: ranked.map((member) => member.id),
      nearest: nearest.id,
    };
  });
}

function sideOf({ x, y }: { x: number; y: number }, width: number, height: number): EdgeSide {
  const gaps: ReadonlyArray<readonly [EdgeSide, number]> = [
    ['top', y],
    ['right', width - x],
    ['bottom', height - y],
    ['left', x],
  ];
  return gaps.reduce((best, gap) => (gap[1] < best[1] ? gap : best))[0];
}

/**
 * The three intensities of the alert mark, and nothing else on the map carries one.
 *
 * `threat` covers the unidentified heading, and since the spur was removed it is invisible:
 * the glyph stays neutral, otherwise we would assert a nature we do not know. It is a mark
 * computed without being drawn; the day a sign is given back to it, it fits here.
 */
export type AlertMark = 'none' | 'threat' | 'offensive' | 'imminent';

const INTENSITY: Readonly<Record<AlertMark, number>> = {
  none: 0,
  threat: 1,
  offensive: 2,
  imminent: 3,
};

export function alertMark(label: MapLabel, now: number): AlertMark {
  if (label.type !== 'inbound-movement') return 'none';
  if (!label.identified || !label.offensive) return 'threat';
  const due = dueOf(label);
  return due !== null && due - now < URGENCY_MS ? 'imminent' : 'offensive';
}

/** A cluster carries the strongest of the marks it covers: a threat does not dilute. */
export const strongestMark = (marks: ReadonlyArray<AlertMark>): AlertMark =>
  marks.reduce<AlertMark>(
    (strongest, mark) => (INTENSITY[mark] > INTENSITY[strongest] ? mark : strongest),
    'none',
  );

/**
 * The finished construction that nothing follows. This is the oversight we want to catch —
 * a factory idling while we look elsewhere — hence the attention accent at the edge.
 */
export const idleConstruction = (label: MapLabel, now: number): boolean =>
  label.idle && (dueOf(label) ?? Infinity) <= now;

function dueOf(label: MapLabel): number | null {
  const countdown = label.lines.find(isCountdown);
  return countdown?.dueAt ?? null;
}
