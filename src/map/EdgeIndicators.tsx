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
  clearOfColumns,
  cluster,
  glideToward,
  idleConstruction,
  layerOf,
  sideOf,
  slideAxisOf,
  strongestMark,
  type IndicatorToggles,
  type IndicatorGroup,
  type RawIndicator,
  type AlertMark,
} from '@/domain/indicators';
import { boxesOverlap, type ScreenBox } from '@/domain/label-groups';
import { IndicatorGlyph } from '@/shell/IndicatorGlyph';
import type { LabelProjection } from './engine/labels';
import type { MapEngine } from './engine';
import { useBoardInsets, useNarrowScreen } from '@/shell/viewport';
import { useMapMotion } from '@/data/mapMotion';
import { heldRim } from './frame-need';
import { useLayerSize } from './layer-size';

/**
 * The screen edge. An entity out of frame is not lost: its label folds onto the rim,
 * reduced to its pictogram alone, and a click brings the camera back to it.
 *
 * One token per edge and per category (`cluster`). Two cadences, never mixed: position follows
 * the camera per frame, written as `transform` on the anchor node; grouping, which decides
 * *which* nodes exist, only recomputes at orbit rest. Grouping per frame would flicker the
 * counts at every degree of orbit, for a result nobody would have time to read.
 *
 * Classes styled in `src/styles/indicators.css`:
 * `indicator--<category>` · `--clustered` · `--threat` ·
 * `--attention`.
 */
export function EdgeIndicators({
  labels,
  engine,
  toggles,
  destinations,
  held = null,
}: {
  labels: ReadonlyArray<MapLabel>;
  engine: MapEngine | null;
  toggles: IndicatorToggles;
  /**
   * **Les drapeaux d'arrivée de mes mouvements, nommés au bord quand ils sont hors champ**
   * (carte-lisible, 03/10). Ils ne se regroupent pas et ne suivent aucune bascule : chacun porte
   * son nom, et un toucher y recentre la carte. Le même passage du moteur les pose.
   */
  destinations: ReadonlyMap<string, string>;
  /**
   * **L'objet tenu** (#591) : l'étiquette de ce que la feuille ouverte porte — la pile en main, un
   * site, un camp, un objectif, un point. Hors champ ou sous la feuille, un jeton à lui le
   * rappelle au bord ; comme les destinations, il ne suit ni bascule ni regroupement. `covered`
   * est ce que la feuille ouverte prend en bas, mesuré sur elle : la marge publiée la suit de
   * moins près qu'une fiche posée sur la barre.
   */
  held?: { readonly id: string; readonly covered: number } | null;
}) {
  const insets = useBoardInsets();
  const narrowScreen = useNarrowScreen();
  const narrow = useRef(narrowScreen);
  narrow.current = narrowScreen;
  const mapMotion = useMapMotion();
  const motion = useRef(mapMotion);
  motion.current = mapMotion;
  /** Où en est le glissé de chaque jeton nommé : l'écart qu'il a pris pour dégager la bulle. */
  const glides = useRef(new Map<string, { offset: number; at: number }>());
  const heldTag = useRef<HTMLElement | null>(null);
  const heldBottom = Math.max(insets.bottom, held?.covered ?? 0);
  const heldInsets = useMemo(() => ({ ...insets, bottom: heldBottom }), [insets, heldBottom]);
  const kept = useMemo(
    () =>
      new Map(
        labels
          .filter((label) => {
            const category = CATEGORY_BY_TYPE[label.type];
            return category !== undefined && toggles[layerOf(category)];
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
  const layer = useRef<HTMLDivElement>(null);
  const size = useLayerSize(layer);

  const compose = useCallback(() => {
    const { width, height } = size.current;
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
          reach: projection.distance,
        },
      ];
    });
    const composed = cluster(raw, width, height);
    setGroups((previous) => (sameGroups(previous, composed) ? previous : composed));
  }, [kept, size]);

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
      const { width, height } = size.current;
      /** Les étiquettes de mes colonnes, lues seulement quand un nom est au bord. */
      const origin = layer.current?.getBoundingClientRect();
      const nameAtEdge = projections.some(
        (projection) => projection.atEdge && named.current.has(projection.id),
      );
      const parent = layer.current?.parentElement;
      const columns =
        origin !== undefined && nameAtEdge
          ? shownBoxes(parent, '.label--my-movement .label-block', origin)
          : [];
      /** La bulle de pile ouverte (#623), seulement au téléphone : au bureau la fiche en main la
       *  remplace. Lue dans le DOM comme les colonnes, car c'est le CSS qui l'ouvre. */
      const bubbles =
        origin !== undefined && nameAtEdge && narrow.current
          ? shownBoxes(parent, '.cargo-tags .cargo-tag-body', origin)
          : [];
      const heldNode = heldTag.current;
      if (heldNode !== null) {
        const rim = heldRim(
          held === null ? null : engine.boardPointOfAnchor(held.id, true),
          size.current,
          heldInsets,
        );
        heldNode.style.display = rim === null ? 'none' : '';
        if (rim !== null) {
          heldNode.style.transform = `translate3d(${rim.x}px, ${rim.y}px, 0) translate(-50%, -50%)`;
          heldNode.style.setProperty('--heading', `${rim.heading}rad`);
        }
      }
      for (const projection of projections) {
        const tag = named.current.get(projection.id);
        if (tag === undefined) continue;
        if (!projection.atEdge) {
          tag.style.display = 'none';
          glides.current.delete(projection.id);
          continue;
        }
        tag.style.display = '';
        /** Tourné vers l'intérieur : collé au bord droit, le cartouche part vers la gauche ; collé
         *  en haut ou en bas, il se pose dans l'écran plutôt qu'à cheval sur le bord. */
        const across = projection.edgeX > width / 2 ? '-100%' : '0';
        const down =
          projection.edgeY < height * 0.15
            ? '0'
            : projection.edgeY > height * 0.85
              ? '-100%'
              : '-50%';
        const pill = tag.firstElementChild?.getBoundingClientRect();
        const wide = pill?.width ?? 0;
        const tall = pill?.height ?? 0;
        const left = projection.edgeX - (across === '0' ? 0 : wide);
        const top = projection.edgeY - (down === '0' ? 0 : down === '-100%' ? tall : tall / 2);
        // Les colonnes (#376) se dégagent toujours sur `y`, quel que soit le bord ; seule la bulle
        // glisse sur l'axe du bord, entre les marges du plateau. Si rien ne tient sous les
        // colonnes, le nom sort de l'écran plutôt que de les recouvrir, comme avant #623.
        const axis = slideAxisOf(sideOf(projection.edgeX, projection.edgeY, width, height));
        const box = { left, top, right: left + wide, bottom: top + tall };
        const step = clearOfColumns(box, columns, height) - top;
        const stepped = shiftedBy(box, 'y', step);
        const [min, max] =
          axis === 'y'
            ? [heldInsets.top, height - heldInsets.bottom]
            : [heldInsets.left, width - heldInsets.right];
        const from = axis === 'y' ? stepped.top : stepped.left;
        let aside = clearOfColumns(stepped, bubbles, max, axis, min) - from;
        // Dégager la bulle ne rejette pas le nom sur une colonne : il reste alors où il est.
        if (columns.some((column) => boxesOverlap(column, shiftedBy(stepped, axis, aside), 0)))
          aside = 0;
        const now = performance.now();
        const glide = glides.current.get(projection.id) ?? { offset: 0, at: now };
        const slid =
          motion.current === 'full' ? glideToward(glide.offset, aside, now - glide.at) : aside;
        if (slid === 0 && aside === 0) glides.current.delete(projection.id);
        else glides.current.set(projection.id, { offset: slid, at: now });
        tag.style.transform = `translate3d(${projection.edgeX + (axis === 'x' ? slid : 0)}px, ${projection.edgeY + step + (axis === 'y' ? slid : 0)}px, 0) translate(${across}, ${down})`;
      }
      for (const sum of sums) {
        sum.x = sum.y = sum.count = 0;
      }

      for (const projection of projections) {
        if (!projection.atEdge) continue;
        const rank = membership.get(projection.id);
        if (rank === undefined) continue;
        const sum = sums[rank];
        // Grouping waits for rest; a member that slid round a corner meanwhile would pull the
        // token off its edge, into the screen.
        if (
          sum === undefined ||
          sideOf(projection.edgeX, projection.edgeY, width, height) !== groups[rank]?.side
        )
          continue;
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
  }, [engine, groups, sums, membership, size, held, heldInsets]);

  // Les nœuds posés ici naissent cachés et c'est la prochaine image qui les place. La carte ne
  // rend plus sans raison (`engine/frame-demand.ts`) : des groupes ou des noms neufs en demandent
  // une ; un rendu qui n'en change aucun, non (#189).
  useEffect(() => {
    engine?.invalidate();
  }, [engine, groups, destinations, held, heldInsets]);

  // La bulle de pile s'ouvre et se ferme par ses classes (CSS) : le jeton qui la dégage a besoin
  // d'images pour glisser, et la carte au repos n'en rend plus (`engine/frame-demand.ts`).
  useEffect(() => {
    const root = layer.current?.parentElement;
    if (!engine || !root || !narrowScreen) return;
    const watch = new MutationObserver((changes) => {
      if (
        changes.some(
          (change) =>
            change.target instanceof Element &&
            change.target.matches('.cargo-tag, .label-anchor, .label'),
        )
      )
        engine.invalidate();
    });
    watch.observe(root, { subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => watch.disconnect();
  }, [engine, narrowScreen]);

  // The attention accent falls at the due time, not per frame: a one-second beat suffices and
  // it is the same cadence as the labels' countdowns.
  useEffect(() => {
    const apply = () => {
      const now = Date.now();
      for (const group of groups) {
        const root = roots.current.get(group.id);
        if (!root) continue;
        const members = group.members
          .map((member) => kept.get(member))
          .filter((label): label is MapLabel => label !== undefined);
        const mark = strongestMark(members.map(alertMark));
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
    <div className="edge-indicators" ref={layer}>
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
      {held !== null && (
        <div
          className="held-anchor"
          style={{ display: 'none' }}
          ref={(node) => {
            heldTag.current = node;
          }}
        >
          <button
            type="button"
            className="held-edge"
            aria-label={fr.edgeIndicators.held}
            title={fr.edgeIndicators.held}
            onClick={() => engine?.journeyTo([held.id], [], heldBottom / 2, undefined, true)}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <path
                d="M4 12h15M13 5l7 7-7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="square"
              />
            </svg>
          </button>
        </div>
      )}
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
            onClick={() => engine?.journeyTo([group.nearest])}
          >
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

const MARKS: ReadonlyArray<AlertMark> = ['threat'];

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
        group.nearest === other.nearest &&
        group.members.length === other.members.length &&
        group.members.every((member, place) => member === other.members[place])
      );
    })
  );
}

/** Les boîtes lisibles des nœuds que dit le sélecteur, dans le repère de la couche. Repliée par
 *  `degrade` ou fermée par le CSS, une boîte ne se lit pas : rien à dégager. */
function shownBoxes(
  parent: Element | null | undefined,
  selector: string,
  origin: DOMRect,
): ScreenBox[] {
  return [...(parent?.querySelectorAll(selector) ?? [])].flatMap((node) => {
    const box = node.getBoundingClientRect();
    const shown = node.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    return box.width === 0 || !shown
      ? []
      : [
          {
            left: box.left - origin.left,
            top: box.top - origin.top,
            right: box.right - origin.left,
            bottom: box.bottom - origin.top,
          },
        ];
  });
}

const shiftedBy = (box: ScreenBox, axis: 'x' | 'y', by: number): ScreenBox =>
  axis === 'y'
    ? { ...box, top: box.top + by, bottom: box.bottom + by }
    : { ...box, left: box.left + by, right: box.right + by };
