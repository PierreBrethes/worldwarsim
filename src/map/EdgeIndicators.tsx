// Le moteur de carte est une classe impérative à qui on assigne `.onEdges` —
// React Compiler lit ça comme une mutation interdite. Exclusion volontaire : le
// moteur n'importe pas React (CLAUDE.md).
'use no memo';

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
  destinations,
}: {
  labels: ReadonlyArray<MapLabel>;
  engine: MapEngine | null;
  toggles: IndicatorToggles;
  /**
   * **Les destinations de la colonne armée, nommées au bord quand elles sont hors champ** (lot
   * mobile-3, A8). Elles ne se regroupent pas et ne suivent aucune bascule : chacune porte son
   * nom, et un toucher y recentre la carte. Le même passage du moteur les pose.
   */
  destinations: ReadonlyMap<string, string>;
}) {
  const kept = useMemo(
    () =>
      new Map(
        labels
          .filter((label) => {
            const category = CATEGORY_BY_TYPE[label.type];
            return category !== undefined && toggles[category];
          })
          .map((label) => [label.id, label] as const),
      ),
    [labels, toggles],
  );

  const [groups, setGroups] = useState<ReadonlyArray<IndicatorGroup>>([]);
  const anchors = useRef(new Map<string, HTMLElement>());
  const roots = useRef(new Map<string, HTMLElement>());
  const latest = useRef<ReadonlyArray<LabelProjection>>([]);
  const named = useRef(new Map<string, HTMLElement>());

  const compose = useCallback(() => {
    const raw = latest.current.flatMap<RawIndicator>((projection) => {
      const label = kept.get(projection.id);
      if (!projection.atEdge || label === undefined) return [];
      const category = CATEGORY_BY_TYPE[label.type];
      if (category === undefined) return [];
      return [
        {
          id: projection.id,
          category,
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
      /** Le cadre se mesure **une fois par passe** : relu pour chaque cartouche, il forçait une
       *  mise en page après chaque écriture de style. Ils ont tous le même parent. */
      let frame: { width: number; height: number } | null = null;
      for (const projection of projections) {
        const tag = named.current.get(projection.id);
        if (tag === undefined) continue;
        if (!projection.atEdge) {
          tag.style.display = 'none';
          continue;
        }
        tag.style.display = '';
        frame ??= {
          width: tag.parentElement?.clientWidth ?? 0,
          height: tag.parentElement?.clientHeight ?? 0,
        };
        const { width, height } = frame;
        /** Tourné vers l'intérieur : collé au bord droit, le cartouche part vers la gauche ; collé
         *  en haut ou en bas, il se pose dans l'écran plutôt qu'à cheval sur le bord. */
        const across = projection.edgeX > width / 2 ? '-100%' : '0';
        const down =
          projection.edgeY < height * 0.15
            ? '0'
            : projection.edgeY > height * 0.85
              ? '-100%'
              : '-50%';
        tag.style.transform = `translate3d(${projection.edgeX}px, ${projection.edgeY}px, 0) translate(${across}, ${down})`;
      }
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

  // Les nœuds posés ici naissent cachés et c'est la prochaine image qui les place. La carte ne
  // rend plus sans raison (`engine/frame-demand.ts`) : chaque rendu de ce composant en demande
  // donc une — sans dépendances, exprès, pour qu'aucun changement de la liste ne passe à côté.
  useEffect(() => {
    engine?.invalidate();
  });

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
      {/* L'ancre porte la translation, le bouton le zoom de l'interface : réunis, le zoom
          multiplierait aussi la position et le cartouche tomberait hors de l'écran. */}
      {[...destinations].map(([id, name]) => (
        <div
          key={`destination-${id}`}
          className="destination-anchor"
          style={{ display: 'none' }}
          ref={(node) => {
            register(named.current, id, node);
          }}
        >
          <button
            type="button"
            className="destination-edge"
            onClick={() => engine?.journeyTo([id])}
          >
            {name}
            <span aria-hidden>›</span>
          </button>
        </div>
      ))}
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

function titleOf(group: IndicatorGroup, kept: ReadonlyMap<string, MapLabel>): string {
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
