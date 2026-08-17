import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { keepWindowGeometry, readWindowGeometry } from '@/data/settings';
import { ORIGIN, useDragOffset, type Grab, type Offset } from './dragging';

/**
 * **One grab zone for the whole board.** A surface is dragged by its header and by nothing else,
 * and the header does not know how: it wraps itself in `DragHandle` and the surface above it
 * provides the grab. That indirection is the point — the window, the widget and the panel opened
 * at a click all light up the same way, and none of them carries a copy of the gesture.
 *
 * The context defaults to `null` rather than to a no-op: a header laid outside a draggable
 * surface then keeps a plain cursor instead of promising a move nothing performs.
 */
export const HandleContext = createContext<Grab | null>(null);

export function DragHandle({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const grab = useContext(HandleContext);
  return (
    <div
      onPointerDown={grab ?? undefined}
      className={`${grab === null ? '' : 'cursor-move'} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * **A surface laid on the board that the player may push aside.** It owns the offset and nothing
 * else: the anchoring — a corner, a click point — stays with the caller, in the classes it
 * already had. Anything it wraps becomes draggable by whatever header wears a `DragHandle`.
 *
 * `remember` is the whole difference between a widget and a popover, and it is a name rather
 * than a boolean because it is the key the place is written under. A **permanent** surface takes
 * one: the reserves and the troops sit where the player left them, session after session. One
 * opened **at a point** takes none: it is aimed at what was clicked, and restoring yesterday's
 * push would tear it away from the very thing it describes.
 */
export function Draggable({
  remember,
  className = '',
  style,
  innerRef,
  children,
}: {
  remember?: string;
  className?: string;
  style?: CSSProperties;
  /** For a caller that measures the surface itself — the construction panel resizes by a
   *  corner and needs the box the drag already holds, rather than a second one around it. */
  innerRef?: MutableRefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      container.current = node;
      if (innerRef) innerRef.current = node;
    },
    [innerRef],
  );
  // Read once and not on every render: a widget re-renders on the clock's every tick, and the
  // stored place is read from `localStorage` through a `JSON.parse`.
  const from = useMemo(
    () => (remember === undefined ? ORIGIN : readWindowGeometry(remember).offset),
    [remember],
  );
  const settle = useCallback(
    (offset: Offset) => {
      // Widgets size themselves to their content: there is no size to keep beside the place.
      if (remember !== undefined) keepWindowGeometry(remember, { offset, size: null });
    },
    [remember],
  );
  const { offset, grab } = useDragOffset({ container, from, onSettle: settle });

  return (
    <div
      ref={attach}
      className={className}
      style={{ ...style, transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      <HandleContext.Provider value={grab}>{children}</HandleContext.Provider>
    </div>
  );
}
