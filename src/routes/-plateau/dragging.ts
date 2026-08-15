import type { PointerEvent as PointerEventReact } from 'react';

export type Grab = (event: PointerEventReact<HTMLElement>) => void;

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
