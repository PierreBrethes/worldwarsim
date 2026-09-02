// Le moteur de carte est une classe impérative à qui on assigne `.onLabels` —
// React Compiler lit ça comme une mutation interdite. Exclusion volontaire : le
// moteur n'importe pas React (CLAUDE.md).
'use no memo';

import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { asDuration } from '@/domain/duration';
import {
  URGENCY_MS,
  isCountdown,
  type MapLabel,
  type LabelPictogram,
  type Reach,
} from '@/domain/labels';
import { Pictogram, type PictogramName } from '@/shell/IndicatorGlyph';
import { ResourceIcon, resourceColor } from '@/emblems/ResourceIcon';
import type { DetailLevel, LabelProjection } from './engine/labels';
import type { MapEngine } from './engine';

/**
 * The board's label layer. One DOM node per label, moved by `transform` from the engine's
 * loop: React renders the list when the view changes, never per frame. Countdowns are
 * rewritten once per second, straight into the text node.
 *
 * The mockup names no classes — it is written in inline styles. These are therefore set
 * here and styled in `src/styles/labels.css`:
 *
 * - `map-labels` — the layer, pointer-transparent;
 * - `label-anchor` — the node the loop moves;
 * - `label` — the root; carries every state;
 * - `label--outpost | --stack | --construction | --building | --deposit | --my-movement |
 *   --inbound-movement | --intel` — the type;
 * - `label--glyph | --expanded` — the detail level;
 * - `label--urgent` — under five minutes left;
 * - `label--identified` — enemy movement pierced by intelligence;
 * - `label--clickable` — the click selects the host country;
 * - `label-block`, `label-bar`, `label-pictogram`, `label-deposit`, `label-lines`,
 *   `label-line--nature | --figures | --headcount | --countdown | --mention` — the anatomy.
 *
 * The caption is wrapped in `label-lines` rather than left bare: a folded building keeps its
 * portrait and drops only its words, so the wrapper is what the glyph level hides there.
 *
 * The anatomy has one stroke only: the national ink bar runs along the text then drops to
 * the anchor. The mockup drew two — a bar plus a thinner callout — and planted the
 * pictogram in the ground; here it holds to the text, across the bar, and the shadow pool
 * serves as the base.
 */
export function MapLabels({
  labels,
  engine,
  selected,
  onMovementHover,
  onReachHover,
  onSelect,
  onOpenBuilding,
  onOpenStack,
  onContextMenu,
}: {
  labels: ReadonlyArray<MapLabel>;
  engine: MapEngine | null;
  /** L'étiquette désignée — une troupe posée, cliquée seule : sa planche prend l'encre du joueur
   *  et rien d'autre ne bouge (décision du 29/08). */
  selected: string | null;
  onMovementHover: (id: string | null) => void;
  /** What the label covers on the ground, while the pointer is on it and no longer. */
  onReachHover: (reach: Reach | null) => void;
  onSelect: (name: string | null) => void;
  /** The click's screen point travels with it: what a mast opens is anchored to the mast. */
  onOpenBuilding: (buildingId: string, clientX: number, clientY: number) => void;
  /** A pile posted on the map opens its garrison — the same panel the widget's card opens. */
  /**
   * Ouvre ce qui se tient là : une troupe seule se **désigne** — cartouche en lecture, pile armée
   * — et une pile à composer ouvre la garnison. **Aucune rose ne s'ouvre ici** : cliquer sur un
   * sprite ne propose rien, les ordres se prennent au clic droit ailleurs (décision du 30/08).
   */
  /** L'étiquette entière, et non sa seule adresse : la carte en tire aussi la cible de la rose,
   *  qui s'ouvre avec le cartouche (décision du 30/08). */
  onOpenStack: (label: MapLabel, clientX: number, clientY: number) => void;
  onContextMenu: (label: MapLabel, clientX: number, clientY: number) => void;
}) {
  const anchors = useRef(new Map<string, HTMLElement>());
  const roots = useRef(new Map<string, HTMLElement>());
  const blocks = useRef(new Map<string, HTMLElement>());
  const countdowns = useRef(new Map<string, HTMLElement>());
  const states = useRef(new Map<string, RenderState>());
  const pendingDegrade = useRef(0);

  const apply = useCallback((id: string, state: RenderState) => {
    const root = roots.current.get(id);
    if (!root) return;
    const expanded = state.lod === 'expanded' && !state.folded;
    root.classList.toggle('label--expanded', expanded);
    root.classList.toggle('label--glyph', !expanded);
  }, []);

  /**
   * Overlap degradation, by decreasing priority: of two overlapping labels, the lower
   * priority falls back to the glyph.
   *
   * The order of the two loops is everything: expand **everyone** in the DOM first, measure
   * after. Measuring before expanding read the previous round's folded width — every label
   * then seemed to fit in its corner, none was folded, and the unreadable pile re-formed.
   * A degradation that contradicted itself from one round to the next.
   */
  const degrade = useCallback(() => {
    const candidates = labels
      .filter((label) => {
        const state = states.current.get(label.id);
        return state?.visible === true && state.lod === 'expanded';
      })
      .slice()
      .sort((first, second) => second.priority - first.priority);

    for (const label of labels) {
      const state = states.current.get(label.id);
      if (!state) continue;
      state.folded = false;
      apply(label.id, state);
    }

    const kept: DOMRect[] = [];
    for (const label of candidates) {
      const block = blocks.current.get(label.id);
      const state = states.current.get(label.id);
      if (!block || !state) continue;
      const rect = block.getBoundingClientRect();
      state.folded = kept.some((other) => overlap(other, rect));
      if (!state.folded) kept.push(rect);
      apply(label.id, state);
    }
  }, [labels, apply]);

  /**
   * One degradation per frame at most, and only when something asked for it. Crossing the
   * detail threshold used to leave a label expanded and unfolded until the next second-long
   * lap: it appeared, then vanished a beat later — a flicker the player read as a second zoom
   * notch. Measuring straight from the render loop would thrash layout sixty times a second
   * instead; a frame of delay costs nothing and bounds the work.
   */
  const scheduleDegrade = useCallback(() => {
    if (pendingDegrade.current !== 0) return;
    pendingDegrade.current = requestAnimationFrame(() => {
      pendingDegrade.current = 0;
      degrade();
    });
  }, [degrade]);

  const refreshCountdowns = useCallback(() => {
    const now = Date.now();
    for (const label of labels) {
      const countdown = label.lines.find(isCountdown);
      const node = countdowns.current.get(label.id);
      if (countdown === undefined || node === undefined) continue;
      const left = Math.max(0, countdown.dueAt - now);
      node.textContent = `${countdown.prefix}${asDuration(left / 60_000)}`;
      roots.current.get(label.id)?.classList.toggle('label--urgent', left < URGENCY_MS);
    }
  }, [labels]);

  useLayoutEffect(() => {
    states.current = new Map(
      labels.map((label) => [label.id, { visible: false, lod: 'glyph', folded: false, fade: 1 }]),
    );
    refreshCountdowns();
  }, [labels, refreshCountdowns]);

  // Camera rest is not enough for thread labels: their anchor is a movement head, which
  // advances while nothing moves on screen. Without this lap, two pawns meeting stay
  // expanded on top of each other until the mouse is touched. One measure per second, the
  // same cadence as the countdowns.
  useEffect(() => {
    const timer = setInterval(() => {
      refreshCountdowns();
      degrade();
    }, 1000);
    return () => clearInterval(timer);
  }, [refreshCountdowns, degrade]);

  useEffect(() => {
    if (!engine) return;
    // A deposit belongs to the zoomed-in layer, not merely to a region: it comes and goes with
    // the admin-1 borders, on their fade and not on a threshold of its own.
    engine.setLabelAnchors(
      labels.map(({ id, anchor, type }) => ({
        id,
        anchor,
        withRegionLayer: type === 'deposit',
      })),
    );
  }, [engine, labels]);

  useEffect(() => {
    if (!engine) return;
    engine.onLabels = (projections: ReadonlyArray<LabelProjection>) => {
      for (const projection of projections) {
        const anchor = anchors.current.get(projection.id);
        const state = states.current.get(projection.id);
        if (!anchor || !state) continue;

        if (projection.visible !== state.visible) {
          state.visible = projection.visible;
          anchor.style.display = projection.visible ? '' : 'none';
        }
        if (!projection.visible) continue;

        // Rounded before comparing: the fade is a continuous ramp, and writing a style on
        // every hundredth of it would touch the DOM sixty times a second for nothing.
        const fade = Math.round(projection.fade * 20) / 20;
        if (fade !== state.fade) {
          state.fade = fade;
          anchor.style.opacity = fade === 1 ? '' : String(fade);
        }

        anchor.style.transform = `translate3d(${projection.x}px, ${projection.y}px, 0)`;
        if (projection.lod !== state.lod) {
          state.lod = projection.lod;
          apply(projection.id, state);
          scheduleDegrade();
        }
      }
    };
    const unsubscribe = engine.subscribeRest(degrade);
    return () => {
      engine.onLabels = () => {};
      unsubscribe();
      if (pendingDegrade.current !== 0) cancelAnimationFrame(pendingDegrade.current);
      pendingDegrade.current = 0;
    };
  }, [engine, apply, degrade, scheduleDegrade]);

  return (
    <div className="map-labels">
      {labels.map((label) => (
        <div
          key={label.id}
          className="label-anchor"
          ref={(node) => {
            register(anchors.current, label.id, node);
          }}
          style={{ display: 'none' }}
        >
          <div
            ref={(node) => {
              register(roots.current, label.id, node);
            }}
            className={classesOf(label, label.id === selected)}
            style={label.ink === null ? undefined : ({ '--label-ink': label.ink } as CSSProperties)}
            onPointerEnter={() => {
              if (label.anchor.kind === 'movementHead') onMovementHover(label.anchor.arc);
              onReachHover(label.reach);
            }}
            onPointerLeave={() => {
              if (label.anchor.kind === 'movementHead') onMovementHover(null);
              onReachHover(null);
            }}
            onClick={(event) => {
              // A building's mast opens its surface and nothing else: opening a window *and*
              // moving the country selection would be two answers to one click.
              if (label.building !== null) {
                onOpenBuilding(label.building.id, event.clientX, event.clientY);
              } else if (label.station !== null) {
                onOpenStack(label, event.clientX, event.clientY);
              } else if (label.hostCountry !== null) onSelect(label.hostCountry);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              onContextMenu(label, event.clientX, event.clientY);
            }}
          >
            <div
              className="label-block"
              ref={(node) => {
                register(blocks.current, label.id, node);
              }}
            >
              {label.plate !== null && (
                <span className="label-pictogram">
                  <img className="label-plate" src={label.plate} alt="" />
                </span>
              )}
              {label.deposit !== null && (
                <span
                  className="label-deposit"
                  style={{ color: resourceColor(label.deposit, true) }}
                >
                  <ResourceIcon resource={label.deposit} size={15} />
                </span>
              )}
              {label.pictogram !== null && (
                <span className="label-pictogram">
                  <Pictogram
                    pictogram={PICTOGRAM_OF_LABEL[label.pictogram]}
                    weight={40}
                    size={36}
                  />
                </span>
              )}
              <span className="label-bar" />
              <div className="label-lines">
                {label.lines.map((line, rank) =>
                  line.role === 'countdown' ? (
                    <div
                      key={rank}
                      className="label-line label-line--countdown"
                      ref={(node) => {
                        register(countdowns.current, label.id, node);
                      }}
                    />
                  ) : (
                    <div key={rank} className={`label-line label-line--${line.role}`}>
                      {line.text}
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** "stack" is the domain's word, "forces" the drawing's — the same thing from two sides. */
const PICTOGRAM_OF_LABEL: Readonly<Record<LabelPictogram, PictogramName>> = {
  outpost: 'outpost',
  stack: 'forces',
  construction: 'construction',
};

type RenderState = { visible: boolean; lod: DetailLevel; folded: boolean; fade: number };

function register(map: Map<string, HTMLElement>, id: string, node: HTMLElement | null): void {
  if (node) map.set(id, node);
  else map.delete(id);
}

function classesOf(label: MapLabel, selected: boolean): string {
  return [
    'label',
    'label--glyph',
    `label--${label.type}`,
    label.identified ? 'label--identified' : '',
    selected ? 'label--selected' : '',
    label.hostCountry === null && label.building === null && label.station === null
      ? ''
      : 'label--clickable',
  ]
    .filter(Boolean)
    .join(' ');
}

/** The mockup's minimum gap: 28 px between two labels, 14 px of margin each. */
const OVERLAP_MARGIN = 14;

const overlap = (first: DOMRect, second: DOMRect): boolean =>
  first.left - OVERLAP_MARGIN < second.right + OVERLAP_MARGIN &&
  first.right + OVERLAP_MARGIN > second.left - OVERLAP_MARGIN &&
  first.top - OVERLAP_MARGIN < second.bottom + OVERLAP_MARGIN &&
  first.bottom + OVERLAP_MARGIN > second.top - OVERLAP_MARGIN;
