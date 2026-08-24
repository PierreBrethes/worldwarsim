import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fr } from '@/i18n/fr';
import { keepWindowGeometry, readWindowGeometry } from '@/data/settings';
import { HandleContext } from './Draggable';
import { followDrag, scaleOf, useDragOffset, type Grab, type Offset } from './dragging';

const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;
const BASE_PLANE = 40;

/**
 * **Whether the window has a height of its own**, i.e. the player has dragged its corner. An
 * inner scroller has to cap itself while the window is still content-sized — nothing else
 * bounds it — and has to *stop* capping the moment the window carries a height: a pixel cap
 * inside a resized window is a box that refuses to grow with the one around it, which is
 * exactly what the corner was dragged to do.
 *
 * A context rather than a prop threaded down: the scroller that needs the answer is three
 * components below the frame, and none of the ones in between has any business carrying it.
 */
const SizedContext = createContext(false);

export const useWindowSized = (): boolean => useContext(SizedContext);

/**
 * What the board entrusts to each window: several are open at once, and only the route
 * knows which one is in front.
 */
export type WindowProps = {
  onClose: () => void;
  rank: number;
  inFront: boolean;
  onBringForward: () => void;
};

export function FloatingWindow({
  name,
  onClose,
  rank,
  inFront,
  onBringForward,
  alignment = 'center',
  width,
  children,
}: WindowProps & {
  name: string;
  alignment?: 'top' | 'center';
  width: number;
  children: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [start] = useState(() => readWindowGeometry(name));
  const [size, setSize] = useState(start.size);

  /** The move is the board's, shared with every widget and panel (`dragging.ts`); only the
   *  corner below belongs to a window, because only a window is resized. */
  const settle = useCallback(
    (offset: Offset) => keepWindowGeometry(name, { offset, size }),
    [name, size],
  );
  const { offset, grab } = useDragOffset({ container, from: start.offset, onSettle: settle });

  const resize = useCallback<Grab>(
    (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const box = container.current;
      if (!box) return;
      const scale = scaleOf(box);
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = box.offsetWidth;
      const startHeight = box.offsetHeight;
      let latest = size;
      followDrag(
        (drag) => {
          latest = {
            width: Math.max(MIN_WIDTH, startWidth + (drag.clientX - startX) / scale),
            height: Math.max(MIN_HEIGHT, startHeight + (drag.clientY - startY) / scale),
          };
          setSize(latest);
        },
        () => keepWindowGeometry(name, { offset, size: latest }),
      );
    },
    [offset, size, name],
  );

  // Focus is taken at opening only: retaking it at every bring-forward would tear it away
  // from the field the player just clicked.
  useEffect(() => {
    container.current?.focus();
  }, []);

  useEffect(() => {
    // Escape only closes the topmost window, but no Tab trap: a window laid on the desk is
    // not exclusive, focus must be able to leave for the map.
    if (!inFront) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, inFront]);

  // A window, not a modal: no veil, the map stays alive behind. The container only serves
  // placement and lets clicks through.
  return (
    <div
      className={`pointer-events-none fixed inset-0 flex justify-center ${
        alignment === 'top' ? 'items-start px-6 py-[34px]' : 'items-center p-8'
      }`}
      style={{ zIndex: BASE_PLANE + rank }}
    >
      <div
        ref={container}
        tabIndex={-1}
        role="dialog"
        onPointerDown={inFront ? undefined : onBringForward}
        className="hud @container pointer-events-auto relative flex max-h-full shrink-0 flex-col outline-none"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          width: size ? size.width : `min(${width}px, 100%)`,
          ...(size ? { height: size.height } : {}),
        }}
      >
        <HandleContext.Provider value={grab}>
          <SizedContext.Provider value={size !== undefined}>{children}</SizedContext.Provider>
        </HandleContext.Provider>
        <div
          aria-hidden
          onPointerDown={resize}
          title={fr.window.resize}
          className="absolute right-0 bottom-0 z-10 h-[16px] w-[16px] cursor-nwse-resize"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, transparent 0 3px, var(--ink) 3px 4px)',
          }}
        />
      </div>
    </div>
  );
}
