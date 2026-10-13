import {
  createContext,
  useContext,
  useLayoutEffect,
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

/** **Le cran de la feuille qui porte une sélection** (décision 3a du 05/10) : sous l'aperçu, la
 *  poignée et l'en-tête seuls — on dégage la carte sans perdre ce qu'on a désigné. */
const KEEPING_HEIGHTS = ['collapsed', ...SHEET_HEIGHTS] as const;

type KeepingHeight = (typeof KEEPING_HEIGHTS)[number];

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
 * **Où se tient la feuille d'une sélection, mesurée** : sa hauteur en pixels d'écran à chaque cran,
 * `null` quand elle part. Ce qui garde un point visible au-dessus d'elle — la rose au doigt — suit
 * le cran courant au lieu d'une moitié figée : feuille réduite, la rose se pose plus bas.
 */
export const SelectionSheetReport = createContext<((height: number | null) => void) | null>(null);

/**
 * **Ce qui mène ailleurs referme la feuille** : une ligne « carte › » qui laisserait la moitié de
 * l'écran couverte n'aurait pas tenu sa promesse. `null` hors d'une feuille, au bureau.
 */
export const useSheetClose = (): (() => void) | null => useContext(SheetCloseContext);

/**
 * **La feuille basse, une seule pour tout l'écran étroit** (piste A, passe 2) : « à faire », les
 * calques, les panneaux du plateau — et au lot 3 la fiche. Elle se pose entre le bandeau et la
 * barre d'accueil, dont le cadre publie les bords (`--board-top`, `--board-bottom`), à trois
 * hauteurs : aperçu, moitié, plein écran. Glisser la poignée vers le bas descend d'un cran puis
 * ferme — ou réduit, pour la feuille d'une sélection (`keepsSelection`) ; vers le haut, monte. « Fermer » reste toujours là, parce qu'un geste qu'on ne voit pas
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
  keepsSelection = false,
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
  /** **La feuille porte une sélection** (décision 3a du 05/10) — une troupe, une visée, un camp :
   *  glisser vers le bas depuis l'aperçu la **réduit** à son en-tête au lieu de la fermer, et la
   *  sélection survit. Seul « fermer », ou la carte touchée ailleurs, la défait. */
  keepsSelection?: boolean;
  children: ReactNode;
}) {
  const [height, setHeight] = useState<KeepingHeight>(initial);
  const [pull, setPull] = useState(0);
  const sheet = useRef<HTMLElement>(null);
  /** Un glisser peut finir par un clic sur l'en-tête : sans ce témoin, ramener la feuille réduite
   *  à sa place la rouvrirait aussitôt. Remis à zéro à chaque appui, car le clic ne suit pas
   *  toujours. */
  const swiped = useRef(false);
  useSoleSurface(onClose ?? (() => {}), onClose !== undefined);
  const report = useContext(SelectionSheetReport);
  const reporting = keepsSelection ? report : null;

  useLayoutEffect(() => {
    const element = sheet.current;
    if (reporting === null || element === null) return;
    const publish = () => reporting(element.getBoundingClientRect().height);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      reporting(null);
    };
  }, [reporting]);

  const steps: ReadonlyArray<KeepingHeight> = keepsSelection ? KEEPING_HEIGHTS : SHEET_HEIGHTS;
  const grip = useSwipe(
    (travel) => setPull(Math.max(0, travel)),
    (travel) => {
      setPull(0);
      swiped.current = Math.abs(travel) > STEP_PX;
      const rank = steps.indexOf(height);
      if (travel > STEP_PX) {
        if (rank > 0) setHeight(steps[rank - 1]!);
        else if (!keepsSelection) onClose?.();
      } else if (travel < -STEP_PX && rank < steps.length - 1) {
        setHeight(steps[rank + 1]!);
      }
    },
  );
  const collapsed = height === 'collapsed';

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
        <div
          onPointerDown={(event) => {
            swiped.current = false;
            grip.onPointerDown(event);
          }}
          className="shrink-0 cursor-grab"
          style={{ touchAction: 'none' }}
          onClick={(event) => {
            if (!collapsed || swiped.current) return;
            if (event.target instanceof Element && event.target.closest('button') !== null) return;
            setHeight('peek');
          }}
        >
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
        {/* Caché plutôt que démonté : ce qu'il porte garde son état, et revient tel quel. */}
        <div className="min-h-0 flex-1 overflow-y-auto" hidden={collapsed}>
          {children}
        </div>
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
