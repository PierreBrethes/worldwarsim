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

/** Below this, two same-category indicators no longer read apart: they merge. */
export const CLUSTER_THRESHOLD = 48;

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
  readonly x: number;
  readonly y: number;
};

export type IndicatorGroup = {
  readonly id: string;
  readonly category: IndicatorCategory;
  readonly priority: number;
  readonly members: ReadonlyArray<string>;
};

/**
 * Kernel clustering, category by category: the highest priority opens the group, the
 * followers join it if they fall within its radius. One pass, no moving average — the result
 * therefore depends only on positions, and it is identical from one computation to the next
 * as long as the camera has not moved. That is what allows recomputing only at rest.
 */
export function cluster(
  indicators: ReadonlyArray<RawIndicator>,
  threshold: number = CLUSTER_THRESHOLD,
): ReadonlyArray<IndicatorGroup> {
  const kernels: Array<{ kernel: RawIndicator; members: string[] }> = [];

  for (const indicator of [...indicators].sort(
    (first, second) => second.priority - first.priority,
  )) {
    const near = kernels.find(
      ({ kernel }) =>
        kernel.category === indicator.category &&
        Math.hypot(kernel.x - indicator.x, kernel.y - indicator.y) < threshold,
    );
    if (near) near.members.push(indicator.id);
    else kernels.push({ kernel: indicator, members: [indicator.id] });
  }

  return kernels.map(({ kernel, members }) => ({
    id: `${kernel.category}:${kernel.id}`,
    category: kernel.category,
    priority: kernel.priority,
    members,
  }));
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
