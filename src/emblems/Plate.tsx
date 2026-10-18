import { fr } from '@/i18n/fr';
import type { BuildingKey, ResourceKey } from '@/domain/ids';
import { buildingSprite } from './buildings/manifest';
import { objectiveSprite } from './objectives/manifest';
import { resourcePlate } from './resources/manifest';

/**
 * An illustrated plate, hung in a surface that has room for it. **The plates and the vector
 * icons are two sets, not two versions of one**, and the split is a size: below roughly 20 px
 * an illustration's texture collapses into mush, so the plate holds anything drawn at 20 and
 * above and `ResourceIcon` holds what is drawn smaller — the bill lines at 11 and 12 px.
 * Picking by size rather than by taste is what keeps the choice from drifting.
 *
 * Height is the pinned axis, as at the export (`optimiser.py --recadrer`): the subjects run
 * from a standing drum to a mine car lying wide, so a column pinned by width would go sawtooth
 * while the line heights stayed put.
 */
function Plate({
  url,
  label,
  height,
  width,
  ink,
  ground = false,
  area,
}: {
  url: string | null;
  label: string;
  height: number;
  width?: number | undefined;
  ink?: string;
  /** Stand the subject on the floor of its box instead of centring it in the leftover air. */
  ground?: boolean;
  /**
   * **Along a line, the eye weighs ink, not height**: pinned at one height, the coal heap
   * (ratio 1,78) carried three times the drum (0,62). Given an area, the plate takes the
   * height that gives it that many square pixels, never above `height` — a rule on the file's
   * own ratio, read at load, and not a table of corrections (`resources/manifest.ts`).
   */
  area?: number | undefined;
}) {
  if (url === null) return <Missing label={label} height={height} width={width} />;
  return (
    <img
      src={url}
      alt=""
      title={label}
      className={`block shrink-0 object-contain ${ground ? 'object-bottom' : ''}`}
      style={{ height, width: width ?? 'auto', ...(ink === undefined ? {} : { filter: ink }) }}
      onLoad={
        area === undefined
          ? undefined
          : ({ currentTarget: img }) => {
              const ratio = img.naturalWidth / img.naturalHeight;
              img.style.height = `${Math.min(height, Math.sqrt(area / ratio))}px`;
            }
      }
    />
  );
}

/**
 * No ink pass, and that is not an oversight: the map shows the very same file through
 * `.label-plate`, which carries a paper reserve and a shadow but no filter. A window that
 * toned it down would make one building look like two.
 */
export function BuildingPlate({ building, height }: { building: BuildingKey; height: number }) {
  return <Plate url={buildingSprite(building)} label={fr.buildings[building]} height={height} />;
}

/**
 * **La planche d'un objectif neutre** — même traitement qu'un bâtiment : aucune passe d'encre,
 * parce qu'un objectif n'appartient à personne et qu'il n'y a donc aucune couleur à lui donner.
 * `null` tombe sur le cadre pointillé, qui dit le trou sans casser l'image.
 */
export function ObjectivePlate({
  objective,
  label,
  height,
}: {
  objective: string;
  label: string;
  height: number;
}) {
  return <Plate url={objectiveSprite(objective)} label={label} height={height} />;
}

/**
 * The resource plates came out of the generator far more saturated than the building set — a
 * brass cartridge and an olive drum against an arsenal already in greys. The ink pass is the
 * units' (`UnitSprite`, `README.md` §5), applied at display time and never baked: **the board
 * is desaturated on purpose, and the contrast budget belongs to the game layer.** Re-encoding
 * the five would settle it in the asset, where a revised palette could not reach it.
 */
const INK_FILTER = 'saturate(.5) sepia(.22) brightness(.94)';

/**
 * The same pass on the night desk, lifted instead of dulled. `brightness(.94)` is a correction
 * against paper, and on `--desk` it pushes the wrong way — coal was already measured at 2,80 of
 * contrast there, under the 3:1 floor (`noms.json`). Two grounds, two values: `resourceColor`
 * has carried the same `onPaper` split since the vector icons existed.
 */
const INK_FILTER_DARK = 'saturate(.5) sepia(.22) brightness(1.18)';

/**
 * How wide the box stands against its height. The plate is **boxed by default, not stretched**,
 * exactly as `UnitSprite` is and for the same reason: the subjects run from a standing drum
 * (ratio 0,62) to a heap of coal lying wide (1,76), so a column pinned by height alone starts
 * every label at a different place and the two widest read as the heavy ones.
 *
 * A common box makes any list align, and `object-contain` takes the surplus out of the wide
 * subjects rather than out of the tall ones — coal comes down about a quarter, steel about a
 * tenth, the other six do not move. That is an optical correction and **not a hierarchy**: no
 * resource outranks another, which is the same ruling the building plates got when
 * `echelles.json` was dropped (`WWS/sprites/README.md` §7).
 *
 * A default rather than a prop to repeat: the correction belongs to the plate, and a caller
 * that had to remember it is a caller that will forget it on the fifth surface.
 */
const BOX_RATIO = 1.25;

/**
 * **The eight stand on one floor.** The box above takes its surplus out of the wide subjects,
 * so a heap of coal comes out fourteen pixels tall where a drum comes out twenty — and centred
 * in the box, the heap floats three pixels above the drum's feet. Eight objects hovering at
 * eight different heights is what a row of them actually looked like.
 *
 * Standing them on the bottom edge costs nothing anywhere else: down a column each subject is
 * simply seated the same way in its own row, which is more aligned rather than less.
 *
 * It only holds because the export puts every subject flush against its canvas: a plate cut
 * with air under it would stand on that air. `optimiser.py --recadrer` guarantees it, and one
 * plate once did not — see `resources/manifest.ts`.
 */
export function ResourcePlate({
  resource,
  height,
  width,
  onDark = false,
  boxed = true,
  area,
}: {
  resource: ResourceKey;
  height: number;
  width?: number;
  onDark?: boolean;
  /**
   * Down a column the box is what aligns; **along a line it is what breaks the alignment**.
   * The box takes its surplus out of the wide subjects, so a heap of coal comes out fourteen
   * pixels tall beside a twenty-pixel drum — a stack of rows never sees it, a ticker sees
   * nothing else. Unboxed, height is pinned for all eight and the width is the one that
   * varies, which is the caller's problem to seat (`ResourceCell` gives each a common slot).
   */
  boxed?: boolean;
  area?: number;
}) {
  return (
    <Plate
      url={resourcePlate(resource)}
      label={fr.resources[resource]}
      height={height}
      width={boxed ? (width ?? Math.round(height * BOX_RATIO)) : width}
      ink={onDark ? INK_FILTER_DARK : INK_FILTER}
      ground
      area={area}
    />
  );
}

/**
 * A broken `<img>` would flag the hole with a browser icon, off-palette and mute about what it
 * stands for. The dashed frame is the units' fallback, and it says the same thing here.
 */
function Missing({
  label,
  height,
  width,
}: {
  label: string;
  height: number;
  width: number | undefined;
}) {
  return (
    <span
      title={label}
      className="flex shrink-0 items-center justify-center overflow-hidden border border-dashed px-1 text-center leading-[1.1] uppercase"
      style={{
        height,
        width: width ?? 'auto',
        minWidth: width ?? height,
        borderColor: 'var(--ink-soft)',
        color: 'var(--ink-soft)',
        fontSize: 'var(--size-eyebrow-sm)',
        letterSpacing: 'var(--track-eyebrow)',
      }}
    />
  );
}
