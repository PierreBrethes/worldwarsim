import { isCountdown, type LabelType, type MapLabel } from './labels';
import { boxesOverlap, type ScreenBox } from './label-groups';

/**
 * An off-screen entity does not vanish: it parks at the screen edge. The categories are the
 * label types' (`CATEGORY_BY_TYPE`) — an indicator invents nothing, it folds to the edge what the
 * map was showing on the ground, same pictogram, same priority.
 *
 * `buildings` are what stands, `constructions` what is being raised: two states of the same
 * object, but one is an economy read on the map and the other a duration to watch. Merging
 * them would light a crane over an arsenal finished three seasons ago.
 *
 * `deposits` are neither: what the ground holds, whether or not anything works it.
 */
export type EdgeCategory =
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
export const CATEGORY_BY_TYPE: Readonly<Partial<Record<LabelType, EdgeCategory>>> = {
  building: 'buildings',
  deposit: 'deposits',
  outpost: 'outposts',
  /** Une réserve neutre n'est ni à moi ni à l'autre : sa propre couche, qui emporte aussi la
   *  garnison relevée à son pied (`board-markers.ts`). */
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

/**
 * **The map's layers** (#604): a bascule earns its own case only if it changes the board, or if
 * it is the alert. `buildings`, `deposits` and `objectives` decide whether their marks stand on
 * the board at all, `outpost-zones` draws my outposts' reaches and liaisons (ADR 0037 §9), and
 * `inbound` is what is coming at me. Every other category only parks at the edge: one bascule,
 * `offscreen`, so that a case never toggles without the screen answering. `city-names` (#716)
 * writes or spares the cities' names; the seas', countries' and rivers' stay.
 */
export type Layer =
  | 'buildings'
  | 'deposits'
  | 'objectives'
  | 'outpost-zones'
  | 'inbound'
  | 'offscreen'
  | 'city-names';

export const LAYERS: ReadonlyArray<Layer> = [
  'buildings',
  'deposits',
  'objectives',
  'outpost-zones',
  'inbound',
  'offscreen',
  'city-names',
];

export type IndicatorToggles = Readonly<Record<Layer, boolean>>;

export function layerOf(category: EdgeCategory): Layer {
  switch (category) {
    case 'buildings':
    case 'deposits':
    case 'objectives':
    case 'inbound':
      return category;
    default:
      return 'offscreen';
  }
}

/**
 * The screen edge opens on a single alert category: what is coming at me. Turning everything
 * on by default would make the border a second dashboard, and red would no longer mean
 * anything — so `offscreen` starts folded.
 *
 * The board layers start lit: off, the player's own economy, the only map of where he may put
 * a mine, and the reserves a dispatch announces would be invisible until he found the button.
 */
export const DEFAULT_TOGGLES: IndicatorToggles = {
  buildings: true,
  deposits: true,
  objectives: true,
  'outpost-zones': true,
  inbound: true,
  offscreen: false,
  'city-names': true,
};

/**
 * The inner margin: the indicator sits inside the screen, never astride its edge. The badge
 * being centered on the clamped point, half a badge is added to the mockup's fourteen pixels
 * — otherwise half the glyph would fall off the bottom of the map.
 */
export const HALF_BADGE = 15;
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
  readonly category: EdgeCategory;
  readonly priority: number;
  /** The point folded onto the inner rectangle (`clampToEdge`). */
  readonly x: number;
  readonly y: number;
  /** How far the real point lies from the eye, in world units: the smallest is the nearest. A
   *  screen distance would lie for a point behind the camera. */
  readonly reach: number;
};

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';

export type IndicatorGroup = {
  readonly id: string;
  readonly category: EdgeCategory;
  readonly side: EdgeSide;
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
  const groups = new Map<string, { side: EdgeSide; members: RawIndicator[] }>();
  for (const indicator of indicators) {
    const side = sideOf(indicator.x, indicator.y, width, height);
    const id = `${indicator.category}:${side}`;
    const group = groups.get(id);
    if (group) group.members.push(indicator);
    else groups.set(id, { side, members: [indicator] });
  }
  return [...groups]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([id, { side, members }]) => {
      const ranked = [...members].sort(
        (first, second) => second.priority - first.priority || first.id.localeCompare(second.id),
      );
      const lead = ranked[0] as RawIndicator;
      const nearest = ranked.reduce((best, member) => (member.reach < best.reach ? member : best));
      return {
        id,
        category: lead.category,
        side,
        priority: lead.priority,
        members: ranked.map((member) => member.id),
        nearest: nearest.id,
      };
    });
}

/** The edge a folded point sits on: the nearest of the four, `top` first at a corner. */
export function sideOf(x: number, y: number, width: number, height: number): EdgeSide {
  // Read every frame by the edge layer: comparisons, nothing allocated.
  let side: EdgeSide = 'top';
  let gap = y;
  if (width - x < gap) {
    side = 'right';
    gap = width - x;
  }
  if (height - y < gap) {
    side = 'bottom';
    gap = height - y;
  }
  if (x < gap) side = 'left';
  return side;
}

/**
 * The alert mark, and nothing else on the map carries one.
 *
 * `threat` covers a heading at me, and since the spur was removed it is invisible: the glyph
 * stays neutral, because no relevé tells the order of a column — a Guet reads its pile, never
 * whether it comes to strike (ADR 0037 §5, decision of 02/11). It is a mark computed without
 * being drawn; the day a sign is given back to it, it fits here.
 */
export type AlertMark = 'none' | 'threat';

const INTENSITY: Readonly<Record<AlertMark, number>> = { none: 0, threat: 1 };

export const alertMark = (label: MapLabel): AlertMark =>
  label.type === 'inbound-movement' ? 'threat' : 'none';

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

/** The axis a token slides on to clear the pile bubble, along its edge: up and down on the sides, across on top and bottom. */
export const slideAxisOf = (side: EdgeSide): 'x' | 'y' =>
  side === 'left' || side === 'right' ? 'y' : 'x';

/**
 * **Un nom au bord ne couvre pas ma colonne** (#376) : posé au-dessus des étiquettes, il cacherait
 * celle de ma colonne en route et son « rappeler ». Le début où le poser, sur l'axe demandé : le
 * sien s'il ne couvre rien, sinon juste après ce qu'il couvrait — ou juste avant quand la fin
 * (`max`) manque. Sans `min`, rien ne le retient en deçà : sortir de l'écran plutôt que recouvrir
 * la colonne, comme avant #623. La bulle de pile en main passe `min` et ses marges, pour que le
 * jeton ne tombe ni sous le bandeau ni sur les boutons de la carte.
 */
export function clearOfColumns(
  box: ScreenBox,
  columns: ReadonlyArray<ScreenBox>,
  max: number,
  axis: 'x' | 'y' = 'y',
  min = -Infinity,
): number {
  const [start, end] = axis === 'y' ? (['top', 'bottom'] as const) : (['left', 'right'] as const);
  const covered = columns.filter((column) => boxesOverlap(column, box, 0));
  if (covered.length === 0) return box[start];
  const length = box[end] - box[start];
  const after = Math.max(...covered.map((column) => column[end])) + 4;
  return after + length <= max
    ? after
    : Math.max(min, Math.min(...covered.map((column) => column[start])) - 4 - length);
}

/** @a-mesurer How long a token takes to close most of the way to its place (ms). */
const GLIDE_MS = 80;

/** One step of the glide, exponential so that a frame of any length lands it on its place. */
export function glideToward(current: number, target: number, elapsed: number): number {
  const next = target + (current - target) * Math.exp(-elapsed / GLIDE_MS);
  return Math.abs(next - target) < 0.5 ? target : next;
}
