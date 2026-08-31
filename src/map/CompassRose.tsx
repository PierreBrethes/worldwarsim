import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { CompassAction, CompassPictogram, Compass } from '@/domain/compass-rose';
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
}: {
  compass: Compass;
  x: number;
  y: number;
  width: number;
  height: number;
  onClose: () => void;
  onAction: (action: CompassAction) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(-1);
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
      : placeBubble(bubbleAngle, x, y, width, height, bubbleHeight);

  return (
    <div className="compass-rose">
      <div
        ref={root}
        className="rose"
        style={{ left: x, top: y }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="rose-menu">
          <svg className="rose-plot" viewBox="0 0 240 240" width={FRAME} height={FRAME} aria-hidden>
            {compass.actions.map((_, rank) => {
              const angle = angleOf(rank, compass.actions.length);
              const [x1, y1] = point(11, angle);
              const [x2, y2] = point(MEDALLION_RADIUS - 14, angle);
              return (
                <line
                  key={rank}
                  className="rose-spoke"
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  opacity={hovered === rank ? 0.85 : 0.4}
                />
              );
            })}
            <line className="rose-crosshair" x1="104" y1="120" x2="136" y2="120" />
            <line className="rose-crosshair" x1="120" y1="104" x2="120" y2="136" />
            <circle className="rose-crosshair-circle" cx="120" cy="120" r="8" />
            <circle className="rose-crosshair-dot" cx="120" cy="120" r="2.2" />
          </svg>

          {compass.actions.map((candidate, rank) => {
            const [left, top] = point(MEDALLION_RADIUS, angleOf(rank, compass.actions.length));
            return (
              <button
                key={rank}
                type="button"
                aria-label={candidate.label}
                className={`rose-medallion${hovered === rank ? ' rose-medallion--wet' : ''}`}
                style={{ left, top }}
                onPointerEnter={() => setHovered(rank)}
                onPointerLeave={() => setHovered((previous) => (previous === rank ? -1 : previous))}
                onFocus={() => setHovered(rank)}
                onBlur={() => setHovered((previous) => (previous === rank ? -1 : previous))}
                onClick={() => onAction(candidate)}
              >
                <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
                  {PICTOGRAM_PATHS[candidate.pictogram]}
                </svg>
              </button>
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
                  <div className="rose-bubble-header">
                    <span>{compass.kicker}</span>
                    {action !== null && (
                      <span className="rose-bubble-rank">
                        {hovered + 1} / {compass.actions.length}
                      </span>
                    )}
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
                  ) : (
                    <>
                      <div className="rose-bubble-label">{action.label}</div>
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

const FRAME = 240;
const CENTER = 120;
const MEDALLION_RADIUS = 36;
/** The radius the tooltip moors to: the medallion plus its breathing margin. */
const MOORING_RADIUS = 56;
const BUBBLE_WIDTH = 214;
const BUBBLE_HEIGHT = 170;
const BUBBLE_GAP = 16;

/** The fan starts due north and turns clockwise. */
const angleOf = (rank: number, total: number): number => (rank * 360) / total;

function point(radius: number, angle: number): readonly [number, number] {
  const radians = (angle * Math.PI) / 180;
  return [CENTER + radius * Math.sin(radians), CENTER - radius * Math.cos(radians)];
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
) {
  const onRight = x + MOORING_RADIUS + BUBBLE_GAP + BUBBLE_WIDTH + 12 <= width;
  const [, anchorY] = point(MOORING_RADIUS, angle);
  const top = clamp(
    anchorY - bubbleHeight / 2,
    8 - (y - CENTER),
    height - 8 - bubbleHeight - (y - CENTER),
  );

  return {
    x: onRight
      ? CENTER + MOORING_RADIUS + BUBBLE_GAP
      : CENTER - MOORING_RADIUS - BUBBLE_GAP - BUBBLE_WIDTH,
    y: top,
    tie: {
      left: onRight ? CENTER + MOORING_RADIUS - 2 : CENTER - MOORING_RADIUS - BUBBLE_GAP,
      top: clamp(anchorY, top + 10, top + bubbleHeight - 10),
      width: BUBBLE_GAP + 4,
    },
  };
}

/**
 * The mockup's pictogram plate, taken stroke for stroke. It is inline SVG, not a PNG mask
 * like `Pictogram`: these six drawings do not exist in `public/pictograms/`, and a twenty-unit
 * path gains nothing from going through a file.
 */
const PICTOGRAM_PATHS: Readonly<Record<CompassPictogram, ReactNode>> = {
  cabin: <path d="M10 1.75 L18.5 8.5 H16.7 V18 H3.3 V8.5 H1.5 Z" />,
  /** La fondation : la hutte de la marche, plantée — un mât, un fanion, et le sol sous elle.
   *  C'est là que la colonne s'arrête d'être une colonne. */
  post: (
    <path d="M6.6 7 H12.4 V17.4 H6.6 Z M4.2 17.4 H15.8 V19.2 H4.2 Z M9.4 1.2 H10.7 V7 H9.4 Z M11.4 1.6 H17.6 L15.2 3.8 L17.6 6 H11.4 Z" />
  ),
  crane: (
    <path d="M2.3 2.5 H18.2 V5.4 H2.3 Z M6.2 5.4 H9.7 V17 H6.2 Z M14.3 5.4 H16.2 V10.2 H14.3 Z M13.2 10.2 H17.3 V13.2 H13.2 Z M3.1 17 H12.8 V19.5 H3.1 Z" />
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
  /** **La flèche de l'envoi** : elle ne dit ni où ni comment, parce que la branche n'en décide
   *  rien — elle rend la main à la carte, qui est ce qui agit. */
  arrow: <path d="M2.4 8.4 H11.4 V4.2 L18.6 10 L11.4 15.8 V11.6 H2.4 Z" />,
  /** The raid's pennant, from the mockup's departures board — a raid is a flag planted for a
   *  while, never a place taken (ADR 0004). */
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
