import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fr } from '@/i18n/fr';
import type { MapLabel } from '@/domain/labels';
import {
  CATEGORY_BY_TYPE,
  alertMark,
  cluster,
  idleConstruction,
  strongestMark,
  type IndicatorToggles,
  type IndicatorGroup,
  type RawIndicator,
  type AlertMark,
} from '@/domain/indicators';
import { IndicatorGlyph } from '@/shell/IndicatorGlyph';
import type { LabelProjection } from './engine/labels';
import type { MapEngine } from './engine';

/**
 * The screen edge. An entity out of frame is not lost: its label folds onto the rim,
 * reduced to its pictogram alone, and a click brings the camera back to it.
 *
 * Two cadences, never mixed: position follows the camera per frame, written as `transform`
 * on the anchor node; clustering, which decides *which* nodes exist, only recomputes at
 * orbit rest. Clustering per frame would flicker the counts at every degree of orbit, for a
 * result nobody would have time to read.
 *
 * Classes styled in `src/styles/indicators.css`:
 * `indicator--<category>` · `--clustered` · `--threat | --offensive | --imminent` ·
 * `--attention`.
 */
export function EdgeIndicators({
  labels,
  engine,
  toggles,
}: {
  labels: ReadonlyArray<MapLabel>;
  engine: MapEngine | null;
  toggles: IndicatorToggles;
}) {
  const kept = useMemo(
    () =>
      new Map(
        labels
          .filter((label) => toggles[CATEGORY_BY_TYPE[label.type]])
          .map((label) => [label.id, label] as const),
      ),
    [labels, toggles],
  );

  const [groups, setGroups] = useState<ReadonlyArray<IndicatorGroup>>([]);
  const anchors = useRef(new Map<string, HTMLElement>());
  const roots = useRef(new Map<string, HTMLElement>());
  const latest = useRef<ReadonlyArray<LabelProjection>>([]);

  const compose = useCallback(() => {
    const raw = latest.current.flatMap<RawIndicator>((projection) => {
      const label = kept.get(projection.id);
      if (!projection.atEdge || label === undefined) return [];
      return [
        {
          id: projection.id,
          category: CATEGORY_BY_TYPE[label.type],
          priority: label.priority,
          x: projection.edgeX,
          y: projection.edgeY,
        },
      ];
    });
    const composed = cluster(raw);
    setGroups((previous) => (sameGroups(previous, composed) ? previous : composed));
  }, [kept]);

  // A category just turned on cannot wait for the next camera rest: the toggle is a
  // gesture, and a gesture without an immediate effect reads as a failed gesture.
  useEffect(compose, [compose]);

  useEffect(() => {
    if (!engine) return;
    return engine.subscribeRest(compose);
  }, [engine, compose]);

  const sums = useMemo(() => groups.map(() => ({ x: 0, y: 0, count: 0 })), [groups]);

  const membership = useMemo(() => {
    const table = new Map<string, number>();
    groups.forEach((group, rank) => {
      for (const member of group.members) table.set(member, rank);
    });
    return table;
  }, [groups]);

  useEffect(() => {
    if (!engine) return;
    engine.onEdges = (projections) => {
      latest.current = projections;
      for (const sum of sums) {
        sum.x = sum.y = sum.count = 0;
      }

      for (const projection of projections) {
        if (!projection.atEdge) continue;
        const rank = membership.get(projection.id);
        if (rank === undefined) continue;
        const sum = sums[rank];
        if (sum === undefined) continue;
        sum.x += projection.edgeX;
        sum.y += projection.edgeY;
        sum.count += 1;
      }

      groups.forEach((group, rank) => {
        const anchor = anchors.current.get(group.id);
        const sum = sums[rank];
        if (!anchor || sum === undefined) return;
        if (sum.count === 0) {
          anchor.style.display = 'none';
          return;
        }
        anchor.style.display = '';
        anchor.style.transform = `translate3d(${sum.x / sum.count}px, ${sum.y / sum.count}px, 0)`;
      });
    };
    return () => {
      engine.onEdges = () => {};
    };
  }, [engine, groups, sums, membership]);

  // The alert mark falls at the due time, not per frame: a one-second beat suffices and it
  // is the same cadence as the labels' countdowns.
  useEffect(() => {
    const apply = () => {
      const now = Date.now();
      for (const group of groups) {
        const root = roots.current.get(group.id);
        if (!root) continue;
        const members = group.members
          .map((member) => kept.get(member))
          .filter((label): label is MapLabel => label !== undefined);
        const mark = strongestMark(members.map((member) => alertMark(member, now)));
        for (const name of MARKS) root.classList.toggle(`indicator--${name}`, mark === name);
        root.classList.toggle(
          'indicator--attention',
          members.some((member) => idleConstruction(member, now)),
        );
      }
    };
    apply();
    const timer = setInterval(apply, 1000);
    return () => clearInterval(timer);
  }, [groups, kept]);

  return (
    <div className="edge-indicators">
      {groups.map((group) => (
        <div
          key={group.id}
          className="indicator-anchor"
          style={{ display: 'none' }}
          ref={(node) => {
            register(anchors.current, group.id, node);
          }}
        >
          <button
            type="button"
            title={titleOf(group, kept)}
            style={{ zIndex: group.priority }}
            className={`indicator indicator--${group.category}${group.members.length > 1 ? ' indicator--clustered' : ''}`}
            ref={(node) => {
              register(roots.current, group.id, node);
            }}
            onClick={() => engine?.journeyTo(group.members)}
          >
            <span className="indicator-triangle" aria-hidden>
              <svg viewBox="0 0 20 20">
                <path d="M10 1.8 18.4 17.2H1.6z" />
              </svg>
            </span>
            {group.members.length > 1 && (
              <span className="indicator-backing">
                <IndicatorGlyph category={group.category} size={17} />
              </span>
            )}
            <span className="indicator-glyph">
              <IndicatorGlyph category={group.category} size={17} />
            </span>
            {group.members.length > 1 && (
              <span className="indicator-count">{group.members.length}</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

const MARKS: ReadonlyArray<AlertMark> = ['threat', 'offensive', 'imminent'];

function titleOf(
  group: IndicatorGroup,
  kept: ReadonlyMap<string, MapLabel>,
): string {
  const nature = fr.edgeIndicators.natures[group.category];
  if (group.members.length > 1) return fr.edgeIndicators.groupTitle(group.members.length, nature);
  const first = group.members[0];
  const label = first === undefined ? undefined : kept.get(first);
  const mention = label?.lines.find((line) => line.role === 'nature');
  return mention && mention.role === 'nature'
    ? fr.edgeIndicators.singleTitle(mention.text)
    : fr.edgeIndicators.singleTitle(nature);
}

function register(map: Map<string, HTMLElement>, id: string, node: HTMLElement | null): void {
  if (node) map.set(id, node);
  else map.delete(id);
}

/** Camera rest replays the computation: without this comparison, it would blank the layer. */
function sameGroups(
  first: ReadonlyArray<IndicatorGroup>,
  second: ReadonlyArray<IndicatorGroup>,
): boolean {
  return (
    first.length === second.length &&
    first.every((group, rank) => {
      const other = second[rank];
      return (
        other !== undefined &&
        group.id === other.id &&
        group.members.length === other.members.length &&
        group.members.every((member, place) => member === other.members[place])
      );
    })
  );
}
