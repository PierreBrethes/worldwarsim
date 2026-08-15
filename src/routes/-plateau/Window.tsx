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
import { followDrag, onControl, scaleOf, type Grab } from './dragging';

const HandleContext = createContext<Grab>(() => {});

const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;
const BASE_PLANE = 40;

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

/**
 * A window's header wraps itself in this: it is the only zone it can be dragged by. The
 * drag lives in `FloatingWindow` and not with the caller, otherwise every window would
 * reinvent its own grab and they would drift apart.
 */
export function WindowHandle({ className = '', children }: { className?: string; children: ReactNode }) {
  const grab = useContext(HandleContext);
  return (
    <div onPointerDown={grab} className={`cursor-move ${className}`}>
      {children}
    </div>
  );
}

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
  const [geometry, setGeometry] = useState(() => readWindowGeometry(name));
  const { offset, size } = geometry;

  const grab = useCallback<Grab>(
    (event) => {
      if (event.button !== 0) return;
      // A click on a header button (close, tab) stays a click, never a drag.
      if (onControl(event)) return;
      event.preventDefault();
      const scale = scaleOf(container.current);
      const startX = event.clientX - offset.x * scale;
      const startY = event.clientY - offset.y * scale;
      let latest = offset;
      followDrag(
        (drag) => {
          latest = {
            x: (drag.clientX - startX) / scale,
            y: (drag.clientY - startY) / scale,
          };
          setGeometry((previous) => ({ ...previous, offset: latest }));
        },
        () => keepWindowGeometry(name, { offset: latest, size }),
      );
    },
    [offset, size, name],
  );

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
          setGeometry((previous) => ({ ...previous, size: latest }));
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
        <HandleContext.Provider value={grab}>{children}</HandleContext.Provider>
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

