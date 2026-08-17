import { useCallback, useState, type PointerEvent as PointerEventReact, type RefObject } from 'react';

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

/** A grab that a click on a control must not start: a close button stays a button. */
export const onControl = (event: PointerEventReact<HTMLElement>): boolean =>
  (event.target as HTMLElement).closest('button, a, input, select, textarea') !== null;

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

  const grab = useCallback<Grab>(
    (event) => {
      // The right button belongs to the map, and a click on a control stays a click.
      if (event.button !== 0 || onControl(event)) return;
      event.preventDefault();
      const scale = scaleOf(container.current);
      const startX = event.clientX - offset.x * scale;
      const startY = event.clientY - offset.y * scale;
      let latest = offset;
      followDrag(
        (drag) => {
          latest = { x: (drag.clientX - startX) / scale, y: (drag.clientY - startY) / scale };
          setOffset(latest);
        },
        () => onSettle?.(latest),
      );
    },
    [offset, container, onSettle],
  );

  return { offset, grab };
}
