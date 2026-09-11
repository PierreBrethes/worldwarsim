import { useState, type MouseEvent } from 'react';
import { fr } from '@/i18n/fr';
import type { ResourceKey } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { currentStock } from '@/domain/player-view';
import { BAND_GROUPS, marksOf, sourceOf, type Mark, type Marks } from '@/domain/resource-band';
import { ResourcePlate } from '@/emblems/Plate';
import { keepResourceBandCollapsed, readResourceBandCollapsed } from '@/data/settings';
import { HoverCard } from './HoverCard';
import { useClock } from './clock';

/** Thirty pixels: a plate at 20 and its mono figure beside it, not one line more — the band
 *  is glanced past, never read. Folded, it keeps just enough to seat a mark. */
const BAND_HEIGHT = 30;
const FOLDED_HEIGHT = 20;

/** The illustrated plates, not the vector silhouettes: the band has the height to carry them,
 *  and the split of `Plate.tsx` puts everything at 20 px and above on the drawn set. Folded,
 *  the line comes down to the vector's territory, so the plate shrinks with it rather than
 *  turning to mush at a size it was never cut for. */
const PLATE = 20;
const FOLDED_PLATE = 14;

/**
 * **Le bandeau se lit en colonnes, pas en mots.** Unboxed, the eight plates are all the same
 * height and it is their width that runs from the oil drum to the heap of coal (0,62 to 1,78
 * of the height). Each is seated in the same slot, cut for the widest, and each figure gets
 * the same column of mono digits: the pairs then fall one under the other from one glance to
 * the next, and a stock crossing a thousand no longer shifts the whole line.
 */
const SLOT_RATIO = 1.8;
const FIGURE_WIDTH = 46;
const FOLDED_FIGURE_WIDTH = 40;

/**
 * **Une information, une fois, au bon endroit** (décision du 30/08). What is scarce and bounds
 * the action lives on one permanent line under the masthead, stock-ticker fashion: an icon and a
 * figure, and nothing else. The name, the ceiling, the rate and the source appear on hover and
 * nowhere else on the board — the Réserves panel that repeated them in a corner is gone.
 *
 * **The mark is ink, never an icon.** A resource an icon already names cannot be alerted by a
 * second one; a filled pavé is a ceiling reached, and it reads at a glance because nothing else
 * on the line is a square.
 *
 * **Folding gives back the figures, never a mark.** A band that hid a foundry running for
 * nothing to buy back ten pixels would be worse than no band at all.
 */
export function ResourceBand({ view }: { view: PlayerView }) {
  const now = useClock();
  const [collapsed, setCollapsed] = useState(readResourceBandCollapsed);
  const [hovered, setHovered] = useState<Hover | null>(null);
  const marks = marksOf(view, now);
  const marked = BAND_GROUPS.flat().filter((resource) => marks[resource] !== null);

  const figure = (resource: ResourceKey) => (
    <Figure
      key={resource}
      resource={resource}
      view={view}
      now={now}
      mark={marks[resource]}
      plate={collapsed ? FOLDED_PLATE : PLATE}
      figureWidth={collapsed ? FOLDED_FIGURE_WIDTH : FIGURE_WIDTH}
      onHover={setHovered}
    />
  );

  return (
    <div
      className="hud relative z-[var(--z-band)] flex shrink-0 items-center border-b border-[var(--ink-quiet)] bg-[var(--desk)] px-6"
      style={{ fontFamily: 'var(--font-body)', height: collapsed ? FOLDED_HEIGHT : BAND_HEIGHT }}
      onMouseLeave={() => setHovered(null)}
    >
      {collapsed ? (
        <div className="flex flex-1 items-center justify-center gap-[14px]">
          {marked.map(figure)}
          {/* Rien de marqué : le filet seul. Il tient la place, et son silence est la nouvelle. */}
          {marked.length === 0 && <span className="h-px flex-1 bg-[var(--ink-quiet)]" />}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          {BAND_GROUPS.map((group, rank) => (
            <div key={rank} className="flex items-center">
              {rank > 0 && <DoubleRule />}
              <div className="flex items-center gap-[14px]">{group.map(figure)}</div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        aria-expanded={!collapsed}
        title={collapsed ? fr.resourceBand.expand : fr.resourceBand.collapse}
        onClick={() => {
          setCollapsed((folded) => {
            keepResourceBandCollapsed(!folded);
            return !folded;
          });
          setHovered(null);
        }}
        className="absolute right-2 flex h-[14px] w-[14px] shrink-0 cursor-pointer items-center justify-center text-[9px] leading-none text-[var(--paper-dim)] hover:text-[var(--paper)]"
      >
        {collapsed ? '▾' : '▴'}
      </button>

      {hovered !== null && <Tooltip hover={hovered} marks={marks} view={view} now={now} />}
    </div>
  );
}

type Hover = {
  readonly resource: ResourceKey;
  /** The pavé and the figure answer two different questions, so they are two different hovers:
   *  the figure gives the reserve, the pavé gives the diagnosis that lit it. */
  readonly on: 'figure' | 'mark';
  readonly left: number;
};

function Figure({
  resource,
  view,
  now,
  mark,
  plate,
  figureWidth,
  onHover,
}: {
  resource: ResourceKey;
  view: PlayerView;
  now: number;
  mark: Mark | null;
  plate: number;
  figureWidth: number;
  onHover: (hover: Hover) => void;
}) {
  const stock = currentStock(view.me.resources[resource], view.loadedAt, now);
  // The band is the tooltip's offset parent — it is the only positioned box on the way up — so
  // the anchor stays right whatever the fold or the interface scale does to the line.
  const anchor = (event: MouseEvent<HTMLElement>) => event.currentTarget.offsetLeft;

  return (
    <span className="flex items-center gap-[5px]">
      {/* The pavé's gutter is held open whether or not it is inked: a mark that pushed its
          own figure seven pixels aside would break the column it is meant to be read in. */}
      <span
        onMouseEnter={
          mark === null
            ? undefined
            : (event) => onHover({ resource, on: 'mark', left: anchor(event) })
        }
        className={`flex h-[7px] w-[7px] shrink-0 ${mark === null ? '' : 'cursor-help bg-[var(--critical)]'}`}
      />
      <span
        onMouseEnter={(event) => onHover({ resource, on: 'figure', left: anchor(event) })}
        className="flex cursor-help items-center gap-[5px]"
        style={{ color: mark === null ? 'var(--paper)' : 'var(--critical)' }}
      >
        <span
          className="flex shrink-0 items-end justify-center"
          style={{ width: Math.round(plate * SLOT_RATIO), height: plate }}
        >
          <ResourcePlate resource={resource} height={plate} onDark boxed={false} />
        </span>
        <span
          className="font-(family-name:--font-mono) text-[12px] leading-none font-medium tabular-nums"
          style={{ width: figureWidth }}
        >
          {stock.toLocaleString('fr-FR')}
        </span>
      </span>
    </span>
  );
}

/** Entrepôt et dépôt : deux magasins, deux plafonds — un filet double entre eux. */
function DoubleRule() {
  return (
    <span className="mx-[14px] h-[16px] w-[3px] shrink-0 border-x border-[var(--ink-quiet)]" />
  );
}

/**
 * **The one place a name, a ceiling, a rate and a source are printed.** On paper, because it is
 * a reading and not a control: everything the band gives up to stay one line comes back here.
 */
function Tooltip({
  hover,
  marks,
  view,
  now,
}: {
  hover: Hover;
  marks: Marks;
  view: PlayerView;
  now: number;
}) {
  const mark = marks[hover.resource];
  if (hover.on === 'mark' && mark !== null) {
    return (
      <HoverCard left={hover.left} ink="var(--critical)">
        {mark.diagnosis}
      </HoverCard>
    );
  }

  const reserve = view.me.resources[hover.resource];
  const source = sourceOf(view, hover.resource);
  return (
    <HoverCard left={hover.left}>
      {fr.resourceBand.tooltip(
        fr.resources[hover.resource],
        currentStock(reserve, view.loadedAt, now),
        reserve.cap,
        reserve.ratePerHour,
      )}
      {source !== null && ` · ${fr.resourceBand.source(fr.buildings[source.by], source.level)}`}
    </HoverCard>
  );
}
