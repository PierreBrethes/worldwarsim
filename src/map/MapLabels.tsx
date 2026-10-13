// Le moteur de carte est une classe impérative à qui on assigne `.onLabels` —
// React Compiler lit ça comme une mutation interdite. Exclusion volontaire : le
// moteur n'importe pas React (CLAUDE.md).
'use no memo';

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { asDuration } from '@/domain/duration';
import { fr } from '@/i18n/fr';
import { useMapMotion } from '@/data/mapMotion';
import { LoadingGauge, MarchGauge } from './LoadingGauge';
import {
  URGENCY_MS,
  cartoucheShown,
  isCountdown,
  type MapLabel,
  type LabelPictogram,
  type Reach,
} from '@/domain/labels';
import { buttonAt, cleanPressAt, type CleanPress, type MouseMapping } from '@/domain/mouse-mapping';
import {
  GROUP_MARGIN_PX,
  boxesOverlap,
  fanOffsets,
  groupOverlapping,
  separatingDistance,
  type GroupCandidate,
  type LabelGroup,
  type ScreenBox,
} from '@/domain/label-groups';
import { Pictogram, type PictogramName } from '@/shell/IndicatorGlyph';
import { Glyph } from '@/shell/Glyph';
import { silhouettePaths } from './engine/silhouettes';
import { DepositMark } from '@/emblems/DepositMark';
import { resourceColor } from '@/emblems/ResourceIcon';
import type { DetailLevel, LabelProjection } from './engine/labels';
import { posterPlacement, type PosterSpot } from '@/domain/poster-placement';
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
  selectedPlate,
  secondarySelected,
  onMovementHover,
  onReachHover,
  poster,
  onSelect,
  onOpenBuilding,
  onOpenStack,
  onOpenLoot,
  onOpenCamp,
  onOpenObjective,
  onAct,
  mapping,
  holding,
  onHoldOver,
  muted,
  destinations,
}: {
  labels: ReadonlyArray<MapLabel>;
  engine: MapEngine | null;
  /** L'étiquette désignée — une troupe posée, cliquée seule : sa planche prend l'encre du joueur
   *  et rien d'autre ne bouge (décision du 29/08). */
  selected: string | null;
  /** **La pile mise en avant prend le visage de ce qui est coché** (carte-lisible, 03/10) : un
   *  char coché dans une garnison d'infanterie se voit char. `null` garde la planche de la pile. */
  selectedPlate: string | null;
  /** A private crate card may coexist with the armed troop designation. */
  secondarySelected: string | null;
  onMovementHover: (id: string | null) => void;
  /** What the label covers on the ground, while the pointer is on it and no longer. */
  onReachHover: (reach: Reach | null) => void;
  /** **The press card a hovered piece wears** (`PosterLayer`), `null` for a piece that has none. */
  poster: (label: MapLabel) => ReactNode;
  onSelect: (name: string | null) => void;
  /** The click's screen point travels with it: what a mast opens is anchored to the mast. */
  onOpenBuilding: (buildingId: string, clientX: number, clientY: number) => void;
  /** **Une pile à moi se lève, une adresse de garnison s'ouvre** (ADR 0026 §6) : l'étiquette
   *  entière, la carte en tire la pile ou la cible de la pose. */
  onOpenStack: (label: MapLabel, clientX: number, clientY: number) => void;
  /** Coincident private sightings cycle through one shared pointer target. */
  onOpenLoot: (sightingIds: ReadonlyArray<string>, clientX: number, clientY: number) => void;
  /** **Le cartouche d'un camp relevé** (ADR 0024 §1) : il lit, il ne commande rien — les ordres
   *  se prennent au clic droit, comme partout ailleurs sur la carte. */
  onOpenCamp: (campId: string, clientX: number, clientY: number) => void;
  /** **Le cartouche d'un objectif neutre** : il lit ce qui est public — nom, palier, dépôt
   *  restant — et jamais ce qui le tient. Comme le camp, il ne commande rien. */
  onOpenObjective: (objectiveId: string, clientX: number, clientY: number) => void;
  /** **Le geste qui agit, quel que soit le bouton qui le porte** (`mouseMapping`) : la rose
   *  s'ouvre sur l'étiquette comme elle s'ouvre sur le sol. */
  onAct: (label: MapLabel, clientX: number, clientY: number) => void;
  mapping: MouseMapping;
  /** **Une pièce en main**, et le clic gauche pose au lieu de lire — sauf sur une de mes piles,
   *  dont le clic dit lui-même s'il reprend, repose ou vise (`clickPile`). */
  holding: boolean;
  /** Pièce en main, la souris qui passe sur une étiquette : la toile ne la voit plus, et c'est
   *  pourtant là qu'on pose sur un mât, un camp, un objectif. */
  onHoldOver: (labelId: string, clientX: number, clientY: number) => void;
  /** **Le mode de pose passe devant tout** : une étiquette qui répondrait au clic ferait deux
   *  réponses au geste qui n'en attend qu'une — le point de côte sous le curseur. */
  muted: boolean;
  /** Les destinations de la colonne armée, cerclées au pied (lot mobile-3, A8). */
  destinations: ReadonlySet<string>;
}) {
  const anchors = useRef(new Map<string, HTMLElement>());
  const roots = useRef(new Map<string, HTMLElement>());
  const blocks = useRef(new Map<string, HTMLElement>());
  const countdowns = useRef(new Map<string, HTMLElement>());
  const motion = useMapMotion();
  const states = useRef(new Map<string, RenderState>());
  const pendingDegrade = useRef(0);
  /**
   * **Les cartouches réunis** : leur composition change au repos de la caméra, jamais à chaque
   * image — c'est un rendu React, comme la liste des étiquettes. Leur position, elle, suit la
   * boucle comme celle de n'importe quelle étiquette.
   */
  const [groups, setGroups] = useState<ReadonlyArray<LabelGroup>>([]);
  const groupsNow = useRef<ReadonlyArray<LabelGroup>>([]);
  /** The members of each group that hang a plate — a site under the crane has none to fade. */
  const platedNow = useRef<ReadonlyMap<string, ReadonlyArray<string>>>(new Map());
  const groupAnchors = useRef(new Map<string, HTMLElement>());
  /** La largeur mesurée de chaque cartouche, pour savoir de combien rapprocher la caméra. */
  const widths = useRef(new Map<string, number>());
  /** `click` does not say which pointer made it everywhere Safari runs: the press does. */
  const pressedWith = useRef('mouse');
  /** La pile de mâts ouverte en liste, par son identifiant — elle se referme si elle se défait. */
  const [opened, setOpened] = useState<string | null>(null);
  const openedGroup = groups.find((group) => group.id === opened) ?? null;
  useEffect(() => {
    if (openedGroup === null) return;
    const elsewhere = (event: PointerEvent) => {
      const anchor = groupAnchors.current.get(openedGroup.id);
      if (anchor?.contains(event.target as Node) !== true) setOpened(null);
    };
    document.addEventListener('pointerdown', elsewhere);
    return () => document.removeEventListener('pointerdown', elsewhere);
  }, [openedGroup]);

  /**
   * **La pièce sous le pointeur, une à la fois** (retours du 13/10) : la souris qui la survole,
   * ou le doigt qui vient de la toucher — faute de survol, le toucher la nomme jusqu'au suivant.
   * Écrit sur le nœud et non dans l'état React : un survol ne rend pas cent étiquettes.
   */
  const pointed = useRef<string | null>(null);
  const showPoster = useRef<(id: string | null) => void>(() => {});
  const posterAnchor = useRef<HTMLDivElement | null>(null);
  const posterPlace = useRef<PosterPlace | null>(null);
  const posterSide = useRef<{ id: string; side: PosterSpot['side'] } | null>(null);
  const point = useCallback(
    (id: string | null) => {
      const previous = pointed.current;
      pointed.current = id;
      for (const target of new Set([previous, id])) {
        const root = target === null ? undefined : roots.current.get(target);
        const label = labels.find((candidate) => candidate.id === target);
        if (root === undefined || label === undefined) continue;
        root.classList.toggle('label--pointed', target === id);
        root.classList.toggle(
          'label--quiet',
          !cartoucheShown(label, {
            pointed: target === id,
            selected: root.classList.contains('label--selected'),
          }),
        );
      }
    },
    [labels],
  );
  /**
   * **What the mouse is over, by two routes**: a label in the DOM, or a piece the canvas drew
   * (`MapEngine.onPieceHover`) — the figurine, the maquette, the block stand far wider than their
   * label. The label wins, being on top; the piece answers exactly as its label would.
   */
  const over = useRef<{ label: string | null; piece: string | null }>({ label: null, piece: null });
  const hovered = useRef<string | null>(null);
  /** The piece just pressed: what it opened stands in for its poster until the pointer leaves
   *  it — the canvas hands the piece back at the release, under the window it opened. */
  const pressed = useRef<string | null>(null);
  const hover = useCallback(
    (poster: boolean) => {
      // A label that went away takes no `pointerleave` with it: it no longer stands in the way.
      const present = (id: string | null) => labels.some((candidate) => candidate.id === id);
      if (!present(over.current.label)) over.current.label = null;
      const id = over.current.label ?? over.current.piece;
      const previous = hovered.current;
      if (id === previous) return;
      hovered.current = id;
      if (id !== pressed.current) pressed.current = null;
      const left = labels.find((candidate) => candidate.id === previous);
      if (left?.anchor.kind === 'movementHead') onMovementHover(null);
      const label = labels.find((candidate) => candidate.id === id);
      point(label?.id ?? null);
      if (label?.anchor.kind === 'movementHead') onMovementHover(label.anchor.arc);
      onReachHover(label?.reach ?? null);
      showPoster.current(
        poster && label !== undefined && label.id !== pressed.current ? label.id : null,
      );
    },
    [labels, point, onMovementHover, onReachHover],
  );

  useEffect(() => {
    const elsewhere = (event: PointerEvent) => {
      const held = pointed.current === null ? undefined : roots.current.get(pointed.current);
      if (event.pointerType === 'touch' && held?.contains(event.target as Node) !== true)
        point(null);
    };
    document.addEventListener('pointerdown', elsewhere);
    return () => document.removeEventListener('pointerdown', elsewhere);
  }, [point]);

  const apply = useCallback((id: string, state: RenderState) => {
    const root = roots.current.get(id);
    if (!root) return;
    const expanded = state.lod === 'expanded' && !state.folded;
    root.classList.toggle('label--expanded', expanded);
    root.classList.toggle('label--glyph', !expanded);
    root.classList.toggle('label--grouped', expanded && state.grouped);
    const stagger = expanded ? state.stagger : 0;
    if (root.dataset.stagger !== String(stagger)) {
      root.dataset.stagger = String(stagger);
      // Mesuré en pixels d'écran, posé sous le `zoom` de l'interface : on le défait.
      const zoom = Number(getComputedStyle(root).zoom) || 1;
      root.style.setProperty('--label-stagger', `${Math.round(stagger / zoom)}px`);
    }
  }, []);

  /**
   * Overlap degradation, by decreasing priority: of two overlapping labels, the lower
   * priority falls back to the glyph — **unless they are two piles, or two buildings**: those
   * share one cartouche instead (carte-lisible, 03/10), « 2 piles · 5 », and keep their plates.
   * The shared cartouche covers what its members covered, so what comes after folds against it.
   *
   * The order of the two loops is everything: expand **everyone** in the DOM first, measure
   * after. Measuring before expanding read the previous round's folded width — every label
   * then seemed to fit in its corner, none was folded, and the unreadable pile re-formed.
   * A degradation that contradicted itself from one round to the next.
   */
  const degrade = useCallback(() => {
    // Mesurée nommée, la pièce survolée replierait ses voisines tant qu'on la survole, puis les
    // rendrait en la quittant : on mesure la carte au repos, et on la renomme après.
    const held = pointed.current;
    point(null);
    const candidates = labels
      .filter((label) => {
        const state = states.current.get(label.id);
        // Un drapeau n'a pas de mots à replier, et il ne cède sa place à personne.
        return state?.visible === true && state.lod === 'expanded' && label.type !== 'arrival';
      })
      .slice()
      .sort((first, second) => second.priority - first.priority);

    for (const label of labels) {
      const state = states.current.get(label.id);
      if (!state) continue;
      state.folded = false;
      state.grouped = false;
      state.stagger = 0;
      apply(label.id, state);
    }

    const measured = candidates.flatMap((label) => {
      const block = blocks.current.get(label.id);
      const state = states.current.get(label.id);
      if (!block || !state) return [];
      const rect = block.getBoundingClientRect();
      widths.current.set(label.id, rect.width);
      return [{ label, state, rect }];
    });

    const formed = groupOverlapping(
      measured.flatMap<GroupCandidate>(({ label, state, rect }) =>
        label.type === 'stack' || label.type === 'building'
          ? [
              {
                id: label.id,
                kind: label.type,
                box: rect,
                x: state.x,
                y: state.y,
                count: label.force?.headcount ?? 1,
              },
            ]
          : [],
      ),
    );
    const groupOf = new Map(
      formed.flatMap((group) => group.members.map((member) => [member, group] as const)),
    );
    /**
     * **Au plancher du zoom, le regroupement s'ouvre en éventail** : deux piles à quinze
     * kilomètres l'une de l'autre ne se séparent à aucune distance permise, et un cartouche réuni
     * qu'on touche sans effet est une promesse cassée. Chacun reprend alors ses mots, sur un mât
     * allongé juste assez pour dégager ceux qui le précèdent (`fanOffsets`).
     */
    /** **Sauf une pile de mâts d'une même région** (refonte mobile, 1r) : aucune distance ne la
     *  séparera, elle reste une pile et s'ouvre en liste au toucher. */
    const atFloor = engine?.atZoomFloor() ?? false;
    const fans = (group: LabelGroup) => atFloor && !group.coincident;
    const lifts = new Map<string, number>();
    const rectOf = new Map(measured.map(({ label, rect }) => [label.id, rect] as const));
    for (const group of formed.filter(fans)) {
      const offsets = fanOffsets(group.members.map((member) => rectOf.get(member)!));
      group.members.forEach((member, rank) => lifts.set(member, offsets[rank] ?? 0));
    }

    // Un cartouche réuni se place au rang de son premier membre, et cède comme une étiquette :
    // replié, il rend leurs mots à personne et ses membres retombent tous au glyphe.
    const kept: ScreenBox[] = [];
    const placedGroups = new Map<string, boolean>();
    for (const { label, state, rect } of measured) {
      const group = groupOf.get(label.id);
      if (group !== undefined) {
        let standing = placedGroups.get(group.id);
        if (standing === undefined) {
          standing = !kept.some((other) => boxesOverlap(other, group.box, OVERLAP_MARGIN));
          placedGroups.set(group.id, standing);
          if (standing) kept.push(group.box);
        }
        state.grouped = standing && !fans(group);
        state.folded = !standing;
        if (standing && fans(group)) state.stagger = lifts.get(label.id) ?? 0;
      } else {
        state.folded = kept.some((other) => boxesOverlap(other, rect, OVERLAP_MARGIN));
        if (!state.folded) kept.push(rect);
      }
      apply(label.id, state);
    }

    const shown = formed.filter((group) => !fans(group));
    const plated = new Set(
      measured.flatMap(({ label }) => (label.plate === null ? [] : [label.id])),
    );
    platedNow.current = new Map(
      shown.map((group) => [group.id, group.members.filter((member) => plated.has(member))]),
    );
    groupsNow.current = shown;
    setGroups((previous) => (sameGroups(previous, shown) ? previous : shown));
    point(held);
  }, [labels, apply, engine, point]);

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
      labels.map((label) => [
        label.id,
        {
          visible: false,
          lod: 'glyph',
          folded: false,
          grouped: false,
          stagger: 0,
          fade: 1,
          dressed: 0,
          plateScale: 1,
          x: 0,
          y: 0,
        },
      ]),
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
        // The plate gives way to the figurines standing under it; the label stays to take the pointer.
        const dressed = Math.round(projection.dressed * 20) / 20;
        if (dressed !== state.dressed) {
          state.dressed = dressed;
          anchor.style.setProperty('--dressed', String(dressed));
          // Dressed, the piece takes the pointer from the canvas (`onPieceHover`, `onPiecePress`):
          // its label, standing in the middle of it, would steal the press of what it covers.
          anchor.classList.toggle('label-anchor--dressed', dressed >= 0.5);
        }

        const plate = Math.round(projection.plateScale * 20) / 20;
        if (plate !== state.plateScale) {
          state.plateScale = plate;
          anchor.style.setProperty('--plate-scale', String(plate));
        }

        anchor.style.transform = `translate3d(${projection.x}px, ${projection.y}px, 0)`;
        state.x = projection.x;
        state.y = projection.y;
        if (projection.lod !== state.lod) {
          state.lod = projection.lod;
          apply(projection.id, state);
          scheduleDegrade();
        }
      }

      const place = posterPlace.current;
      const poster = posterAnchor.current;
      const under = place === null ? undefined : states.current.get(place.id);
      if (place !== null && poster !== null && under !== undefined) {
        poster.style.visibility = under.visible ? '' : 'hidden';
        // A drawn piece (maquette, figurines, block, pawn) is cleared whole, from its projected
        // box; far away, where the plate is the piece, the poster hangs from the label.
        const rect = engine.pieceRect(place.id);
        let side: PosterSpot['side'];
        let x: number;
        let y: number;
        let stem = 0;
        if (rect !== null) {
          const spot = posterPlacement(
            rect,
            { width: place.width, height: place.height },
            { width: layerWidth(poster), height: poster.parentElement?.clientHeight ?? Infinity },
            {
              top: place.insetTop,
              bottom: place.insetBottom,
              margin: POSTER_MARGIN_PX,
              stem: POSTER_STEM_PX,
            },
            posterSide.current?.id === place.id ? posterSide.current.side : undefined,
          );
          ({ side, x, y, stem } = spot);
          posterSide.current = { id: place.id, side };
        } else {
          const top = under.y - place.lift;
          side = top - place.height - POSTER_STEM_PX < POSTER_MARGIN_PX ? 'below' : 'above';
          const half = place.width / 2 + POSTER_MARGIN_PX;
          x = Math.min(Math.max(under.x + place.shift, half), layerWidth(poster) - half);
          y = side === 'below' ? under.y : top;
        }
        for (const each of POSTER_SIDES)
          poster.classList.toggle(`map-poster-anchor--${each}`, each === side);
        poster.style.setProperty('--stem', `${stem}px`);
        poster.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }

      // Le cartouche réuni se tient au pied du premier des siens — le plus prioritaire, celui
      // dont il prend la place — et disparaît avec lui.
      for (const group of groupsNow.current) {
        const anchor = groupAnchors.current.get(group.id);
        const lead = states.current.get(group.members[0] ?? '');
        if (!anchor) continue;
        const shown = lead?.visible === true && lead.grouped;
        anchor.style.display = shown ? '' : 'none';
        if (!shown) continue;
        anchor.style.transform = `translate3d(${lead.x}px, ${lead.y}px, 0)`;
        // Its plates give way as its members' do: the maquettes stand in a ring under it.
        const plated = platedNow.current.get(group.id) ?? [];
        const dressed =
          plated.length === 0
            ? 0
            : Math.min(...plated.map((member) => states.current.get(member)?.dressed ?? 0));
        anchor.style.setProperty('--dressed', String(dressed));
        anchor.classList.toggle('label-anchor--dressed', dressed >= 0.5);
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

  // Les nœuds posés ici naissent cachés et c'est la prochaine image qui les place. La carte ne
  // rend plus sans raison (`engine/frame-demand.ts`) : chaque rendu de ce composant en demande
  // donc une — sans dépendances, exprès, pour qu'aucun changement de la liste ne passe à côté.
  useEffect(() => {
    engine?.invalidate();
  });

  /**
   * **Toucher un regroupement rapproche la caméra jusqu'à ce que les siens se séparent** — la
   * paire la plus serrée doit s'écarter d'un cartouche entier, le plus large des siens.
   */
  const separate = useCallback(
    (group: LabelGroup) => {
      if (!engine) return;
      const points = group.members.flatMap((member) => {
        const state = states.current.get(member);
        return state?.visible === true ? [{ x: state.x, y: state.y }] : [];
      });
      const widest = Math.max(0, ...group.members.map((member) => widths.current.get(member) ?? 0));
      const needed = (widest + 2 * GROUP_MARGIN_PX) * SEPARATION_SLACK;
      engine.journeyTo(
        group.members,
        [],
        0,
        separatingDistance(engine.cameraDistance(), points, needed),
      );
    },
    [engine],
  );

  /**
   * **One answer to a press on a piece**, whether it landed on its label or on what the canvas
   * drew of it: the left press or the tap reads — lifts, opens, selects — and the button that
   * carries `agir` acts, the mapping having said which (`cleanPressAt`).
   */
  const pressLabel = (
    label: MapLabel,
    press: CleanPress,
    pointerType: string,
    clientX: number,
    clientY: number,
  ) => {
    pressed.current = label.id;
    if (pointerType === 'touch') point(label.id);
    if (press.picks) {
      if (holding && label.type !== 'stack') {
        onAct(label, clientX, clientY);
        return;
      }
      // A building's mast opens its surface and nothing else: opening a window *and*
      // moving the country selection would be two answers to one click.
      if (label.lootSightingId !== null) {
        onOpenLoot(nearbyLootSightings(label, labels, states.current), clientX, clientY);
      } else if (label.building !== null) {
        onOpenBuilding(label.building.id, clientX, clientY);
      } else if (label.station !== null) {
        onOpenStack(label, clientX, clientY);
        // Lever ne fait que lever (ADR 0026 §6) : la pile ne rouvre pas de rose au même clic.
        if (label.type === 'stack') return;
      } else if (label.camp !== null) {
        onOpenCamp(label.camp.id, clientX, clientY);
      } else if (label.objective !== null) {
        onOpenObjective(label.objective.id, clientX, clientY);
      } else if (label.hostCountry !== null) onSelect(label.hostCountry);
    }
    // Le clic net gauche lit toujours ; il agit en plus quand c'est lui qui porte
    // `agir` — un seul geste, les deux réponses. Le toucher net, lui, agit toujours.
    if (press.acts) onAct(label, clientX, clientY);
  };

  // Rewired at every render, like the label layer's own loop: the press reads this render's labels.
  useEffect(() => {
    if (!engine) return;
    engine.onPieceHover = (labelId) => {
      over.current.piece = labelId;
      hover(true);
    };
    engine.onPiecePress = ({ labelId, press, pointerType, clientX, clientY }) => {
      const label = labels.find((candidate) => candidate.id === labelId);
      if (muted || label === undefined || (!press.picks && !press.acts)) return false;
      showPoster.current(null);
      pressLabel(label, press, pointerType, clientX, clientY);
      return true;
    };
  });
  useEffect(
    () => () => {
      if (!engine) return;
      engine.onPieceHover = undefined;
      engine.onPiecePress = undefined;
    },
    [engine],
  );

  const inkOf = (id: string): string | null => labels.find((label) => label.id === id)?.ink ?? null;

  return (
    <div className={muted ? 'map-labels pointer-events-none' : 'map-labels'}>
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
            className={classesOf(
              label,
              label.id === selected || label.id === secondarySelected,
              destinations.has(label.id),
            )}
            role={label.lootSightingId === null ? undefined : 'button'}
            tabIndex={label.lootSightingId === null ? undefined : 0}
            aria-label={label.lootSightingId === null ? undefined : fr.loot.openMarker}
            style={label.ink === null ? undefined : ({ '--label-ink': label.ink } as CSSProperties)}
            onPointerEnter={(event) => {
              // A finger has no hover to take back: what it lit would stay lit (C4).
              if (event.pointerType === 'touch') return;
              over.current.label = label.id;
              hover(event.buttons === 0);
            }}
            onPointerMove={(event) => {
              if (holding && event.pointerType !== 'touch')
                onHoldOver(label.id, event.clientX, event.clientY);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === 'touch') return;
              if (over.current.label === label.id) over.current.label = null;
              hover(true);
            }}
            onClick={(event) =>
              pressLabel(
                label,
                cleanPressAt(mapping, pressedWith.current, event.button, holding),
                pressedWith.current,
                event.clientX,
                event.clientY,
              )
            }
            onKeyDown={(event) => {
              if (label.lootSightingId !== null && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                const rect = roots.current.get(label.id)?.getBoundingClientRect();
                onOpenLoot(
                  nearbyLootSightings(label, labels, states.current),
                  rect === undefined ? 0 : rect.left + rect.width / 2,
                  rect === undefined ? 0 : rect.top + rect.height / 2,
                );
              }
            }}
            onPointerDown={(event) => {
              pressedWith.current = event.pointerType;
              // Un clic ouvre ce que la pièce ouvre — garnison, site, cartouche : l'affiche le
              // doublerait. Elle revient au survol suivant.
              showPoster.current(null);
              // L'autoscroll du navigateur s'arme au bouton du milieu et se plante sur la carte.
              if (buttonAt(event.button) === 'middle') event.preventDefault();
            }}
            onAuxClick={(event) => {
              if (buttonAt(event.button) !== 'middle' || mapping.middle !== 'act') return;
              onAct(label, event.clientX, event.clientY);
            }}
            onContextMenu={(event) => {
              // Le menu du navigateur est coupé quel que soit le rôle du bouton droit.
              event.preventDefault();
              if (mapping.right !== 'act') return;
              onAct(label, event.clientX, event.clientY);
            }}
          >
            <div
              className="label-block"
              ref={(node) => {
                register(blocks.current, label.id, node);
              }}
            >
              {(label.plate !== null || label.works !== null) && (
                <span className="label-pictogram">
                  {label.plate !== null && (
                    <img
                      className="label-plate"
                      src={
                        label.id === selected && selectedPlate !== null
                          ? selectedPlate
                          : label.plate
                      }
                      alt=""
                    />
                  )}
                  {/* Le mode chantier au loin : un fanion ocre sur la planche, ou seul sur le mât
                      d'un plan en file. L'heure et la barre sont à l'affiche. */}
                  {label.works !== null && (
                    <svg className="label-pennant" viewBox="0 0 16 22" width="16" height="22">
                      <path className="label-flag-pole" d="M2 1v21" />
                      <path
                        className="label-pennant-cloth"
                        d="M2.6 1.5h11.5l-2.6 3.6 2.6 3.6H2.6z"
                      />
                    </svg>
                  )}
                </span>
              )}
              {label.type === 'arrival' && (
                <span className="label-flag" aria-hidden>
                  <svg viewBox="0 0 16 22" width="16" height="22">
                    <path className="label-flag-pole" d="M2 1v21" />
                    <path className="label-flag-cloth" d="M2.6 1.5h11.5l-2.6 3.6 2.6 3.6H2.6z" />
                  </svg>
                </span>
              )}
              {label.deposit !== null && (
                <span
                  className="label-deposit"
                  style={{ color: resourceColor(label.deposit, true) }}
                >
                  <DepositMark resource={label.deposit} />
                </span>
              )}
              {label.lootSightingId !== null && (
                <span className="label-loot">
                  <Glyph size={28}>
                    <path d="M3.5 7.5h13v9h-13zM3.5 7.5l3-4h7l3 4M10 7.5v9M6.5 3.5 10 7.5l3.5-4" />
                  </Glyph>
                </span>
              )}
              {label.camp !== null && (
                <span className="label-camp">
                  <Glyph size={26}>
                    {silhouettePaths(label.camp.medium).map((path) => (
                      <path key={path} d={path} fill="currentColor" stroke="none" />
                    ))}
                  </Glyph>
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
                    <Fragment key={rank}>
                      <div
                        className="label-line label-line--countdown"
                        ref={(node) => {
                          register(countdowns.current, label.id, node);
                        }}
                      />
                      {line.since !== undefined && (
                        <MarchGauge since={line.since} dueAt={line.dueAt} />
                      )}
                    </Fragment>
                  ) : line.role === 'loading' ? (
                    <LoadingGauge key={rank} until={line.until} crawl={motion === 'full'} />
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
      {groups.map((group) => {
        const ink = inkOf(group.members[0] ?? '');
        const members = group.members.flatMap((member) => {
          const label = labels.find((candidate) => candidate.id === member);
          return label === undefined ? [] : [label];
        });
        /** **Une pile de mâts porte leurs planches** (refonte mobile, 1r) : deux, l'une sur
         *  l'autre — on voit ce qui se tient là avant de compter. */
        const plates =
          group.kind === 'building'
            ? members.flatMap((member) => (member.plate === null ? [] : [member.plate])).slice(0, 2)
            : [];
        return (
          <div
            key={group.id}
            className="label-anchor"
            style={{ display: 'none' }}
            ref={(node) => {
              register(groupAnchors.current, group.id, node);
            }}
          >
            <div
              className={`label label--expanded label--group label--${group.kind}-group label--clickable`}
              style={ink === null ? undefined : ({ '--label-ink': ink } as CSSProperties)}
            >
              <button
                type="button"
                className="label-block"
                aria-expanded={group.coincident ? opened === group.id : undefined}
                aria-label={
                  group.coincident
                    ? fr.labels.groupList(group.caption)
                    : fr.labels.groupZoom(group.caption)
                }
                onClick={() =>
                  group.coincident
                    ? setOpened((open) => (open === group.id ? null : group.id))
                    : separate(group)
                }
              >
                {plates.length > 0 && (
                  <span className="label-pictogram label-group-plates">
                    {plates.map((plate, rank) => (
                      <img key={rank} className="label-plate" src={plate} alt="" />
                    ))}
                  </span>
                )}
                <span className="label-bar" />
                <span className="label-lines">
                  <span className="label-line label-line--nature">
                    {group.caption}
                    {group.kind === 'building' && <span aria-hidden> ›</span>}
                  </span>
                </span>
              </button>
              {opened === group.id && (
                <GroupList
                  caption={group.caption}
                  members={members}
                  onOpen={(buildingId, clientX, clientY) => {
                    setOpened(null);
                    onOpenBuilding(buildingId, clientX, clientY);
                  }}
                  onClose={() => setOpened(null)}
                />
              )}
            </div>
          </div>
        );
      })}
      <PosterLayer
        register={showPoster}
        labels={labels}
        poster={poster}
        holding={holding}
        roots={roots}
        blocks={blocks}
        anchor={posterAnchor}
        place={posterPlace}
        engine={engine}
      />
    </div>
  );
}

/** Where the poster stands relative to its label's anchor, measured once per render of it. */
type PosterPlace = {
  readonly id: string;
  /** From the anchor up to the top of the piece the label draws — its plate, its silhouette. */
  readonly lift: number;
  /** From the anchor to the middle of that piece: a plate hangs left of its mast. */
  readonly shift: number;
  readonly width: number;
  readonly height: number;
  /** The strip of the HUD over the board, in the layer's pixels: nothing stands under it. */
  readonly insetTop: number;
  readonly insetBottom: number;
};

const POSTER_SIDES = ['above', 'below', 'left', 'right'] as const;

const layerWidth = (poster: HTMLElement): number => poster.parentElement?.clientWidth ?? Infinity;

/** The 15 px stem of `poster.css`, under the HUD zoom. */
const POSTER_STEM_PX = 18;
const POSTER_MARGIN_PX = 8;
/** A movement head draws nothing in the DOM — its pawn is in the scene, about this tall. */
const POSTER_MIN_LIFT_PX = 34;

/**
 * **L'affiche de la pièce survolée** (table d'état-major) : la souris seule l'ouvre — au toucher
 * le tap lit déjà, et ouvre ce que la pièce ouvre. Its own state, so a hover renders one card and
 * not a hundred labels; the label layer's loop moves its anchor (`posterPlace`).
 */
function PosterLayer({
  register,
  labels,
  poster,
  holding,
  roots,
  blocks,
  anchor,
  place,
  engine,
}: {
  register: RefObject<(id: string | null) => void>;
  labels: ReadonlyArray<MapLabel>;
  poster: (label: MapLabel) => ReactNode;
  /** Pièce en main, la fiche latérale parle : le survol se tait (ADR 0026 §6). */
  holding: boolean;
  roots: RefObject<Map<string, HTMLElement>>;
  blocks: RefObject<Map<string, HTMLElement>>;
  anchor: RefObject<HTMLDivElement | null>;
  place: RefObject<PosterPlace | null>;
  engine: MapEngine | null;
}) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    register.current = setId;
    return () => {
      register.current = () => {};
    };
  }, [register]);
  // A pile that leaves takes its label away without a pointerleave: forget it, or its return
  // would reopen the poster under no pointer.
  const label = holding || id === null ? undefined : labels.find((each) => each.id === id);
  useEffect(() => {
    if (id !== null && label === undefined && !holding) setId(null);
  }, [id, label, holding]);
  const card = label === undefined ? null : poster(label);
  const shown = card === null || label === undefined ? null : label.id;

  useLayoutEffect(() => {
    if (shown === null) return;
    const root = roots.current.get(shown);
    root?.classList.add('label--postered');
    // Au-dessus de la pièce elle-même — la planche, la silhouette — et non du cartouche effacé,
    // qui s'étend à droite du mât.
    const face = blocks.current
      .get(shown)
      ?.querySelector(':scope > .label-pictogram, :scope > .label-camp')
      ?.getBoundingClientRect();
    const origin = root?.getBoundingClientRect();
    const card = anchor.current?.firstElementChild?.getBoundingClientRect();
    const drawn = face !== undefined && origin !== undefined && face.height > 0;
    place.current = {
      id: shown,
      lift: drawn ? Math.max(POSTER_MIN_LIFT_PX, origin.top - face.top) : POSTER_MIN_LIFT_PX,
      shift: drawn ? face.left + face.width / 2 - origin.left : 0,
      width: card?.width ?? 0,
      height: card?.height ?? 0,
      insetBottom: Math.max(
        0,
        (Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--board-bottom'),
        ) || 0) -
          (window.innerHeight -
            (anchor.current?.parentElement?.getBoundingClientRect().bottom ?? window.innerHeight)),
      ),
      insetTop: Math.max(
        0,
        (Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--board-top'),
        ) || 0) - (anchor.current?.parentElement?.getBoundingClientRect().top ?? 0),
      ),
    };
    return () => {
      root?.classList.remove('label--postered');
      place.current = null;
    };
  });
  // Placé par la boucle des étiquettes : la carte ne rend que sur demande (`frame-demand.ts`).
  useEffect(() => {
    engine?.invalidate();
  });

  return (
    <div
      ref={anchor}
      className="map-poster-anchor"
      style={shown === null ? { display: 'none' } : { visibility: 'hidden' }}
    >
      {card}
    </div>
  );
}

/**
 * **La pile ouverte en liste** (refonte mobile, 1r) : des mâts d'une même région ne se
 * sépareront à aucune distance, alors ils s'écartent en lignes de 46 px — la planche, le nom, le
 * niveau — et chacune ouvre son bâtiment comme son mât l'aurait fait.
 */
function GroupList({
  caption,
  members,
  onOpen,
  onClose,
}: {
  caption: string;
  members: ReadonlyArray<MapLabel>;
  onOpen: (buildingId: string, clientX: number, clientY: number) => void;
  onClose: () => void;
}) {
  const region = members.find((member) => member.building !== null)?.building?.regionName;
  return (
    <div className="label-group-list paper-grain">
      <div className="label-group-list-head">
        <span>{region === undefined ? caption : fr.labels.groupHeader(caption, region)}</span>
        <button type="button" aria-label={fr.common.close} onClick={onClose}>
          ×
        </button>
      </div>
      {members.map(({ id, building, plate }) =>
        building === null ? null : (
          <button
            key={id}
            type="button"
            className="label-group-list-row"
            onClick={(event) => onOpen(building.id, event.clientX, event.clientY)}
          >
            {plate !== null && <img src={plate} alt="" />}
            <span className="label-group-list-name">{fr.buildings[building.key]}</span>
            <span className="label-group-list-level">{fr.common.levelShort(building.level)} ›</span>
          </button>
        ),
      )}
    </div>
  );
}

/** "stack" is the domain's word, "forces" the drawing's — the same thing from two sides. */
const PICTOGRAM_OF_LABEL: Readonly<Record<LabelPictogram, PictogramName>> = {
  outpost: 'outpost',
  stack: 'forces',
  construction: 'construction',
  /** Le tas de caisses : un objectif neutre *est* une réserve, et c'est ce que le mât dit tant
   *  que la planche de son archétype n'est pas dessinée. */
  objective: 'supply',
};

type RenderState = {
  visible: boolean;
  lod: DetailLevel;
  folded: boolean;
  /** Ses mots sont passés dans un cartouche réuni ; sa planche reste. */
  grouped: boolean;
  /** De combien son cartouche monte dans l'éventail d'un groupe au plancher du zoom, en pixels. */
  stagger: number;
  fade: number;
  dressed: number;
  plateScale: number;
  x: number;
  y: number;
};

const LOOT_CYCLE_RADIUS_PX = 30;

function nearbyLootSightings(
  clicked: MapLabel,
  labels: ReadonlyArray<MapLabel>,
  states: ReadonlyMap<string, RenderState>,
): ReadonlyArray<string> {
  const origin = states.get(clicked.id);
  if (origin === undefined || clicked.lootSightingId === null) return [];
  return labels
    .filter((candidate) => {
      if (candidate.lootSightingId === null) return false;
      const state = states.get(candidate.id);
      return (
        state?.visible === true &&
        Math.hypot(state.x - origin.x, state.y - origin.y) <= LOOT_CYCLE_RADIUS_PX
      );
    })
    .sort((first, second) => first.id.localeCompare(second.id))
    .flatMap((candidate) => (candidate.lootSightingId === null ? [] : [candidate.lootSightingId]));
}

function register(map: Map<string, HTMLElement>, id: string, node: HTMLElement | null): void {
  if (node) map.set(id, node);
  else map.delete(id);
}

function classesOf(label: MapLabel, selected: boolean, destination: boolean): string {
  return [
    'label',
    cartoucheShown(label, { pointed: false, selected }) ? '' : 'label--quiet',
    destination ? 'label--destination' : '',
    'label--glyph',
    `label--${label.type}`,
    label.identified ? 'label--identified' : '',
    label.type === 'loot' && !label.lootCurrent ? 'label--loot-stale' : '',
    label.washed ? 'label--washed' : '',
    selected ? 'label--selected' : '',
    label.hostCountry === null &&
    label.building === null &&
    label.station === null &&
    label.camp === null &&
    label.lootSightingId === null
      ? ''
      : 'label--clickable',
  ]
    .filter(Boolean)
    .join(' ');
}

/** The mockup's minimum gap: 28 px between two labels, 14 px of margin each — the grouping's own,
 *  so that what would fold a pile groups it instead. */
const OVERLAP_MARGIN = GROUP_MARGIN_PX;

/** Un peu plus qu'un cartouche d'écart : arrivée juste à la limite, la paire se regrouperait au
 *  premier degré d'orbite. */
const SEPARATION_SLACK = 1.15;

/** Camera rest replays the computation: an identical composition must not re-render. */
function sameGroups(first: ReadonlyArray<LabelGroup>, second: ReadonlyArray<LabelGroup>): boolean {
  return (
    first.length === second.length &&
    first.every((group, rank) => {
      const other = second[rank];
      return (
        other !== undefined &&
        group.id === other.id &&
        group.caption === other.caption &&
        group.members.join() === other.members.join()
      );
    })
  );
}
