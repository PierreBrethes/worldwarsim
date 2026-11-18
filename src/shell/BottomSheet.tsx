import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { fr } from '@/i18n/fr';
import { motionNow, useLeaveGhost } from './paper-motion';
import { isSettled, stepSpring, type Spring } from './sheet-spring';
import { useSoleSurface } from './sole-surface';

const SHEET_HEIGHTS = ['peek', 'half', 'full'] as const;

export type SheetHeight = (typeof SHEET_HEIGHTS)[number];

/** **Le cran de la feuille qui porte une sélection** (décision 3a du 05/10) : sous l'aperçu, la
 *  poignée et l'en-tête seuls — on dégage la carte sans perdre ce qu'on a désigné. */
const KEEPING_HEIGHTS = ['collapsed', ...SHEET_HEIGHTS] as const;

type KeepingHeight = (typeof KEEPING_HEIGHTS)[number];

/**
 * **La part d'écran de chaque cran** — les mêmes fractions que `.board-sheet` (`index.css`), lues
 * par ce qui doit garder un point visible au-dessus d'une feuille : la carte qui remonte, la rose
 * qui se recale. `full` est un plafond : la feuille haute laisse ~20 % de carte, jamais plus que
 * ce que `--board-room` ouvre (`@a-mesurer`, d'après la capture 390×844 du finaliste).
 */
const SHEET_SHARE = { peek: 0.3, half: 0.5, full: 0.8 } as const;

/** La hauteur d'une feuille à ce cran, en pixels d'écran. */
export const sheetHeight = (height: keyof typeof SHEET_SHARE): number => {
  const share = window.innerHeight * SHEET_SHARE[height];
  if (height !== 'full') return share;
  const edges = ['--board-top', '--board-bottom'].map(
    (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0,
  );
  return Math.min(share, window.innerHeight - edges[0]! - edges[1]!);
};

/** Ce dont un point cadré au centre doit monter pour tomber au milieu de ce qui reste visible. */
export const sheetLift = (height: keyof typeof SHEET_SHARE): number => sheetHeight(height) / 2;

/** Ce qu'un doigt doit parcourir pour changer de cran : en deçà, c'est un toucher qui a tremblé. */
const STEP_PX = 40;

/** @a-mesurer : la part du geste qu'un lancer finirait seul — un lancer court et vif vaut un cran. */
const THROW_MS = 150;

/** La vitesse du doigt se mesure sur ses dernières millisecondes de mouvement. */
const VELOCITY_WINDOW_MS = 80;

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
  /** Pendant un glisser et son ressort, la feuille garde la hauteur du cran haut (`data-moving`) et
   *  se pose par `translateY` : ni mise en page ni recadrage de carte à chaque image. */
  const [moving, setMoving] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useLeaveGhost(sheet, 'sheet-rise', 'sheet-sink');
  /** Un glisser peut finir par un clic sur l'en-tête : sans ce témoin, ramener la feuille réduite
   *  à sa place la rouvrirait aussitôt. Remis à zéro à chaque appui, car le clic ne suit pas
   *  toujours. */
  const swiped = useRef(false);
  /** Hauteur de chaque cran en pixels d'écran, mesurée à l'appui ; `live` est la hauteur de la
   *  feuille à l'instant, pendant qu'elle bouge. */
  const measured = useRef<Partial<Record<KeepingHeight, number>>>({});
  const live = useRef<Spring | null>(null);
  const frame = useRef(0);
  const base = useRef(0);
  useSoleSurface(onClose ?? (() => {}), onClose !== undefined);
  const report = useContext(SelectionSheetReport);
  const reporting = keepsSelection ? report : null;

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /** La feuille ne dit sa hauteur qu'au repos : le ressort ne la publie pas à chaque image. */
  useLayoutEffect(() => {
    const element = sheet.current;
    if (reporting === null || element === null || moving) return;
    const publish = () => reporting(element.getBoundingClientRect().height);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => observer.disconnect();
  }, [reporting, moving]);
  useLayoutEffect(() => () => reporting?.(null), [reporting]);

  const place = (h: number) => {
    const element = sheet.current;
    const top = measured.current.full ?? 0;
    if (element === null || top === 0) return;
    const drop = (top - h) / scaleOf(element);
    element.style.transform = `translateY(${drop}px)`;
    // Pushed down at the height of the top step, the sheet would cover the bar below it.
    element.style.clipPath = `inset(0 0 ${drop}px 0)`;
  };
  useLayoutEffect(() => {
    if (moving && live.current !== null) place(live.current.h);
  });
  const stop = () => {
    cancelAnimationFrame(frame.current);
    live.current = null;
    sheet.current?.style.removeProperty('transform');
    sheet.current?.style.removeProperty('clip-path');
    setMoving(false);
  };

  const steps: ReadonlyArray<KeepingHeight> = keepsSelection ? KEEPING_HEIGHTS : SHEET_HEIGHTS;
  const grip = useSwipe(
    (travel) => {
      const top = measured.current.full ?? 0;
      live.current = { h: Math.min(top, Math.max(0, base.current - travel)), v: 0 };
      place(live.current.h);
    },
    (travel, velocity) => {
      const rank = steps.indexOf(height);
      const thrown = travel + velocity * THROW_MS;
      let target = rank;
      let closing = false;
      if (thrown > STEP_PX) {
        if (rank > 0) target = rank - 1;
        else closing = !keepsSelection;
      } else if (thrown < -STEP_PX && rank < steps.length - 1) {
        target = rank + 1;
      }
      swiped.current = Math.abs(travel) > STEP_PX;
      const goal = measured.current[steps[target]!] ?? 0;
      const from = live.current;
      const motion = motionNow();
      if (target !== rank) setHeight(steps[target]!);
      if (closing) {
        stop();
        onClose?.();
        return;
      }
      if (motion !== 'full' || from === null || goal === 0) {
        stop();
        if (motion === 'reduced' && target !== rank) {
          sheet.current?.animate?.({ opacity: [0.4, 1] }, { duration: 120 });
        }
        return;
      }
      const ceiling = measured.current.full ?? goal;
      let state: Spring = { h: from.h, v: -velocity };
      let last = performance.now();
      const tick = (now: number) => {
        state = stepSpring(state, goal, ceiling, now - last);
        last = now;
        live.current = state;
        place(state.h);
        if (isSettled(state, goal)) stop();
        else frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    },
  );
  const collapsed = height === 'collapsed';

  /** Une prise mesure les crans de ce que la feuille porte maintenant, ou reprend la feuille en
   *  vol là où elle est. */
  const take = () => {
    const element = sheet.current;
    if (element === null) return;
    if (live.current === null) {
      measured.current = measureSteps(element, body.current, steps);
      base.current = measured.current[height] ?? 0;
    } else {
      cancelAnimationFrame(frame.current);
      base.current = live.current.h;
    }
    live.current ??= { h: base.current, v: 0 };
    setMoving(true);
  };

  return createPortal(
    <SheetCloseContext.Provider value={onClose ?? null}>
      <section
        ref={sheet}
        role="dialog"
        aria-label={title}
        data-height={height}
        data-moving={moving ? '' : undefined}
        data-hug={hug ? '' : undefined}
        className="hud board-sheet paper-grain sheet-rise z-[var(--z-band)] flex flex-col border-t-2 border-[var(--ink)] text-[var(--ink)]"
      >
        <div
          onPointerDown={(event) => {
            swiped.current = false;
            take();
            grip.onPointerDown(event);
          }}
          className="min-h-[44px] shrink-0 cursor-grab"
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
                onPointerDown={(event) => event.stopPropagation()}
                className="min-h-[44px] shrink-0 cursor-pointer border border-[var(--ink)] px-[12px] text-[10px] tracking-[.18em] text-[var(--ink)] uppercase"
              >
                {fr.common.close}
              </button>
            )}
          </div>
        </div>
        {/* Caché plutôt que démonté : ce qu'il porte garde son état, et revient tel quel. */}
        <div
          ref={body}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          hidden={collapsed && !moving}
        >
          {children}
        </div>
      </section>
    </SheetCloseContext.Provider>,
    document.body,
  );
}

/**
 * **Un glisser vertical suivi à la fenêtre**, pas à la poignée : le doigt la quitte au premier
 * geste rapide. `travel` est en pixels d'écran, positif vers le bas ; `velocity` en pixels par
 * milliseconde, mesurée sur les ~80 dernières ms de mouvement.
 */
export function useSwipe(
  onPull: (travel: number) => void,
  onRelease: (travel: number, velocity: number) => void,
): { onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void } {
  return {
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      const startY = event.clientY;
      const samples = [{ t: performance.now(), y: startY }];
      if (event.pointerId !== undefined) event.currentTarget.setPointerCapture?.(event.pointerId);
      const move = (drag: PointerEvent) => {
        samples.push({ t: performance.now(), y: drag.clientY });
        onPull(drag.clientY - startY);
      };
      const release = (end: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        if (end.type === 'pointercancel') return onRelease(0, 0);
        onRelease(end.clientY - startY, velocityOf(samples));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
    },
  };
}

function velocityOf(samples: ReadonlyArray<{ t: number; y: number }>): number {
  const last = samples[samples.length - 1]!;
  let first = samples.find((sample) => sample.t >= last.t - VELOCITY_WINDOW_MS)!;
  // One sample in the window: the finger paused, or the last move came late; use the one before.
  if (first === last) first = samples[Math.max(0, samples.length - 2)]!;
  // Events a hair apart (a synthetic burst) say nothing about speed.
  return last.t - first.t >= 4 ? (last.y - first.y) / (last.t - first.t) : 0;
}

/** La hauteur en pixels d'écran de chaque cran, lue sur la feuille en le lui donnant un instant :
 *  un aperçu qui épouse son contenu et l'en-tête seul n'ont de hauteur que mesurée. */
function measureSteps(
  element: HTMLElement,
  content: HTMLElement | null,
  steps: ReadonlyArray<KeepingHeight>,
): Partial<Record<KeepingHeight, number>> {
  const { height, moving } = element.dataset;
  const hidden = content?.hidden ?? false;
  delete element.dataset.moving;
  const result: Partial<Record<KeepingHeight, number>> = {};
  for (const step of steps) {
    element.dataset.height = step;
    if (content) content.hidden = step === 'collapsed';
    result[step] = element.getBoundingClientRect().height;
  }
  element.dataset.height = height;
  if (moving !== undefined) element.dataset.moving = moving;
  if (content) content.hidden = hidden;
  return result;
}

/** `.hud` porte un `zoom` : le doigt mesure en pixels d'écran, la translation s'écrit en pixels
 *  de la surface. */
function scaleOf(element: HTMLElement | null): number {
  if (!element || element.offsetHeight === 0) return 1;
  return element.getBoundingClientRect().height / element.offsetHeight;
}
