// Le moteur de carte est une classe impérative à qui on assigne `.onLabels` —
// React Compiler lit ça comme une mutation interdite. Exclusion volontaire : le
// moteur n'importe pas React (CLAUDE.md).
'use no memo';

import { stationKeyOf } from '@/domain/troops';
import type { TourAct } from '@/domain/cargo-tag';
import { SupplyPictos } from '@/shell/SupplyPictos';
import { ChargeBar } from '@/shell/ChargeBar';
import { SUPPLY_KEYS, type SupplyLoad } from '@/domain/logistics';
import { ResourcePlate } from '@/emblems/Plate';
import { CargoTags, type CargoAim } from './CargoTags';
import { CueBubble } from '@/shell/CueBubble';
import {
  Fragment,
  memo,
  useCallback,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { isHqSite } from '@/domain/capture';
import { asDuration, reloadClock } from '@/domain/duration';
import { fr } from '@/i18n/fr';
import { useMapMotion } from '@/data/mapMotion';
import { shareUnchanged } from '@/data/shareUnchanged';
import { CaptureGauge, LoadingGauge, MarchGauge, ResearchLine } from './LoadingGauge';
import { useLayerSize } from './layer-size';
import {
  NEUTRAL_FLAG,
  URGENCY_MS,
  cartoucheShown,
  isAge,
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
import type { DetailLevel, LabelProjection } from './engine/labels';
import { posterPlacement, type PosterSpot } from '@/domain/poster-placement';
import type { MapEngine } from './engine';

/** Prendre des jetons au dépôt d'un avant-poste : la prise suit la main jusqu'à un transport. */
export type TakeDepot = (
  outpostId: string,
  resource: keyof SupplyLoad,
  event: ReactPointerEvent<HTMLElement>,
) => void;

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
 * - `label-block`, `label-bar`, `label-pictogram`, `label-lines`,
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
const NO_LABELS: ReadonlySet<string> = new Set();

export function MapLabels({
  labels: served,
  engine,
  selected,
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
  onOpenStrategic,
  onAct,
  onCancelHeld,
  mapping,
  holding,
  onHoldOver,
  muted,
  groupFar = false,
  nation = null,
  onDisembark,
  cargoAim = null,
  availableLabels = NO_LABELS,
  carriersShown = false,
  onTakeDepot,
  onTour,
  cue = null,
  selectionBar = null,
  openStation = null,
}: {
  /** **The bar over a selection** (#130): it stands above the labels of the piles taken. */
  selectionBar?: { readonly labelIds: ReadonlyArray<string>; readonly node: ReactNode } | null;
  /** **La bulle des premiers pas** sur la pièce à lever (ADR 0027 §2), sous son point : le
   *  cartouche tient le dessus. */
  cue?: { readonly labelId: string; readonly text: string } | null;
  /** La tournée depuis l'étiquette d'un transport : lancer, effacer, rappeler. */
  onTour?: ((carrierId: string, act: TourAct) => void) | undefined;
  /** **Des jetons en main** (ADR 0028 §4) : toutes les étiquettes de transport se montrent. */
  carriersShown?: boolean;
  /** Prendre des jetons au dépôt d'un avant-poste, depuis son étiquette. */
  onTakeDepot?: TakeDepot | undefined;
  labels: ReadonlyArray<MapLabel>;
  /** **The transport under the hand**: its tag opens on the seats the drop would take. */
  cargoAim?: CargoAim | null;
  /** The labels whose transport could take the hand: their tags hang while it is held. */
  availableLabels?: ReadonlySet<string>;
  /** **The address whose garrison window is open** (`stationKeyOf`): the sheet of a transport
   *  stored there opens, though its label — a mast — is not the one selected. */
  openStation?: string | null;
  /** The player's nation: the passengers on a transport's tag wear its plates. */
  nation?: string | null;
  /** **Débarquer depuis l'étiquette d'un transport** (POC du 16/10) ; absent, pas d'étiquette. */
  onDisembark?: ((troopIds: ReadonlyArray<string>) => void) | undefined;
  engine: MapEngine | null;
  /** L'étiquette désignée — une troupe posée, cliquée seule : sa planche prend l'encre du joueur
   *  et rien d'autre ne bouge (décision du 29/08). */
  selected: string | null;
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
  onOpenStrategic: (pointId: string, clientX: number, clientY: number) => void;
  /** **Le geste qui agit, quel que soit le bouton qui le porte** (`mouseMapping`) : la rose
   *  s'ouvre sur l'étiquette comme elle s'ouvre sur le sol. */
  onAct: (label: MapLabel, clientX: number, clientY: number) => void;
  /** **Pièce en main, le bouton qui agit la repose** au lieu d'ouvrir la rose (`CleanPress.cancels`). */
  onCancelHeld: () => void;
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
  /** **Au loin aussi, des planches de sites qui se chevauchent n'en font qu'un cartouche**
   *  (Blitz, retours du 15/10) : les neutres d'une Blitz couvraient l'Espagne. */
  groupFar?: boolean;
}) {
  const labels = useSameLabels(served);
  const anchors = useRef(new Map<string, HTMLElement>());
  const roots = useRef(new Map<string, HTMLElement>());
  const blocks = useRef(new Map<string, HTMLElement>());
  const countdowns = useRef(new Map<string, HTMLElement>());
  const ages = useRef(new Map<string, HTMLElement>());
  const tethers = useRef(new Map<string, HTMLElement>());
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
  /** How far a ring's cartouche rises to clear the cartouche of the stack standing in it. */
  const groupLifts = useRef<ReadonlyMap<string, number>>(new Map());
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
  const barAnchor = useRef<HTMLDivElement | null>(null);
  const barLabels = useRef<ReadonlyArray<string>>([]);
  barLabels.current = selectionBar?.labelIds ?? [];
  const layer = useRef<HTMLDivElement>(null);
  const layerSize = useLayerSize(layer);
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
  const folding = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = folding.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);
  /** The labels that carry a transport's tag: only they look for their figurines each frame. */
  const cargoed = useRef<ReadonlySet<string>>(new Set());
  cargoed.current = new Set(
    labels.flatMap((label) => ((label.cargo?.length ?? 0) > 0 ? [label.id] : [])),
  );
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
      // A transport's tag hangs while its piece is under the pointer (POC, `t.hover`).
      // A transport's sheet folds a moment late: between the figurines and it there is only air.
      if (previous !== null) {
        const fold = () => anchors.current.get(previous)?.classList.remove('label-anchor--hovered');
        if (cargoed.current.has(previous)) {
          clearTimeout(folding.current.get(previous));
          folding.current.set(previous, setTimeout(fold, SHEET_FOLD_MS));
        } else fold();
      }
      if (id !== null) {
        clearTimeout(folding.current.get(id));
        anchors.current.get(id)?.classList.add('label-anchor--hovered');
      }
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
    root.classList.toggle('label--grouped', state.grouped);
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
    // Une installation relevée n'entre dans « N sites » qu'en Blitz : en Mondiale elle garde sa
    // planche et sa rose, que le cartouche réuni ne sait pas ouvrir.
    const site = (label: MapLabel) =>
      label.type === 'building' || (groupFar && label.type === 'installation');
    const candidates = labels
      .filter((label) => {
        const state = states.current.get(label.id);
        // Un drapeau n'a pas de mots à replier, et il ne cède sa place à personne.
        return (
          state?.visible === true &&
          (state.lod === 'expanded' || (groupFar && site(label))) &&
          label.type !== 'arrival'
        );
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

    const installations = new Set(
      labels.flatMap((label) => (label.type === 'installation' ? [label.id] : [])),
    );
    const formed = groupOverlapping(
      measured.flatMap<GroupCandidate>(({ label, state, rect }) =>
        // En Blitz, des piles en figurines se lisent pièce par pièce : un cartouche « 2 piles »
        // posé dessus couvrait les pièces qu'il résumait. Au loin, leurs planches, si.
        (label.type === 'stack' && !(groupFar && state.dressed >= 0.5)) || site(label)
          ? [
              {
                id: label.id,
                kind: label.type === 'stack' ? 'stack' : 'building',
                box: rect,
                x: state.x,
                y: state.y,
                count: label.force?.headcount ?? 1,
              },
            ]
          : [],
      ),
    ).map((group) =>
      // La liste d'une pile de mâts n'ouvre qu'un bâtiment à moi : une installation y serait
      // comptée sans être joignable. Un tel groupe rapproche la caméra.
      group.coincident && group.members.some((member) => installations.has(member))
        ? { ...group, coincident: false }
        : group,
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
    /** Les cartouches de piles posés : un anneau de sites ne leur cède pas, il se hisse au-dessus. */
    const stacks: ScreenBox[] = [];
    const lifted = new Map<string, number>();
    const placedGroups = new Map<string, boolean>();
    for (const { label, state, rect } of measured) {
      const group = groupOf.get(label.id);
      if (group !== undefined) {
        let standing = placedGroups.get(group.id);
        if (standing === undefined) {
          // Des planches de sites réunies ne se replient pas devant une pile : repliées, elles
          // restaient l'amas qu'elles devaient résumer. Depuis la figurine plancher (ADR 0035
          // §10) la pile garde son étiquette jusqu'à d ≈ 30, et l'anneau son « N sites » avec
          // elle (#285) : la pile n'est pas ce qui le replie.
          standing =
            (groupFar && group.kind === 'building') ||
            !kept.some(
              (other) =>
                !(group.kind === 'building' && stacks.includes(other)) &&
                boxesOverlap(other, group.box, OVERLAP_MARGIN),
            );
          placedGroups.set(group.id, standing);
          if (standing) {
            kept.push(group.box);
            if (group.kind === 'stack') stacks.push(group.box);
            else {
              // Une pile qui se lit (son cartouche a une hauteur) est dégagée par un mât plus
              // long ; une pile muette n'a rien à dégager.
              const reading = stacks.filter((other) => other.bottom > other.top);
              const lift = Math.max(
                0,
                ...reading.map((other) => fanOffsets([other, group.box])[1] ?? 0),
              );
              if (lift > 0) lifted.set(group.id, lift);
            }
          }
        }
        state.grouped = standing && !fans(group);
        state.folded = !standing;
        if (standing && fans(group)) state.stagger = lifts.get(label.id) ?? 0;
      } else if (state.lod === 'expanded') {
        state.folded = kept.some((other) => boxesOverlap(other, rect, OVERLAP_MARGIN));
        if (!state.folded) {
          kept.push(rect);
          if (label.type === 'stack') stacks.push(rect);
        }
      }
      apply(label.id, state);
    }
    groupLifts.current = lifted;

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
  }, [labels, apply, engine, point, groupFar]);

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
      node.textContent =
        countdown.clock === true
          ? left > 0
            ? `${countdown.prefix}${reloadClock(left)}`
            : ''
          : `${countdown.prefix}${asDuration(left / 60_000)}`;
      roots.current.get(label.id)?.classList.toggle('label--urgent', left < URGENCY_MS);
    }
    for (const label of labels) {
      const age = label.lines.find(isAge);
      const node = ages.current.get(label.id);
      if (age === undefined || node === undefined) continue;
      node.textContent = fr.camps.lastKnown(asDuration(Math.max(0, now - age.since) / 60_000));
    }
  }, [labels]);

  /**
   * **Une étiquette qui reste garde son état** (#148) : son nœud est le même (clé `label.id`), ce
   * que la boucle y a écrit aussi. Seules les nouvelles partent cachées ; une classe qu'un
   * nouveau `className` a effacée est rendue par `apply`.
   */
  useLayoutEffect(() => {
    const was = states.current;
    states.current = new Map(
      labels.map((label) => {
        const kept = was.get(label.id);
        if (kept !== undefined) apply(label.id, kept);
        return [
          label.id,
          kept ?? {
            visible: false,
            lod: 'glyph',
            folded: false,
            grouped: false,
            stagger: 0,
            fade: 1,
            dressed: 0,
            far: false,
            drawn: '',
            hang: '',
            x: 0,
            y: 0,
          },
        ];
      }),
    );
    refreshCountdowns();
    // Une étiquette gardée garde son `lod` : le changement qui relançait le repli n'arrive plus,
    // or son cartouche a pu s'élargir (une troupe arrive) et chevaucher sa voisine.
    scheduleDegrade();
  }, [labels, refreshCountdowns, apply, scheduleDegrade]);

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
        pinned: PINNED.has(type),
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
        // Far away a sign weighs what a pin does (#234): the objective's, the point's, the flag's.
        if (projection.far !== state.far) {
          state.far = projection.far;
          anchor.classList.toggle('label-anchor--far', projection.far);
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

        // **Le trait d'encre du fanion à la pièce** qu'un anneau a écartée de son point.
        const length = Math.round(Math.hypot(projection.drawnX, projection.drawnY));
        const drawn =
          length < TETHER_MIN_PX
            ? ''
            : `${length}px/${Math.atan2(projection.drawnY, projection.drawnX).toFixed(3)}rad`;
        const tether = tethers.current.get(projection.id);
        if (drawn !== state.drawn && tether !== undefined) {
          state.drawn = drawn;
          const [span = '0px', turn = '0rad'] = drawn.split('/');
          tether.style.display = drawn === '' ? 'none' : '';
          tether.style.width = span;
          tether.style.transform = `rotate(${turn})`;
        }

        anchor.style.transform = `translate3d(${projection.x}px, ${projection.y}px, 0)`;
        state.x = projection.x;
        state.y = projection.y;
        // A transport's tag hangs over its figurines, not its point: on a shore they stand inland.
        if (cargoed.current.has(projection.id)) {
          const rect = state.dressed >= 0.5 ? engine.pieceRect(projection.id) : null;
          const hang =
            rect === null
              ? ''
              : `${Math.round((rect.left + rect.right) / 2 - projection.x)}/${Math.round(rect.top - projection.y)}`;
          if (hang !== state.hang) {
            state.hang = hang;
            const [x, y] = hang.split('/');
            anchor.style.setProperty('--cargo-x', hang === '' ? '0px' : `${x}px`);
            anchor.style.setProperty('--cargo-y', hang === '' ? '-46px' : `${y}px`);
          }
        }
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
        // A drawn piece (maquette, figurines, block, pawn, pin) is cleared whole, from its
        // projected box; far away a pin's label is hidden, and the poster hangs from the pin.
        const drawn = engine.pieceRect(place.id);
        poster.style.visibility = under.visible || drawn !== null ? '' : 'hidden';
        // A transport's tag hangs over its piece: the card clears the tag too (POC, `#card`).
        const tag = cargoed.current.has(place.id)
          ? anchors.current.get(place.id)?.querySelector('.cargo-tags')?.getBoundingClientRect()
          : undefined;
        const rect =
          drawn === null || tag === undefined || tag.height === 0
            ? drawn
            : { ...drawn, top: drawn.top - tag.height };
        let side: PosterSpot['side'];
        let x: number;
        let y: number;
        let stem = 0;
        if (rect !== null) {
          const spot = posterPlacement(
            rect,
            { width: place.width, height: place.height },
            layerSize.current,
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
          x = Math.min(Math.max(under.x + place.shift, half), layerSize.current.width - half);
          // Held on screen even if it then covers its label: a pile of three roles, with all its
          // statistics, is taller than what remains under it.
          const lowest =
            layerSize.current.height -
            place.insetBottom -
            POSTER_MARGIN_PX -
            place.height -
            POSTER_STEM_PX;
          // …but never above the top of the board either, whatever its height.
          const highest = place.insetTop + POSTER_MARGIN_PX - POSTER_STEM_PX;
          y = side === 'below' ? Math.max(highest, Math.min(under.y, lowest)) : top;
        }
        for (const each of POSTER_SIDES)
          poster.classList.toggle(`map-poster-anchor--${each}`, each === side);
        poster.style.setProperty('--stem', `${stem}px`);
        poster.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }

      // La barre d'une sélection se tient au-dessus de ses piles, au milieu (POC, `#actions`).
      const bar = barAnchor.current;
      if (bar !== null) {
        const seen = barLabels.current
          .map((id) => states.current.get(id))
          .filter((state) => state?.visible === true);
        // Nothing chosen yet (a finger that has just started): the bar waits at the top.
        const waiting = barLabels.current.length === 0;
        bar.style.display = seen.length === 0 && !waiting ? 'none' : '';
        if (seen.length > 0 || waiting) {
          const x = waiting
            ? layerSize.current.width / 2
            : seen.reduce((sum, state) => sum + state!.x, 0) / seen.length;
          const y = waiting ? 0 : Math.min(...seen.map((state) => state!.y));
          const half = bar.offsetWidth / 2 + 8;
          const left = Math.min(Math.max(x, half), layerSize.current.width - half);
          bar.style.transform = `translate3d(${left}px, ${Math.max(bar.offsetHeight + 8, y - 64)}px, 0)`;
        }
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
        const label = anchor.querySelector<HTMLElement>('.label');
        // Mesuré en pixels d'écran, posé sous le `zoom` de l'interface : on le défait (`apply`).
        const zoom = label === null ? 1 : Number(getComputedStyle(label).zoom) || 1;
        const lift = `${Math.round((groupLifts.current.get(group.id) ?? 0) / zoom)}px`;
        if (label !== null && label.style.getPropertyValue('--label-stagger') !== lift)
          label.style.setProperty('--label-stagger', lift);
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
  }, [engine, apply, degrade, scheduleDegrade, layerSize]);

  // Les nœuds posés ici naissent cachés et c'est la prochaine image qui les place. La carte ne
  // rend plus sans raison (`engine/frame-demand.ts`) : ce qui fait naître ou change un nœud en
  // demande une — la liste, les cartouches réunis, la barre de sélection, la main. Un rendu qui ne
  // touche aucun nœud n'en demande pas (#189) : refermer une feuille réveillait la carte une
  // seconde et demie à soixante images.
  const barKey = selectionBar?.labelIds.join(' ') ?? null;
  useEffect(() => {
    engine?.invalidate();
  }, [
    engine,
    labels,
    groups,
    opened,
    barKey,
    availableLabels,
    carriersShown,
    cargoAim,
    holding,
    selected,
    secondarySelected,
    groupFar,
    muted,
    nation,
  ]);

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
      } else if (label.strategic !== null) {
        onOpenStrategic(label.strategic.id, clientX, clientY);
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

  /**
   * **Ce qu'un geste sur une étiquette déclenche, lu au moment du geste** (#183) : chaque
   * `LabelNode` est mémoïsé et ne se rend qu'avec ce qu'il montre ; ce qu'il appelle se relit
   * ici, à jour de ce rendu.
   */
  const gestures = useRef({} as LabelGestures);
  gestures.current = {
    enter: (label, event) => {
      // A finger has no hover to take back: what it lit would stay lit (C4).
      if (event.pointerType === 'touch') return;
      over.current.label = label.id;
      hover(event.buttons === 0);
    },
    move: (label, event) => {
      if (holding && event.pointerType !== 'touch')
        onHoldOver(label.id, event.clientX, event.clientY);
    },
    leave: (label, event) => {
      if (event.pointerType === 'touch') return;
      if (over.current.label === label.id) over.current.label = null;
      hover(true);
    },
    click: (label, event) => {
      // A drag that carried a pile ends here too: it was not a click.
      if (engine?.consumeCarry() === true) return;
      pressLabel(
        label,
        cleanPressAt(mapping, pressedWith.current, event.button, holding),
        pressedWith.current,
        event.clientX,
        event.clientY,
      );
    },
    keyDown: (label, event) => {
      if (label.lootSightingId !== null && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        const rect = roots.current.get(label.id)?.getBoundingClientRect();
        onOpenLoot(
          nearbyLootSightings(label, labels, states.current),
          rect === undefined ? 0 : rect.left + rect.width / 2,
          rect === undefined ? 0 : rect.top + rect.height / 2,
        );
      }
    },
    pointerDown: (label, event) => {
      pressedWith.current = event.pointerType;
      // Une de mes piles se porte aussi depuis son étiquette (glisser-déposer, 15/10).
      if (label.type === 'stack' && label.station !== null && !muted)
        engine?.pressOnLabel(label.id, event.nativeEvent);
      // Un clic ouvre ce que la pièce ouvre — garnison, site, cartouche : l'affiche le
      // doublerait. Elle revient au survol suivant.
      showPoster.current(null);
      // L'autoscroll du navigateur s'arme au bouton du milieu et se plante sur la carte.
      if (buttonAt(event.button) === 'middle') event.preventDefault();
    },
    auxClick: (label, event) => {
      if (cleanPressAt(mapping, 'mouse', event.button, holding).cancels) return onCancelHeld();
      if (buttonAt(event.button) !== 'middle' || mapping.middle !== 'act') return;
      onAct(label, event.clientX, event.clientY);
    },
    contextMenu: (label, event) => {
      // Le menu du navigateur est coupé quel que soit le rôle du bouton droit.
      event.preventDefault();
      if (cleanPressAt(mapping, 'mouse', event.button, holding).cancels) return onCancelHeld();
      if (mapping.right !== 'act') return;
      onAct(label, event.clientX, event.clientY);
    },
    takeDepot: (outpostId, key, event) => onTakeDepot?.(outpostId, key, event),
    disembark: (troopIds) => onDisembark?.(troopIds),
    tour: (carrierId, act) => onTour?.(carrierId, act),
  };
  const disembark = useCallback(
    (troopIds: ReadonlyArray<string>) => gestures.current.disembark(troopIds),
    [],
  );
  const tour = useCallback(
    (carrierId: string, act: TourAct) => gestures.current.tour(carrierId, act),
    [],
  );
  const nodes = useMemo(() => ({ anchors, tethers, roots, blocks, countdowns, ages }), []);

  const inkOf = (id: string): string | null => labels.find((label) => label.id === id)?.ink ?? null;

  return (
    <div
      ref={layer}
      className={`map-labels${muted ? ' pointer-events-none' : ''}${carriersShown ? ' map-labels--loading' : ''}`}
    >
      {labels.map((label) => (
        <LabelNode
          key={label.id}
          label={label}
          selected={label.id === selected || label.id === secondarySelected}
          siteOpen={
            openStation !== null &&
            label.station !== null &&
            stationKeyOf(label.station) === openStation
          }
          cue={cue?.labelId === label.id ? cue.text : null}
          crawl={motion === 'full'}
          muted={muted}
          nation={nation}
          onDisembark={onDisembark === undefined ? undefined : disembark}
          onTour={onTour === undefined ? undefined : tour}
          takesDepot={onTakeDepot !== undefined}
          cargoAim={cargoAim?.labelId === label.id ? cargoAim : null}
          available={carriersShown || availableLabels.has(label.id)}
          gestures={gestures}
          nodes={nodes}
        />
      ))}
      {groups.map((group) => {
        const ink = inkOf(group.members[0] ?? '');
        const members = group.members.flatMap((member) => {
          const label = labels.find((candidate) => candidate.id === member);
          return label === undefined ? [] : [label];
        });
        return (
          <div
            key={group.id}
            className="label-anchor"
            style={{ display: 'none' }}
            ref={(node) => {
              register(groupAnchors.current, group.id, node);
            }}
          >
            {/* Les mâts d'un groupe, pour ce qu'une main y lâche (plateau personnel). */}
            <div
              className={`label label--expanded label--group label--${group.kind}-group label--clickable`}
              style={ink === null ? undefined : ({ '--label-ink': ink } as CSSProperties)}
              data-building-id={
                members
                  .flatMap((member) => (member.building === null ? [] : [member.building.id]))
                  .join(',') || undefined
              }
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
      {selectionBar !== null && (
        <div ref={barAnchor} className="selection-bar-anchor" style={{ display: 'none' }}>
          {selectionBar.node}
        </div>
      )}
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

/**
 * **Une liste rebâtie mais égale reste la même liste** (#183) : le plateau rebâtit ses étiquettes
 * à chaque réponse, et chaque effet de la couche — repli des chevauchements, ancres, comptes à
 * rebours — se relancerait pour une carte qui n'a pas changé. Le repli mesure six cents cartouches.
 */
function useSameLabels(labels: ReadonlyArray<MapLabel>): ReadonlyArray<MapLabel> {
  const last = useRef(labels);
  const kept = last.current;
  const same =
    kept === labels ||
    (kept.length === labels.length &&
      labels.every((label, rank) => shareUnchanged(kept[rank], label) === kept[rank]));
  useLayoutEffect(() => {
    if (!same) last.current = labels;
  });
  return same ? kept : labels;
}

type LabelNodes = Readonly<
  Record<
    'anchors' | 'tethers' | 'roots' | 'blocks' | 'countdowns' | 'ages',
    RefObject<Map<string, HTMLElement>>
  >
>;

/** What a gesture on a label does, read at the gesture from `MapLabels`' latest render. */
type LabelGestures = {
  readonly enter: (label: MapLabel, event: ReactPointerEvent<HTMLElement>) => void;
  readonly move: (label: MapLabel, event: ReactPointerEvent<HTMLElement>) => void;
  readonly leave: (label: MapLabel, event: ReactPointerEvent<HTMLElement>) => void;
  readonly click: (label: MapLabel, event: ReactMouseEvent<HTMLElement>) => void;
  readonly keyDown: (label: MapLabel, event: ReactKeyboardEvent<HTMLElement>) => void;
  readonly pointerDown: (label: MapLabel, event: ReactPointerEvent<HTMLElement>) => void;
  readonly auxClick: (label: MapLabel, event: ReactMouseEvent<HTMLElement>) => void;
  readonly contextMenu: (label: MapLabel, event: ReactMouseEvent<HTMLElement>) => void;
  readonly takeDepot: TakeDepot;
  readonly disembark: (troopIds: ReadonlyArray<string>) => void;
  readonly tour: (carrierId: string, act: TourAct) => void;
};

type LabelNodeProps = {
  readonly label: MapLabel;
  readonly selected: boolean;
  readonly siteOpen: boolean;
  readonly cue: string | null;
  readonly crawl: boolean;
  readonly muted: boolean;
  readonly nation: string | null;
  readonly onDisembark: ((troopIds: ReadonlyArray<string>) => void) | undefined;
  readonly onTour: ((carrierId: string, act: TourAct) => void) | undefined;
  readonly takesDepot: boolean;
  readonly cargoAim: CargoAim | null;
  readonly available: boolean;
  readonly gestures: RefObject<LabelGestures>;
  readonly nodes: LabelNodes;
};

/**
 * **Une étiquette ne se rend qu'avec ce qu'elle montre** (#183) : une réponse du serveur rebâtit
 * la liste, et une étiquette restée égale — même texte, même classe, même ancre — garde son rendu.
 * Le reste de ses props est stable : les gestes se relisent par `gestures`, les nœuds par `nodes`.
 */
const LabelNode = memo(function LabelNode({
  label,
  selected,
  siteOpen,
  cue,
  crawl,
  muted,
  nation,
  onDisembark,
  onTour,
  takesDepot,
  cargoAim,
  available,
  gestures,
  nodes,
}: LabelNodeProps) {
  return (
    <div
      className="label-anchor"
      ref={(node) => {
        register(nodes.anchors.current, label.id, node);
      }}
      style={{ display: 'none' }}
    >
      {cue !== null && (
        <CueBubble
          text={cue}
          place="first-step-cue--up absolute top-[18px] left-0 -translate-x-1/2"
        />
      )}
      <span
        aria-hidden
        className="label-tether"
        style={{ display: 'none' }}
        ref={(node) => {
          register(nodes.tethers.current, label.id, node);
        }}
      />
      <div
        ref={(node) => {
          register(nodes.roots.current, label.id, node);
        }}
        className={classesOf(label, selected)}
        role={label.lootSightingId === null ? undefined : 'button'}
        tabIndex={label.lootSightingId === null ? undefined : 0}
        aria-label={label.lootSightingId === null ? undefined : fr.loot.openMarker}
        style={label.ink === null ? undefined : ({ '--label-ink': label.ink } as CSSProperties)}
        onPointerEnter={(event) => gestures.current.enter(label, event)}
        onPointerMove={(event) => gestures.current.move(label, event)}
        onPointerLeave={(event) => gestures.current.leave(label, event)}
        data-label-id={label.id}
        data-building-id={label.building?.id}
        onClick={(event) => gestures.current.click(label, event)}
        onKeyDown={(event) => gestures.current.keyDown(label, event)}
        onPointerDown={(event) => gestures.current.pointerDown(label, event)}
        onAuxClick={(event) => gestures.current.auxClick(label, event)}
        onContextMenu={(event) => gestures.current.contextMenu(label, event)}
      >
        {label.flag !== undefined && (
          <span
            className={
              label.flag === NEUTRAL_FLAG ? 'label-owner label-owner--neutral' : 'label-owner'
            }
            style={
              label.flag === NEUTRAL_FLAG
                ? undefined
                : ({ '--owner-ink': label.flag } as CSSProperties)
            }
          >
            <svg viewBox="0 0 16 22" width="16" height="22" aria-hidden>
              <path className="label-flag-pole" d="M2 1v21" />
              <path className="label-owner-cloth" d="M2.6 1.5h11.5l-2.6 3.6 2.6 3.6H2.6z" />
            </svg>
          </span>
        )}
        <div
          className="label-block"
          ref={(node) => {
            register(nodes.blocks.current, label.id, node);
          }}
        >
          {label.type === 'arrival' && (
            <span className="label-flag" aria-hidden>
              <svg viewBox="0 0 16 22" width="16" height="22">
                <path className="label-flag-pole" d="M2 1v21" />
                <path className="label-flag-cloth" d="M2.6 1.5h11.5l-2.6 3.6 2.6 3.6H2.6z" />
              </svg>
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
              <Pictogram pictogram={PICTOGRAM_OF_LABEL[label.pictogram]} weight={40} size={36} />
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
                      register(nodes.countdowns.current, label.id, node);
                    }}
                  />
                  {line.since !== undefined && <MarchGauge since={line.since} dueAt={line.dueAt} />}
                </Fragment>
              ) : line.role === 'age' ? (
                <div
                  key={rank}
                  className="label-line label-line--mention"
                  ref={(node) => {
                    register(nodes.ages.current, label.id, node);
                  }}
                />
              ) : line.role === 'research' ? (
                <ResearchLine
                  key={rank}
                  text={line.text}
                  since={line.since}
                  dueAt={line.dueAt}
                  share={line.share}
                />
              ) : line.role === 'loading' ? (
                <LoadingGauge key={rank} until={line.until} crawl={crawl} />
              ) : line.role === 'supplies' ? (
                <div key={rank} className="label-line label-line--figures">
                  <SupplyPictos supplies={line.supplies} />
                </div>
              ) : line.role === 'charge' ? (
                <div key={rank} className="label-line label-line--figures label-line--depot">
                  <ChargeBar load={line.load} capacity={line.capacity} />
                  {takesDepot &&
                    label.station?.kind === 'outpost' &&
                    SUPPLY_KEYS.filter((key) => line.load[key] > 0).map((key) => (
                      <button
                        key={key}
                        type="button"
                        title={fr.logistics.grab}
                        className="depot-token"
                        onPointerDown={(event) => {
                          if (label.station?.kind === 'outpost')
                            gestures.current.takeDepot(label.station.outpostId, key, event);
                        }}
                      >
                        <ResourcePlate resource={key} height={14} />
                        {line.load[key]}
                      </button>
                    ))}
                </div>
              ) : line.role === 'capture' ? (
                <CaptureGauge
                  key={rank}
                  side={line.side}
                  hq={isHqSite(line.site)}
                  clock={line.clock}
                  completesAt={line.completesAt}
                />
              ) : (
                <div key={rank} className={`label-line label-line--${line.role}`}>
                  {line.text}
                </div>
              ),
            )}
          </div>
        </div>
        {label.cargo !== undefined &&
          label.cargo.length > 0 &&
          onDisembark !== undefined &&
          !muted && (
            <CargoTags
              tags={label.cargo}
              nation={nation}
              onDisembark={onDisembark}
              aim={cargoAim}
              available={available}
              selected={selected || siteOpen}
              onTour={onTour}
            />
          )}
      </div>
    </div>
  );
}, sameLabelProps);

function sameLabelProps(before: LabelNodeProps, after: LabelNodeProps): boolean {
  for (const key of Object.keys(after) as Array<keyof LabelNodeProps>) {
    if (key === 'label') continue;
    if (!Object.is(before[key], after[key])) return false;
  }
  return shareUnchanged(before.label, after.label) === before.label;
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
      // The personal board's band covers the map: a tall poster stands above it, not under it.
      // Both bottom edges are in window pixels: brought back to the layer like the other one.
      insetBottom: Math.max(
        0,
        Math.max(
          Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--mat-rise'),
          ) || 0,
          Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--board-bottom'),
          ) || 0,
        ) -
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
  // Placé par la boucle des étiquettes : la carte ne rend que sur demande (`frame-demand.ts`),
  // une image quand la fiche paraît ou change de pièce.
  useEffect(() => {
    engine?.invalidate();
  }, [engine, shown, label]);

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

/** What each sign a mast still carries draws. */
const PICTOGRAM_OF_LABEL: Readonly<Record<LabelPictogram, PictogramName>> = {
  outpost: 'outpost',
  construction: 'construction',
  /** Le tas de caisses : un objectif neutre *est* une réserve, et c'est ce que le mât dit tant
   *  que la planche de son archétype n'est pas dessinée. */
  objective: 'supply',
  /** Le drapeau : un point stratégique *est* une possession disputée. */
  strategic: 'nation',
};

type RenderState = {
  visible: boolean;
  lod: DetailLevel;
  folded: boolean;
  /** Ses mots sont passés dans un cartouche réuni. */
  grouped: boolean;
  /** De combien son cartouche monte dans l'éventail d'un groupe au plancher du zoom, en pixels. */
  stagger: number;
  fade: number;
  dressed: number;
  far: boolean;
  /** Where its piece is drawn off its point, as last written: `''` on it. */
  drawn: string;
  /** Where a transport's tag hangs from, over its figurines, as last written. */
  hang: string;
  x: number;
  y: number;
};

const LOOT_CYCLE_RADIUS_PX = 30;

/** Under this, a piece drawn off its point still reads as standing on it: no thread. */
const TETHER_MIN_PX = 6;

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

/**
 * **Ce que la carte pose en pièce** (#234) : au loin une épingle, de près une figurine ou une
 * maquette. Leur étiquette ne dessine plus rien à leur pied et laisse le pointeur à la toile ;
 * seuls ses mots restent à elle.
 */
const PINNED: ReadonlySet<MapLabel['type']> = new Set([
  'stack',
  'building',
  'construction',
  'outpost',
  'camp',
  'installation',
  'my-movement',
  'inbound-movement',
  'intel',
]);

/** How long a transport's sheet waits before folding once the pointer has left. @a-mesurer */
const SHEET_FOLD_MS = 300;

function classesOf(label: MapLabel, selected: boolean): string {
  return [
    'label',
    cartoucheShown(label, { pointed: false, selected }) ? '' : 'label--quiet',
    label.lines.some((line) => line.role === 'capture') ? 'label--capturing' : '',
    'label--glyph',
    `label--${label.type}`,
    PINNED.has(label.type) ? 'label--pinned' : '',
    label.identified ? 'label--identified' : '',
    label.type === 'loot' && !label.lootCurrent ? 'label--loot-stale' : '',
    label.washed ? 'label--washed' : '',
    label.wake === undefined
      ? ''
      : `label--wake label--wake-${label.wake.open ? label.wake.deposit : 'refused'}`,
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
