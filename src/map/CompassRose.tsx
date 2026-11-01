import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { BillLine, CompassAction, CompassPictogram, Compass } from '@/domain/compass-rose';
import { Price } from '@/shell/Price';
import { ResourcePlate } from '@/emblems/Plate';
import { fr } from '@/i18n/fr';

/**
 * The board's radial menu, opened by right click on the aimed point. It lives in the HTML
 * layer above the canvas, like the labels, and is only pointer-opaque on its medallions —
 * the map stays alive around it.
 *
 * The pictograms stay **mute**: label, cost and consequence only appear on hover, in the
 * tooltip. That is what lets the fan stay dense without becoming chatty.
 *
 * **A fan with no branch is not a fan that stays shut.** Aiming at a target where nothing is
 * legal, the plate opens on its crosshair alone and the tooltip states the motive without
 * waiting for a hover there is nothing to hover. Explaining an absence is not offering a dead
 * choice (ADR 0015) — there is no medallion to click.
 *
 * **A finger reads before it acts** (mobile-1c). It has no hover, so the tooltip that names a
 * mute pictogram would never show: the first clean touch on a medallion opens its tooltip, the
 * second on the same one acts. The mouse keeps its single click.
 *
 * **Sous le seuil, la rose se lit sans toucher** (lot mobile-3, A6) : médaillons de 48 px, le
 * libellé en cartouche à côté de chacun, et « marcher » en encre pleine parce que c'est la branche
 * qu'on prend le plus. Le pictogramme n'est plus muet, donc le premier toucher agit — sauf là où
 * il ne faut pas (`readsFirst`). Et elle tient entière dans l'écran : mesurée à
 * l'ouverture, elle demande à la carte de se recaler sous elle (`onFit`) plutôt que de quitter le
 * point qu'elle désigne.
 *
 * Classes are set here and styled in `src/styles/compass-rose.css`.
 */
export function CompassRose({
  compass,
  x,
  y,
  width,
  height,
  onClose,
  onAction,
  finger = null,
  shown = -1,
}: {
  compass: Compass;
  x: number;
  y: number;
  width: number;
  height: number;
  onClose: () => void;
  onAction: (action: CompassAction) => void;
  /** Sous le seuil : la place que la feuille basse réserve au pied du plateau, et ce qui recale
   *  la carte. `null` au bureau, où rien ne change. */
  finger?: {
    readonly floor: number;
    readonly onFit: (dx: number, dy: number) => void;
  } | null;
  /** La branche dont la bulle est ouverte à l'ouverture — la page publique joue la rose seule. */
  shown?: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const radius = finger === null ? MEDALLION_RADIUS : FINGER_RADIUS;
  const bubble = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(shown);
  /** The medallion a finger has read, waiting for the touch that acts. */
  const [read, setRead] = useState(-1);
  const pressedWith = useRef('mouse');
  const [bubbleHeight, setBubbleHeight] = useState(BUBBLE_HEIGHT);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node)) return;
      onClose();
    };
    // In capture, and the event stops there: Escape closes the menu, never the window
    // behind it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  /** Une fois, à l'ouverture : la rose ne se recale pas sous un doigt qui la lit. */
  const fitted = useRef(false);
  /** Le zoom de l'interface, lu sur la plate elle-même : la bulle du doigt se borne à l'écran en
   *  pixels du plateau, et la plate est mesurée dans les siens. */
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const menu = root.current?.querySelector('.rose-menu');
    if (!(menu instanceof HTMLElement) || menu.offsetWidth === 0) return;
    const measured = menu.getBoundingClientRect().width / menu.offsetWidth;
    if (Math.abs(measured - scale) > 0.01) setScale(measured);
  }, [scale]);
  useLayoutEffect(() => {
    if (finger === null || fitted.current || root.current === null) return;
    fitted.current = true;
    const frame = root.current.closest('.compass-rose')?.getBoundingClientRect();
    /** Le réticule compte : c'est la chose désignée, et une rose posée au-dessus de la feuille
     *  sur une troupe restée dessous montrait l'ordre sans ce qu'il commande. */
    const box = boxOf(
      root.current.querySelectorAll(
        '.rose-medallion, .rose-caption, .rose-figure, .rose-crosshair-circle',
      ),
    );
    if (frame === undefined || box === null) return;
    /** La feuille déjà ouverte par le même toucher — une fiche qui épouse son contenu peut monter
     *  plus haut que l'aperçu réservé. */
    const sheet = document.querySelector('.board-sheet')?.getBoundingClientRect().top;
    const shift = fitShift(box, {
      left: frame.left,
      top: frame.top,
      right: frame.right,
      bottom: Math.min(frame.bottom - finger.floor, sheet ?? Infinity),
    });
    if (shift.dx !== 0 || shift.dy !== 0) finger.onFit(shift.dx, shift.dy);
  });

  // The tooltip aligns on its own height, which depends on its content: measure, then
  // re-place. Without this pass, a short bubble sits off-center from its medallion.
  useLayoutEffect(() => {
    const measured = bubble.current?.offsetHeight;
    if (measured !== undefined && Math.abs(measured - bubbleHeight) > 0.5)
      setBubbleHeight(measured);
  }, [hovered, bubbleHeight]);

  const action = compass.actions[hovered] ?? null;
  /** **A motive shows beside a fan, not only instead of one.** A point can carry a branch while
   *  another is refused, and a rose that only spoke when it drew nothing would go mute exactly
   *  there (`fanOf`). Hovering a branch replaces the motive with that branch's own tooltip,
   *  which is the reading order one wants. */
  const refusal = compass.refusal;
  // Due east, so a bubble with nothing to point at sits level with the crosshair it explains.
  const bubbleAngle = action === null ? 90 : angleOf(hovered, compass.actions.length);
  const placement =
    action === null && refusal === null
      ? null
      : finger !== null
        ? placeFingerBubble(x, y, width, height - finger.floor, bubbleHeight, radius, scale)
        : placeBubble(
            bubbleAngle,
            x,
            y,
            width,
            height,
            bubbleHeight,
            radius + MOORING_RADIUS - MEDALLION_RADIUS,
          );

  return (
    <div className="compass-rose">
      <div
        ref={root}
        className={finger === null ? 'rose' : 'rose rose--finger'}
        style={{ left: x, top: y }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="rose-menu">
          <svg className="rose-plot" viewBox="0 0 240 240" width={FRAME} height={FRAME} aria-hidden>
            {compass.actions.map((candidate, rank) => {
              const angle = angleOf(rank, compass.actions.length);
              const [x1, y1] = point(11, angle);
              const [x2, y2] = point(radius - (finger === null ? 14 : 24), angle);
              return (
                <line
                  key={rank}
                  className={`rose-spoke${isHeld(candidate) ? ' rose-spoke--held' : ''}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  opacity={isHeld(candidate) ? 0.5 : hovered === rank ? 0.85 : 0.4}
                />
              );
            })}
            <line className="rose-crosshair" x1="104" y1="120" x2="136" y2="120" />
            <line className="rose-crosshair" x1="120" y1="104" x2="120" y2="136" />
            <circle className="rose-crosshair-circle" cx="120" cy="120" r="8" />
            <circle className="rose-crosshair-dot" cx="120" cy="120" r="2.2" />
          </svg>

          {compass.actions.map((candidate, rank) => {
            const angle = angleOf(rank, compass.actions.length);
            const [left, top] = point(radius, angle);
            const held = isHeld(candidate);
            /** La branche qu'on prend le plus, en encre pleine sous le doigt (A6). */
            const lead = finger !== null && candidate.key === 'aim' && candidate.type === 'march';
            /** La seule encre rouge d'un médaillon : ce qui efface se distingue avant le survol,
             *  parce que la rose se lit au pictogramme et que celui-là ne se clique pas par
             *  inadvertance. */
            const grave = candidate.key === 'demolish' || candidate.key === 'dismantle';
            return (
              <Fragment key={rank}>
                {/* **Le seul chiffre à plat de la rose** (décision 54a) : le coût d'une élévation
                    est ce qui décide du clic, et le faire attendre le survol ferait ouvrir la
                    rose pour lire un prix. Il est posé hors du médaillon, sur le rayon, pour ne
                    rien prendre au pictogramme. */}
                {(candidate.key === 'upgrade' ||
                  candidate.key === 'raiseOutpost' ||
                  candidate.key === 'found') && (
                  <div
                    className={`rose-figure${held ? ' rose-figure--held' : ''}`}
                    style={figureAt(angle, radius + (finger === null ? FIGURE_OFFSET : 36))}
                  >
                    <Price costs={candidate.figure} size={11} />
                  </div>
                )}
                <button
                  type="button"
                  aria-label={candidate.label}
                  aria-disabled={held}
                  className={`rose-medallion${grave ? ' rose-medallion--grave' : ''}${lead ? ' rose-medallion--lead' : ''}${held ? ' rose-medallion--held' : hovered === rank ? ' rose-medallion--wet' : ''}`}
                  style={{ left, top }}
                  onPointerDown={(event) => {
                    pressedWith.current = event.pointerType;
                  }}
                  onPointerEnter={(event) => {
                    if (event.pointerType !== 'touch') setHovered(rank);
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType === 'touch') return;
                    setHovered((previous) => (previous === rank ? -1 : previous));
                  }}
                  onFocus={() => setHovered(rank)}
                  onBlur={() => setHovered((previous) => (previous === rank ? -1 : previous))}
                  /** Retenue, elle se survole et se lit — elle ne part pas. Le bouton reste
                   *  actif plutôt que `disabled` : un bouton désactivé n'émet plus de survol,
                   *  et la raison du grisé est précisément ce qu'il faut pouvoir lire. */
                  onClick={() => {
                    const touched = pressedWith.current === 'touch';
                    pressedWith.current = 'mouse';
                    if (touched && readsFirst(candidate, finger !== null) && read !== rank) {
                      setRead(rank);
                      setHovered(rank);
                      return;
                    }
                    if (!held) onAction(candidate);
                  }}
                >
                  <svg
                    viewBox="0 0 20 20"
                    width={finger === null ? 15 : 22}
                    height={finger === null ? 15 : 22}
                    aria-hidden
                  >
                    {PICTOGRAM_PATHS[candidate.pictogram]}
                  </svg>
                </button>
                {finger !== null && (
                  <div
                    aria-hidden
                    className={`rose-caption${grave ? ' rose-caption--grave' : ''}${held ? ' rose-caption--held' : ''}`}
                    style={captionAt(angle, radius)}
                  >
                    {candidate.label}
                  </div>
                )}
              </Fragment>
            );
          })}

          {placement !== null && (
            <>
              <div className="rose-tie" style={placement.tie} />
              <div
                ref={bubble}
                className="rose-bubble"
                style={{ left: placement.x, top: placement.y }}
              >
                <div className="rose-bubble-frame">
                  {/* Pas d'index de branche : aucune donnée ne le porte, et une rose se lit
                      spatialement — le rang « 1 / 2 » comptait des médaillons qu'on voit
                      (retiré le 01/09, v2 du contrat 04). */}
                  <div className="rose-bubble-header">
                    <span>{compass.kicker}</span>
                  </div>
                  <div className="rose-bubble-name">{compass.name}</div>
                  <div className="rose-bubble-rule" />
                  {action === null ? (
                    <>
                      <div className="rose-bubble-label rose-bubble-label--refused">
                        {fr.compass.refused}
                      </div>
                      <div className="rose-bubble-consequence">{refusal}</div>
                    </>
                  ) : action.key === 'upgrade' || action.key === 'raiseOutpost' ? (
                    <Upgrade action={action} />
                  ) : action.key === 'found' ? (
                    <Found action={action} />
                  ) : (
                    <>
                      <div
                        className={`rose-bubble-label${action.key === 'demolish' || action.key === 'dismantle' ? ' rose-bubble-label--grave' : ''}`}
                      >
                        {action.label}
                      </div>
                      {action.cost !== null && (
                        <div className="rose-bubble-cost">{action.cost}</div>
                      )}
                      <div className="rose-bubble-consequence">{action.consequence}</div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** One line of a bill, led by its resource's picto in its own ink: the pair is the same
 *  everywhere a price is printed (ADR 0028 §2). */
function BillText({ line }: { line: BillLine }) {
  return (
    <span className="inline-flex items-center gap-[5px]">
      <ResourcePlate resource={line.resource} height={16} width={16} onDark />
      {line.text}
    </span>
  );
}

/**
 * **Le détail d'une élévation** — coût matière par matière avec le stock en regard, durée, puis
 * la conséquence. Trois lignes plutôt qu'un `cost` d'un seul tenant : le stock à côté du prix est
 * ce qui transforme un chiffre en décision, et la matière qui manque doit se voir sans se lire.
 *
 * Retenue, la bulle finit par la raison du serveur et son échéance, sous un filet : c'est
 * l'unique grisé du jeu (décision 54a), et un grisé sans sa raison serait exactement ce que
 * l'ADR 0015 interdit.
 */
function Upgrade({
  action,
}: {
  action: Extract<CompassAction, { key: 'upgrade' | 'raiseOutpost' }>;
}) {
  const held = action.hold;
  return (
    <>
      <div className={`rose-bubble-label${held === null ? '' : ' rose-bubble-label--held'}`}>
        {action.label}
      </div>
      {action.bill.map((line) => (
        <div
          key={line.text}
          className={`rose-bubble-cost${held === null ? '' : ' rose-bubble-cost--held'}${
            line.lacking ? ' rose-bubble-cost--lacking' : ''
          }`}
        >
          <BillText line={line} />
        </div>
      ))}
      <div className="rose-bubble-cost rose-bubble-cost--held">{action.duration}</div>
      {held === null ? (
        <div className="rose-bubble-consequence">{action.consequence}</div>
      ) : (
        <>
          <div className="rose-bubble-consequence rose-bubble-consequence--refused">
            {held.reason}
          </div>
          {held.availability !== null && (
            <div className="rose-bubble-when">{held.availability}</div>
          )}
        </>
      )}
    </>
  );
}

/**
 * **Le détail d'une fondation** — la facture matière par matière avec le stock en regard, la
 * durée du chantier, puis ce que ça fait (révision du 15/09 de l'ADR 0020 §10). Fonder est
 * devenu un achat : les deux chiffres décident du clic, comme pour une élévation.
 *
 * Jamais de grisé ici : une matière qui manque **retire** la branche, et la rose s'ouvre sur le
 * motif du serveur (`foundationHold`, règle générale de l'ADR 0015).
 */
function Found({ action }: { action: Extract<CompassAction, { key: 'found' }> }) {
  return (
    <>
      <div className="rose-bubble-label">{action.label}</div>
      {action.bill.map((line) => (
        <div key={line.text} className="rose-bubble-cost">
          <BillText line={line} />
        </div>
      ))}
      <div className="rose-bubble-cost rose-bubble-cost--held">{action.duration}</div>
      <div className="rose-bubble-consequence">{action.consequence}</div>
    </>
  );
}

/**
 * **Les branches qui paient sans carte de confirmation se touchent deux fois** (sous le seuil).
 * Élever, monter un point, fonder partent au serveur dès l'action, et la
 * facture n'est écrite que dans la bulle : le premier toucher la montre — prix, refus éventuel —,
 * le second agit, un toucher ailleurs annule (la rose se referme). Les autres gardent le toucher
 * unique : viser, piller et ramasser ouvrent un aperçu qui confirme, bâtir ouvre un panneau, raser
 * et démanteler ouvrent leur carte.
 */
const CONFIRMED_BY_SECOND_TOUCH: ReadonlyArray<CompassAction['key']> = [
  'upgrade',
  'raiseOutpost',
  'found',
];

/**
 * Ce qu'un toucher fait d'abord sur ce médaillon : lire (`true`) ou agir. Hors du seuil, le doigt
 * lit toujours avant d'agir — le pictogramme y est muet (mobile-1c). Une branche retenue lit
 * toujours : elle n'a que sa raison à donner. La souris, elle, n'entre jamais ici.
 */
export const readsFirst = (action: CompassAction, captioned: boolean): boolean =>
  !captioned || isHeld(action) || CONFIRMED_BY_SECOND_TOUCH.includes(action.key);

/** La seule branche que le jeu grise, et la règle tient en une ligne pour qu'aucune autre ne
 *  puisse le devenir par distraction (ADR 0015, exception 54a). */
const isHeld = (action: CompassAction): boolean =>
  (action.key === 'upgrade' || action.key === 'raiseOutpost') && action.hold !== null;

const FRAME = 240;
const CENTER = 120;
const MEDALLION_RADIUS = 36;
/** Sous le doigt : cinq médaillons de 48 px sur ce rayon ne se touchent pas (corde de 99 px). */
const FINGER_RADIUS = 84;
/** Le demi-médaillon de 48 px, plus l'air entre lui et son cartouche. */
const CAPTION_OFFSET = 30;
/** The radius the tooltip moors to: the medallion plus its breathing margin. */
const MOORING_RADIUS = 56;
/** Ce qui sépare le chiffre à plat du bord du médaillon, sur le rayon. */
const FIGURE_OFFSET = 24;
const BUBBLE_WIDTH = 214;
const BUBBLE_HEIGHT = 170;
const BUBBLE_GAP = 16;

/** The fan starts due north and turns clockwise. */
const angleOf = (rank: number, total: number): number => (rank * 360) / total;

function point(radius: number, angle: number): readonly [number, number] {
  const radians = (angle * Math.PI) / 180;
  return [CENTER + radius * Math.sin(radians), CENTER - radius * Math.cos(radians)];
}

/** Le chiffre se pose sur le rayon, au-delà du médaillon : dans l'axe de la branche, il ne
 *  peut pas se confondre avec celui d'une voisine. */
function figureAt(angle: number, reach: number): { readonly left: number; readonly top: number } {
  const [left, top] = point(reach, angle);
  return { left, top };
}

/** **Le cartouche du libellé, côté extérieur** : au-dessus d'un médaillon du haut, dessous pour
 *  les autres — jamais vers le centre, où il couvrirait la cible qu'il désigne. */
function captionAt(angle: number, radius: number): { readonly left: number; readonly top: number } {
  const [left, top] = point(radius, angle);
  const north = Math.cos((angle * Math.PI) / 180) > 0.6;
  return { left, top: north ? top - CAPTION_OFFSET - 14 : top + CAPTION_OFFSET };
}

type Box = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

/** L'emprise de ce qui se touche et se lit — médaillons, cartouches, chiffres — en pixels
 *  d'écran. Un élément sans boîte (masqué) ne compte pas. */
function boxOf(elements: NodeListOf<Element>): Box | null {
  let box: Box | null = null;
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    box =
      box === null
        ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
        : {
            left: Math.min(box.left, rect.left),
            top: Math.min(box.top, rect.top),
            right: Math.max(box.right, rect.right),
            bottom: Math.max(box.bottom, rect.bottom),
          };
  }
  return box;
}

/** L'air laissé entre la rose et le bord, qui couvre aussi l'animation d'ouverture : la rose y
 *  est mesurée à 94 % de sa taille. */
const FIT_MARGIN = 10;

/**
 * **Ce dont la carte doit glisser pour que la rose tienne entière** (lot mobile-3, §1) : la
 * plus petite poussée, sur chaque axe, qui ramène son emprise dans le cadre — moins la place que
 * la feuille basse prend au pied. Une rose plus grande que le cadre se centre sur lui plutôt que
 * de sacrifier un bord. Positif vers la droite et le bas, comme `MapEngine.nudge`.
 */
export function fitShift(box: Box, frame: Box, margin = FIT_MARGIN): { dx: number; dy: number } {
  const axis = (low: number, high: number, min: number, max: number): number => {
    const room = max - min - 2 * margin;
    if (high - low > room) return Math.round((min + max) / 2 - (low + high) / 2);
    if (low < min + margin) return Math.round(min + margin - low);
    if (high > max - margin) return Math.round(max - margin - high);
    return 0;
  };
  return {
    dx: axis(box.left, box.right, frame.left, frame.right),
    dy: axis(box.top, box.bottom, frame.top, frame.bottom),
  };
}

const clamp = (value: number, low: number, high: number): number =>
  high < low ? (low + high) / 2 : Math.min(Math.max(value, low), high);

/**
 * The tooltip settles on whichever side the board leaves it room, never astride an edge: a
 * consequence cut in two cannot be read. Coordinates are the menu frame's, hence the offset
 * carried between its center and the map's edge.
 */
function placeBubble(
  angle: number,
  x: number,
  y: number,
  width: number,
  height: number,
  bubbleHeight: number,
  mooring: number,
) {
  const onRight = x + mooring + BUBBLE_GAP + BUBBLE_WIDTH + 12 <= width;
  const [, anchorY] = point(mooring, angle);
  const top = clamp(
    anchorY - bubbleHeight / 2,
    8 - (y - CENTER),
    height - 8 - bubbleHeight - (y - CENTER),
  );

  return {
    x: onRight ? CENTER + mooring + BUBBLE_GAP : CENTER - mooring - BUBBLE_GAP - BUBBLE_WIDTH,
    y: top,
    tie: {
      left: onRight ? CENTER + mooring - 2 : CENTER - mooring - BUBBLE_GAP,
      top: clamp(anchorY, top + 10, top + bubbleHeight - 10),
      width: BUBBLE_GAP + 4,
    },
  };
}

/**
 * **La bulle du doigt, sous la rose ou au-dessus, jamais à côté** : sur un téléphone il n'y a pas
 * la place d'un côté. Elle se centre sur le point, se borne aux deux bords de l'écran, et passe
 * au-dessus des médaillons quand la feuille basse lui prend le dessous. Les coordonnées sont
 * celles de la plate, que l'interface zoome de `scale`.
 */
function placeFingerBubble(
  x: number,
  y: number,
  width: number,
  floor: number,
  bubbleHeight: number,
  radius: number,
  scale: number,
) {
  const reach = radius + CAPTION_OFFSET + 18;
  const left = clamp(
    CENTER - BUBBLE_WIDTH / 2,
    CENTER + (8 - x) / scale,
    CENTER + (width - 8 - x) / scale - BUBBLE_WIDTH,
  );
  const below = y + (reach + bubbleHeight + 8) * scale <= floor;
  /** Ni dessous ni dessus : elle se borne au cadre et couvre un peu de la rose — une raison
   *  coupée par le bandeau ne se lirait pas du tout. */
  const top = clamp(
    below ? CENTER + reach : CENTER - reach - bubbleHeight,
    CENTER + (8 - y) / scale,
    CENTER + (floor - 8 - y) / scale - bubbleHeight,
  );
  return {
    x: left,
    y: top,
    tie: { left: CENTER, top: below ? CENTER + radius : top + bubbleHeight, width: 0 },
  };
}

/**
 * The mockup's pictogram plate, taken stroke for stroke. It is inline SVG, not a PNG mask
 * like `Pictogram`: these six drawings do not exist in `public/pictograms/`, and a twenty-unit
 * path gains nothing from going through a file.
 */
const PICTOGRAM_PATHS: Readonly<Record<CompassPictogram, ReactNode>> = {
  cabin: <path d="M10 1.75 L18.5 8.5 H16.7 V18 H3.3 V8.5 H1.5 Z" />,
  /** L'élévation : le chevron sur ses deux assises — « un étage de plus » à quinze pixels, sans
   *  reprendre un trait de la grue (tranché le 01/09). */
  chevron: (
    <path d="M10 1.4 L17.4 8.8 H13.2 V12.4 H6.8 V8.8 H2.6 Z M4.4 14.4 H15.6 V16.4 H4.4 Z M4.4 17.6 H15.6 V19.6 H4.4 Z" />
  ),
  /** La fondation : la hutte de la marche, plantée — un mât, un fanion, et le sol sous elle.
   *  C'est là que la colonne s'arrête d'être une colonne. */
  post: (
    <path d="M6.6 7 H12.4 V17.4 H6.6 Z M4.2 17.4 H15.8 V19.2 H4.2 Z M9.4 1.2 H10.7 V7 H9.4 Z M11.4 1.6 H17.6 L15.2 3.8 L17.6 6 H11.4 Z" />
  ),
  /** « Entrer en garnison » : la hutte de la marche, porte ouverte — le toit de `cabin`, deux
   *  murs, un linteau, et le vide entre eux par où la colonne entre. */
  doorway: (
    <path d="M10 1.75 L18.5 8.5 H1.5 Z M3.3 9.4 H7.4 V18 H3.3 Z M12.6 9.4 H16.7 V18 H12.6 Z M7.4 9.4 H12.6 V11.6 H7.4 Z" />
  ),
  anchor: (
    <path d="M10 1.5 A2.5 2.5 0 1 1 9.99 1.5 Z M8.9 5.6 H11.1 V17.2 H8.9 Z M5.4 7.1 H14.6 V9 H5.4 Z M3.1 10.9 C3.1 15.8 6.2 18.3 10 18.3 C13.8 18.3 16.9 15.8 16.9 10.9 H14.8 C14.8 14.8 12.6 16.2 10 16.2 C7.4 16.2 5.2 14.8 5.2 10.9 Z M3.1 9 L5.9 13 H0.3 Z M16.9 9 L19.7 13 H14.1 Z" />
  ),
  helmet: (
    <path d="M4.5 11.9 C4.5 8 6.9 5.2 10 5.2 C13.1 5.2 15.5 8 15.5 11.9 Z M1.3 11.3 C1.3 14.9 5.2 16.1 10 16.1 C14.8 16.1 18.7 14.9 18.7 11.3 Z" />
  ),
  propeller: (
    <>
      <path d="M10 1 C12.8 2.9 13.7 5.9 12.8 9.2 H7.2 C6.3 5.9 7.2 2.9 10 1 Z M10 6.8 A3.2 3.2 0 1 1 9.99 6.8 Z" />
      <path
        d="M10 1 C12.8 2.9 13.7 5.9 12.8 9.2 H7.2 C6.3 5.9 7.2 2.9 10 1 Z"
        transform="rotate(120 10 10)"
      />
      <path
        d="M10 1 C12.8 2.9 13.7 5.9 12.8 9.2 H7.2 C6.3 5.9 7.2 2.9 10 1 Z"
        transform="rotate(240 10 10)"
      />
    </>
  ),
  /** « Ramasser » : la caisse cerclée, la même chose que la carte pose sur un butin abandonné —
   *  quatre montants et la bande de cerclage en diagonale, lisible à quinze pixels. */
  crate: (
    <path d="M2.4 4.2 H17.6 V6.2 H2.4 Z M2.4 13.8 H17.6 V15.8 H2.4 Z M2.4 4.2 H4.4 V15.8 H2.4 Z M15.6 4.2 H17.6 V15.8 H15.6 Z M4.8 12.3 L14.3 6.2 L15.3 7.8 L5.8 13.9 Z" />
  ),
  /** « Piller » et « saboter » sous un seul dessin — la torche : c'est le même ordre, et seul le
   *  libellé change avec la nature du site. La flamme, le manchon, le manche. */
  sabotage: (
    <path d="M10 0.9 C12.7 3.6 13.7 5.8 13.7 7.7 C13.7 10 11.9 11.6 10 11.6 C8.1 11.6 6.3 10 6.3 7.7 C6.3 5.8 7.3 3.6 10 0.9 Z M7 11.2 H13 V13.2 H7 Z M8.9 13.2 H11.1 V19.1 H8.9 Z" />
  ),
  /** « Raser » : le mur qui tombe. Deux assises debout, un pan déjà descellé et deux moellons
   *  en l'air — lisible à quinze pixels, et sans un trait de la grue ni de la torche. */
  rubble: (
    <path d="M2.8 13.4 H17.2 V15.6 H2.8 Z M2.8 16.8 H17.2 V19 H2.8 Z M3.4 9.2 H8.2 V12.4 H3.4 Z M10.6 6.6 L14.4 4.9 L15.7 7.7 L11.9 9.4 Z M8.6 1.3 H12 V4 H8.6 Z" />
  ),
  /** The raid's pennant, from the mockup's departures board — a raid is a flag planted for a
   *  while, never a place taken (ADR 0004). */
  /** « Bombarder » : l'obus debout sur son culot, la ceinture marquée. */
  shell: (
    <path d="M10 1.2 C12.7 3.6 13.6 6.5 13.6 9.2 V11.2 H6.4 V9.2 C6.4 6.5 7.3 3.6 10 1.2 Z M6.4 12.6 H13.6 V16.4 H6.4 Z M5.6 17.2 H14.4 V19.2 H5.6 Z" />
  ),
  pennant: <path d="M2.5 2.6 H4.6 V17.6 H2.5 Z M5.6 3 H16.4 L13.6 7.2 L16.4 11.4 H5.6 Z" />,
  rifles: (
    <>
      <path
        d="M8.7 1.4 H11.3 V10.8 H8.7 Z M8.2 10.4 H12.8 L13.9 18.6 H9.5 Z"
        transform="rotate(-28 10 10)"
      />
      <path
        d="M8.7 1.4 H11.3 V10.8 H8.7 Z M8.2 10.4 H12.8 L13.9 18.6 H9.5 Z"
        transform="rotate(28 10 10)"
      />
    </>
  ),
};
