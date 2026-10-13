import {
  createContext,
  type CSSProperties,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { fr } from '@/i18n/fr';
import { keepWindowGeometry, readWindowGeometry } from '@/data/settings';
import { useSwipe } from '@/shell/BottomSheet';
import { useSoleSurface } from '@/shell/sole-surface';
import { useNarrowScreen } from '@/shell/viewport';
import { HandleContext } from './Draggable';
import { followDrag, scaleOf, useDragOffset, type Grab, type Offset } from './dragging';

const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;

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

type FrameProps = WindowProps & {
  name: string;
  alignment?: 'top' | 'center' | 'right';
  width: number;
  children: ReactNode;
};

/**
 * **Deux cadres pour huit fenêtres, et le seuil décide lequel** (décision du 15/09). Au bureau,
 * une fenêtre qu'on pousse, qu'on redimensionne et qui retient sa place ; sous le seuil, une
 * feuille pleine page — les trois gestes n'y ont pas de sens et ce qui les sert ne se monte donc
 * pas du tout, plutôt que de se monter pour rester inerte.
 *
 * Deux composants et non deux branches dans un seul : la feuille n'appelle ni `useDragOffset`
 * ni la géométrie mémorisée, et un `if` au milieu des crochets ne le permettrait pas.
 */
export function FloatingWindow(props: FrameProps) {
  const narrow = useNarrowScreen();
  return narrow ? <WindowSheet {...props} /> : <DeskWindow {...props} />;
}

/**
 * **Une feuille, jamais une fenêtre** : elle occupe l'écran entre le bandeau et la barre de pied
 * (piste A, passe 2), ne se pousse pas (aucun `HandleContext`, donc les en-têtes gardent un
 * curseur ordinaire) et se ferme par son propre bouton, par Échap ou d'un geste vers le bas sur
 * sa poignée. Elle se déclare *dimensionnée* : elle porte une hauteur à elle, exactement comme
 * une fenêtre dont on aurait tiré le coin, et les défileurs intérieurs doivent donc cesser de se
 * plafonner en pixels.
 *
 * **Elle est la seule surface ouverte** : en montant, elle ferme la feuille ou le panneau qui
 * l'était (`useSoleSurface`), et une fenêtre qu'une autre recouvre se ferme d'elle-même.
 */
function WindowSheet({ onClose, rank, inFront, children }: FrameProps) {
  const container = useRef<HTMLDivElement>(null);
  useOpeningFocus(container);
  useEscapeToClose(onClose, inFront);
  useSoleSurface(onClose, inFront);
  useClosedWhenCovered(onClose, inFront);
  const keyboard = useKeyboardEdges();
  const [pull, setPull] = useState(0);
  const grip = useSwipe(
    (travel) => setPull(Math.max(0, travel)),
    (travel) => {
      setPull(0);
      if (travel > SWIPE_TO_CLOSE_PX) onClose();
    },
  );

  return (
    <div
      ref={container}
      tabIndex={-1}
      role="dialog"
      className="float hud board-window @container flex flex-col overflow-hidden outline-none"
      style={
        {
          zIndex: `calc(var(--z-window) + ${rank})`,
          ...(keyboard === null
            ? {}
            : {
                '--window-top': `calc(${keyboard.top}px + var(--safe-top))`,
                '--window-bottom': `${keyboard.bottom}px`,
              }),
          ...(pull > 0 ? { transform: `translateY(${pull / scaleOf(container.current)}px)` } : {}),
        } as CSSProperties
      }
    >
      <div
        {...grip}
        aria-hidden
        className="flex h-[14px] shrink-0 cursor-grab items-center justify-center"
        style={{ touchAction: 'none' }}
      >
        <span className="block h-[3px] w-[40px] bg-[var(--paper-dim)]" />
      </div>
      <SizedContext.Provider value>{children}</SizedContext.Provider>
    </div>
  );
}

/**
 * **Recouverte, une feuille se ferme par son propre geste** (piste A, passe 2, qui révise le
 * 15/09 : fermer celle du dessus rendait la précédente). Par le sien et non par l'URL, parce que
 * le journal et le télégraphe datent la lecture à la fermeture — une fenêtre retirée en silence
 * laisserait son badge compter ce qu'on vient de lire. Une fois : le geste navigue, et la fenêtre
 * se redessine encore avant de partir.
 */
function useClosedWhenCovered(onClose: () => void, inFront: boolean): void {
  const closed = useRef(false);
  useEffect(() => {
    if (inFront || closed.current) return;
    closed.current = true;
    onClose();
  }, [inFront, onClose]);
}

/** Un geste franc, pas un défilement qui a dérapé sur la poignée. */
const SWIPE_TO_CLOSE_PX = 80;

/**
 * **Le clavier prend la place du pied** (A5 bis) : le champ et « envoyer » montent au-dessus de
 * lui, les en-têtes restent en tête. `visualViewport` est la seule mesure du clavier qu'ont les
 * deux moteurs ; `null` tant qu'il est rangé, et la feuille retombe alors sur les bords du
 * plateau.
 */
function useKeyboardEdges(): { top: number; bottom: number } | null {
  const [edges, setEdges] = useState<{ top: number; bottom: number } | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const follow = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      setEdges(
        covered < KEYBOARD_MIN_PX
          ? null
          : { top: viewport.offsetTop, bottom: Math.max(0, Math.round(covered)) },
      );
    };
    follow();
    viewport.addEventListener('resize', follow);
    viewport.addEventListener('scroll', follow);
    return () => {
      viewport.removeEventListener('resize', follow);
      viewport.removeEventListener('scroll', follow);
    };
  }, []);
  return edges;
}

/** En deçà, c'est une barre d'outils du navigateur qui bouge, pas un clavier. */
const KEYBOARD_MIN_PX = 120;

function DeskWindow({
  name,
  onClose,
  rank,
  inFront,
  onBringForward,
  alignment = 'center',
  width,
  children,
}: FrameProps) {
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

  useOpeningFocus(container);
  useEscapeToClose(onClose, inFront);

  // A window, not a modal: no veil, the map stays alive behind. The container only serves
  // placement and lets clicks through.
  return (
    <div
      className={`pointer-events-none fixed inset-0 flex ${
        alignment === 'right'
          ? 'items-start justify-end px-4 pt-[calc(var(--board-top)_+_10px)] pb-4'
          : alignment === 'top'
            ? 'items-start justify-center px-6 py-[34px]'
            : 'items-center justify-center p-8'
      }`}
      /** **Le plan des fenêtres vient de l'échelle, pas d'ici** (`--z-window`, `tokens.css`) : un
       *  40 écrit à la main ne se comparait à rien, et le bandeau des ressources est passé
       *  par-dessus une modale en prod. Le rang n'empile que les fenêtres entre elles, et il
       *  reste sous le plan suivant tant qu'on n'en ouvre pas dix. */
      style={{ zIndex: `calc(var(--z-window) + ${rank})` }}
    >
      <div
        ref={container}
        tabIndex={-1}
        role="dialog"
        onPointerDown={inFront ? undefined : onBringForward}
        className="float hud @container pointer-events-auto relative flex max-h-full shrink-0 flex-col outline-none"
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
          className="resize-corner absolute right-0 bottom-0 z-10 h-[16px] w-[16px] cursor-nwse-resize"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, transparent 0 3px, var(--ink) 3px 4px)',
          }}
        />
      </div>
    </div>
  );
}

// Focus is taken at opening only: retaking it at every bring-forward would tear it away
// from the field the player just clicked.
function useOpeningFocus(container: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    container.current?.focus();
  }, [container]);
}

/** Escape only closes the topmost surface, but no Tab trap: a window laid on the desk is not
 *  exclusive, focus must be able to leave for the map. */
function useEscapeToClose(onClose: () => void, inFront: boolean): void {
  useEffect(() => {
    if (!inFront) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, inFront]);
}
