import {
  useCallback,
  useLayoutEffect,
  useState,
  type PointerEvent as PointerEventReact,
  type RefObject,
} from 'react';

export type Grab = (event: PointerEventReact<HTMLElement>) => void;

export type Offset = { readonly x: number; readonly y: number };

export const ORIGIN: Offset = { x: 0, y: 0 };

/**
 * A pointer drag followed to the window rather than to the element: the pointer leaves a
 * 16-pixel handle at the first fast gesture, and a listener bound to the handle would drop
 * the drag there.
 */
export function followDrag(onDrag: (drag: PointerEvent) => void, onRelease: () => void): void {
  const release = () => {
    window.removeEventListener('pointermove', onDrag);
    window.removeEventListener('pointerup', release);
    onRelease();
  };
  window.addEventListener('pointermove', onDrag);
  window.addEventListener('pointerup', release);
}

/**
 * `.hud` carries a `zoom`, and the pointer measures in screen pixels while the width is
 * written in layout pixels: without this ratio, every drag drifts as soon as the player
 * changed the interface scale.
 */
export function scaleOf(element: HTMLElement | null): number {
  if (!element || element.offsetWidth === 0) return 1;
  return element.getBoundingClientRect().width / element.offsetWidth;
}

/** How far a surface may be pushed from its anchoring before it leaves the window, in layout
 *  pixels — the unit the offset itself is written in. */
type Frame = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
};

/**
 * **A surface may be pushed aside, never out.** The bounds are read off the rendered box rather
 * than off the caller's anchoring, so a widget pinned to a corner, a window centred in the frame
 * and a panel opened at a click point are all held in by the same measure — and none of them has
 * to say where it sits.
 *
 * `applied` is the push the box is currently drawn with: taking it back out of the measure is
 * what leaves the anchoring alone, wherever the caller put it.
 */
function frameFor(element: HTMLElement | null, applied: Offset): Frame | null {
  if (!element) return null;
  const scale = scaleOf(element);
  const box = element.getBoundingClientRect();
  const anchorX = box.left - applied.x * scale;
  const anchorY = box.top - applied.y * scale;
  return {
    minX: -anchorX / scale,
    maxX: (window.innerWidth - box.width - anchorX) / scale,
    minY: -anchorY / scale,
    maxY: (window.innerHeight - box.height - anchorY) / scale,
  };
}

/**
 * A box taller than the window cannot honour both bounds; it honours the low one, because the
 * header is at the top and a surface whose header is out of the frame is lost for good — the
 * header is the only way back.
 */
const withinFrame = (frame: Frame | null, offset: Offset): Offset =>
  frame === null
    ? offset
    : {
        x: Math.max(frame.minX, Math.min(frame.maxX, offset.x)),
        y: Math.max(frame.minY, Math.min(frame.maxY, offset.y)),
      };

/** A grab that a click on a control must not start: a close button stays a button. */
const onControl = (event: PointerEventReact<HTMLElement>): boolean =>
  (event.target as HTMLElement).closest('button, a, input, select, textarea, details') !== null;

/**
 * **The one drag of the board.** Every surface laid over the map moves the same way — a window,
 * a widget, a panel opened at a click — and it moves the same way because they all read this
 * hook rather than each rewriting the same twenty lines. They had drifted apart already: three
 * copies existed, and only one of them refused a drag started on a button.
 *
 * The offset lives here and the position does not: where a surface is anchored is the caller's
 * business — a corner, a click point, the middle of the screen — and this only says how far the
 * player has pushed it from there.
 *
 * `onSettle` fires on release and not on every move: a surface that remembers its place writes
 * once per drag rather than sixty times a second.
 */
export function useDragOffset({
  container,
  from = ORIGIN,
  onSettle,
}: {
  container: RefObject<HTMLElement | null>;
  from?: Offset;
  onSettle?: (offset: Offset) => void;
}): { offset: Offset; grab: Grab } {
  const [offset, setOffset] = useState<Offset>(from);

  // A place comes back from a session whose screen and interface scale were not today's, and the
  // box itself grows when a section unfolds: the frame is re-read at each of those, not only
  // under the pointer. Without it a surface pushed to an edge yesterday is simply gone today,
  // and nothing on the board offers a way back.
  // Before the paint rather than after: a surface restored out of frame would otherwise show
  // for one frame at the edge it was left at.
  useLayoutEffect(() => {
    const pullIn = () =>
      setOffset((current) => withinFrame(frameFor(container.current, current), current));
    pullIn();
    const observer = new ResizeObserver(pullIn);
    if (container.current) observer.observe(container.current);
    window.addEventListener('resize', pullIn);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', pullIn);
    };
  }, [container]);

  const grab = useCallback<Grab>(
    (event) => {
      // The right button belongs to the map, and a click on a control stays a click.
      if (event.button !== 0 || onControl(event)) return;
      event.preventDefault();
      const scale = scaleOf(container.current);
      // Measured once at the grab and not at every move: the box does not change size under the
      // pointer, and a `getBoundingClientRect` per frame is a forced reflow per frame.
      const frame = frameFor(container.current, offset);
      const startX = event.clientX - offset.x * scale;
      const startY = event.clientY - offset.y * scale;
      let latest = offset;
      followDrag(
        (drag) => {
          latest = withinFrame(frame, {
            x: (drag.clientX - startX) / scale,
            y: (drag.clientY - startY) / scale,
          });
          setOffset(latest);
        },
        () => onSettle?.(latest),
      );
    },
    [offset, container, onSettle],
  );

  return { offset, grab };
}
