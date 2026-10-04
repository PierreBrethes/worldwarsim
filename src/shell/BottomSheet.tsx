import {
  createContext,
  useContext,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { fr } from '@/i18n/fr';
import { useSoleSurface } from './sole-surface';

export const SHEET_HEIGHTS = ['peek', 'half', 'full'] as const;

export type SheetHeight = (typeof SHEET_HEIGHTS)[number];

/**
 * **La part d'écran de chaque cran** — les mêmes fractions que `.board-sheet` (`index.css`), lues
 * par ce qui doit garder un point visible au-dessus d'une feuille : la carte qui remonte, la rose
 * qui se recale. Le plein écran n'y est pas, il ne laisse rien à garder.
 */
const SHEET_SHARE = { peek: 0.3, half: 0.5 } as const;

/** La hauteur d'une feuille à ce cran, en pixels d'écran. */
export const sheetHeight = (height: keyof typeof SHEET_SHARE): number =>
  window.innerHeight * SHEET_SHARE[height];

/** Ce dont un point cadré au centre doit monter pour tomber au milieu de ce qui reste visible. */
export const sheetLift = (height: keyof typeof SHEET_SHARE): number => sheetHeight(height) / 2;

/** Ce qu'un doigt doit parcourir pour changer de cran : en deçà, c'est un toucher qui a tremblé. */
const STEP_PX = 40;

const SheetCloseContext = createContext<(() => void) | null>(null);

/**
 * **Ce qui mène ailleurs referme la feuille** : une ligne « carte › » qui laisserait la moitié de
 * l'écran couverte n'aurait pas tenu sa promesse. `null` hors d'une feuille, au bureau.
 */
export const useSheetClose = (): (() => void) | null => useContext(SheetCloseContext);

/**
 * **La feuille basse, une seule pour tout l'écran étroit** (piste A, passe 2) : « à faire », les
 * calques, les panneaux du plateau — et au lot 3 la fiche. Elle se pose entre le bandeau et la
 * barre de pied, dont le cadre publie les bords (`--board-top`, `--board-bottom`), à trois
 * hauteurs : aperçu, moitié, plein écran. Glisser la poignée vers le bas descend d'un cran puis
 * ferme ; vers le haut, monte. « Fermer » reste toujours là, parce qu'un geste qu'on ne voit pas
 * n'est pas une sortie.
 *
 * Elle sort par un portail : ses appelants la posent parfois dans un `Draggable`, dont la
 * translation est un bloc conteneur, et un `fixed` s'y mesurerait sur la poussée au lieu de
 * l'écran. Son plan est celui du bandeau (`--z-band`) : au-dessus de ce que la carte épingle,
 * sous les fenêtres.
 */
export function BottomSheet({
  title,
  aside,
  onClose,
  initial = 'half',
  kicker = false,
  hug = false,
  children,
}: {
  title: string;
  /** Ce qui suit le titre sur sa ligne — un compte, un repère. */
  aside?: ReactNode;
  /** Sans fermeture, la feuille ne réclame pas la place : elle suit une sélection que d'autres
   *  gestes défont, et elle n'a pas de bouton à offrir. */
  onClose?: () => void;
  initial?: SheetHeight;
  /** **Le titre en surtitre** (lot mobile-3) : quand la feuille porte son propre nom en vedette —
   *  une troupe, une destination, une dépêche —, l'en-tête ne dit que *de quoi il s'agit*, en
   *  petites capitales, sans tronquer la phrase. */
  kicker?: boolean;
  /** **L'aperçu épouse ce qu'il porte**, jusqu'à la moitié de l'écran : une fiche courte ne laisse
   *  pas un blanc, une dépêche longue ne cache pas ses boutons sous la barre. Les autres crans
   *  gardent leur hauteur. */
  hug?: boolean;
  children: ReactNode;
}) {
  const [height, setHeight] = useState<SheetHeight>(initial);
  const [pull, setPull] = useState(0);
  const sheet = useRef<HTMLElement>(null);
  useSoleSurface(onClose ?? (() => {}), onClose !== undefined);

  const grip = useSwipe(
    (travel) => setPull(Math.max(0, travel)),
    (travel) => {
      setPull(0);
      const rank = SHEET_HEIGHTS.indexOf(height);
      if (travel > STEP_PX) {
        if (rank > 0) setHeight(SHEET_HEIGHTS[rank - 1]!);
        else onClose?.();
      } else if (travel < -STEP_PX && rank < SHEET_HEIGHTS.length - 1) {
        setHeight(SHEET_HEIGHTS[rank + 1]!);
      }
    },
  );

  return createPortal(
    <SheetCloseContext.Provider value={onClose ?? null}>
      <section
        ref={sheet}
        role="dialog"
        aria-label={title}
        data-height={height}
        data-hug={hug ? '' : undefined}
        className="hud board-sheet paper-grain z-[var(--z-band)] flex flex-col border-t-2 border-[var(--ink)] text-[var(--ink)]"
        style={
          pull > 0 ? { transform: `translateY(${pull / scaleOf(sheet.current)}px)` } : undefined
        }
      >
        <div {...grip} className="shrink-0 cursor-grab" style={{ touchAction: 'none' }}>
          <span aria-hidden className="mx-auto mt-[6px] block h-[3px] w-[40px] bg-(--ink)/35" />
          <div className="flex items-center gap-3 border-b border-[var(--ink)] px-4 pt-[6px] pb-[8px]">
            <h2
              className={
                kicker
                  ? 'line-clamp-2 text-[10px] leading-[1.35] font-semibold tracking-[.18em] text-[var(--ink-soft)] uppercase'
                  : 'line-clamp-2 min-w-0 font-(family-name:--font-display) text-[18px] leading-[1.05] font-extrabold tracking-[.02em] first-letter:uppercase'
              }
            >
              {title}
            </h2>
            {aside}
            <span className="flex-1" />
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] shrink-0 cursor-pointer border border-[var(--ink)] px-[12px] text-[10px] tracking-[.18em] text-[var(--ink)] uppercase"
              >
                {fr.common.close}
              </button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </section>
    </SheetCloseContext.Provider>,
    document.body,
  );
}

/**
 * **Un glisser vertical suivi à la fenêtre**, pas à la poignée : le doigt la quitte au premier
 * geste rapide. `travel` est en pixels d'écran, positif vers le bas.
 */
export function useSwipe(
  onPull: (travel: number) => void,
  onRelease: (travel: number) => void,
): { onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void } {
  return {
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      const startY = event.clientY;
      const move = (drag: PointerEvent) => onPull(drag.clientY - startY);
      const release = (end: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        onRelease(end.type === 'pointercancel' ? 0 : end.clientY - startY);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
    },
  };
}

/** `.hud` porte un `zoom` : le doigt mesure en pixels d'écran, la translation s'écrit en pixels
 *  de la surface. */
function scaleOf(element: HTMLElement | null): number {
  if (!element || element.offsetHeight === 0) return 1;
  return element.getBoundingClientRect().height / element.offsetHeight;
}
