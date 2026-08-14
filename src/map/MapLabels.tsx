import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { asHoursMinutes } from '@/domain/duration';
import { URGENCY_MS, isCountdown, type MapLabel, type LabelPictogram } from '@/domain/labels';
import { Pictogram, type PictogramName } from '@/shell/IndicatorGlyph';
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
 * - `label--outpost | --stack | --construction | --my-movement |
 *   --inbound-movement | --intel` — the type;
 * - `label--glyph | --expanded` — the detail level;
 * - `label--urgent` — under five minutes left;
 * - `label--identified` — enemy movement pierced by intelligence;
 * - `label--clickable` — the click selects the host country;
 * - `label-block`, `label-bar`, `label-pictogram`,
 *   `label-line--nature | --figures | --headcount | --countdown | --mention` — the anatomy.
 *
 * The anatomy has one stroke only: the national ink bar runs along the text then drops to
 * the anchor. The mockup drew two — a bar plus a thinner callout — and planted the
 * pictogram in the ground; here it holds to the text, across the bar, and the shadow pool
 * serves as the base.
 */
export function MapLabels({
  labels,
  engine,
  onMovementHover,
  onSelect,
  onContextMenu,
}: {
  labels: ReadonlyArray<MapLabel>;
  engine: MapEngine | null;
  onMovementHover: (id: string | null) => void;
  onSelect: (name: string | null) => void;
  onContextMenu: (label: MapLabel, clientX: number, clientY: number) => void;
}) {
  const anchors = useRef(new Map<string, HTMLElement>());
  const roots = useRef(new Map<string, HTMLElement>());
  const blocks = useRef(new Map<string, HTMLElement>());
  const countdowns = useRef(new Map<string, HTMLElement>());
  const states = useRef(new Map<string, RenderState>());

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

  const refreshCountdowns = useCallback(() => {
    const now = Date.now();
    for (const label of labels) {
      const countdown = label.lines.find(isCountdown);
      const node = countdowns.current.get(label.id);
      if (countdown === undefined || node === undefined) continue;
      const left = Math.max(0, countdown.dueAt - now);
      node.textContent = `${countdown.prefix}${asHoursMinutes(left / 60_000)}`;
      roots.current.get(label.id)?.classList.toggle('label--urgent', left < URGENCY_MS);
    }
  }, [labels]);

  useLayoutEffect(() => {
    states.current = new Map(
      labels.map((label) => [label.id, { visible: false, lod: 'glyph', folded: false }]),
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
    engine.setLabelAnchors(labels.map(({ id, anchor }) => ({ id, anchor })));
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

        anchor.style.transform = `translate3d(${projection.x}px, ${projection.y}px, 0)`;
        if (projection.lod !== state.lod) {
          state.lod = projection.lod;
          apply(projection.id, state);
        }
      }
    };
    const unsubscribe = engine.subscribeRest(degrade);
    return () => {
      engine.onLabels = () => {};
      unsubscribe();
    };
  }, [engine, apply, degrade]);

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
            className={classesOf(label)}
            style={
              label.ink === null
                ? undefined
                : ({ '--label-ink': label.ink } as CSSProperties)
            }
            onPointerEnter={() => {
              if (label.anchor.kind === 'movementHead') onMovementHover(label.anchor.arc);
            }}
            onPointerLeave={() => {
              if (label.anchor.kind === 'movementHead') onMovementHover(null);
            }}
            onClick={() => {
              if (label.hostCountry !== null) onSelect(label.hostCountry);
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
              {label.pictogram !== null && (
                <span className="label-pictogram">
                  <Pictogram pictogram={PICTOGRAM_OF_LABEL[label.pictogram]} weight={40} size={36} />
                </span>
              )}
              <span className="label-bar" />
              <div>
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

type RenderState = { visible: boolean; lod: DetailLevel; folded: boolean };

function register(map: Map<string, HTMLElement>, id: string, node: HTMLElement | null): void {
  if (node) map.set(id, node);
  else map.delete(id);
}

function classesOf(label: MapLabel): string {
  return [
    'label',
    'label--glyph',
    `label--${label.type}`,
    label.identified ? 'label--identified' : '',
    label.hostCountry === null ? '' : 'label--clickable',
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
