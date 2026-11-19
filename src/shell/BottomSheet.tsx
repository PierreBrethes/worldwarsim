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
import { useMapMotion } from '@/data/mapMotion';
import { fr } from '@/i18n/fr';
import { motionNow, useLeaveGhost } from './paper-motion';
import { isSettled, stepSpring, type Spring } from './sheet-spring';
import { useSoleSurface } from './sole-surface';

const SHEET_HEIGHTS = ['peek', 'half', 'full'] as const;

export type SheetHeight = (typeof SHEET_HEIGHTS)[number];

/** **Le cran de la feuille qui porte une sélection** (décision 3a du 05/10) : sous l'aperçu, la
 *  poignée et l'en-tête seuls — on dégage la carte sans perdre ce qu'on a désigné. */
const KEEPING_HEIGHTS = ['collapsed', ...SHEET_HEIGHTS] as const;

export type KeepingHeight = (typeof KEEPING_HEIGHTS)[number];

/** **Les crans de l'étage des tuiles** (#589, #590) : replié, rang, moitié, plein — les onglets
 *  se logent à la moitié et au plein. */
const STAGE_HEIGHTS = ['collapsed', 'peek', 'half', 'full'] as const;

/**
 * **La part d'écran de chaque cran** — les mêmes fractions que `.board-sheet` (`index.css`), lues
 * par ce qui doit garder un point visible au-dessus d'une feuille : la carte qui remonte, la rose
 * qui se recale. Le cran haut n'est pas une part de l'écran : c'est `FULL_SHARE_OF_ROOM` de ce que
 * laissent le bandeau et la barre (`--board-room`), pour qu'il reste une lucarne de carte — sauf
 * l'étage des tuiles (`stage`), dont le plein prend tout `--board-room`.
 */
const SHEET_SHARE = { peek: 0.3, half: 0.5 } as const;

/** @a-mesurer : la part de `--board-room` que prend le cran haut (même valeur dans `index.css`) ;
 *  à 390×844 il reste environ 20 % de l'écran en carte. */
export const FULL_SHARE_OF_ROOM = 0.75;

/** La hauteur d'une feuille à ce cran, en pixels d'écran. */
export const sheetHeight = (height: SheetHeight): number => {
  if (height !== 'full') return window.innerHeight * SHEET_SHARE[height];
  const style = getComputedStyle(document.documentElement);
  const [top, bottom] = ['--board-top', '--board-bottom'].map(
    (name) => parseFloat(style.getPropertyValue(name)) || 0,
  );
  return FULL_SHARE_OF_ROOM * (window.innerHeight - top! - bottom!);
};

/** Ce dont un point cadré au centre doit monter pour tomber au milieu de ce qui reste visible. */
export const sheetLift = (height: SheetHeight): number => sheetHeight(height) / 2;

/** Ce qu'un doigt doit parcourir pour changer de cran : en deçà, c'est un toucher qui a tremblé. */
const STEP_PX = 40;

/** @a-mesurer : la part du geste qu'un lancer finirait seul — un lancer court et vif vaut un cran. */
const THROW_MS = 150;

/** La vitesse du doigt se mesure sur ses dernières millisecondes de mouvement. */
const VELOCITY_WINDOW_MS = 80;

/**
 * **Passer à l'objet voisin de sa famille** (#593) : ‹ et › de l'en-tête. `at` est l'objet ouvert ;
 * son changement renouvelle le contenu en fondu de 120 ms, sauf réglage « coupées ».
 */
export type SheetCycle = {
  readonly at: string;
  readonly onPrev: () => void;
  readonly onNext: () => void;
};

/** **Le contenu d'une fiche qui change d'objet** : il se renouvelle en fondu de 120 ms, sauf réglage
 *  « coupées » (`useMapMotion`). Un composant à part : une feuille sans ‹ › ne lit pas le réglage. */
function CycleFade({ children }: { children: ReactNode }) {
  const fade = useMapMotion() === 'off' ? undefined : 'tab-fade';
  return <div className={fade}>{children}</div>;
}

const SheetCloseContext = createContext<(() => void) | null>(null);

/** **Le pied de la feuille** : ce qui s'y pose (`useSheetFoot`) reste sous le corps, qui défile
 *  dans ce qu'il laisse — rien de collé en bas ne recouvre une ligne. `undefined` hors d'une
 *  feuille ; `null` dans une feuille dont le pied n'est pas encore posé, le temps d'un premier
 *  rendu : ce qui s'y destine attend, il ne se pose pas ailleurs pour sauter ensuite. */
const SheetFootContext = createContext<HTMLElement | null | undefined>(undefined);
export const useSheetFoot = (): HTMLElement | null | undefined => useContext(SheetFootContext);

/**
 * **Où se tient la feuille d'une sélection, mesurée** : `report` dit sa hauteur en pixels d'écran
 * au repos, `null` quand elle part. Ce qui garde un point visible au-dessus d'elle — la rose au
 * doigt — suit le cran courant au lieu d'une moitié figée : feuille réduite, la rose se pose plus
 * bas.
 *
 * `onStep` dit le cran qu'un doigt vient de choisir, mesuré : peek ou half seulement, au lâcher
 * d'un glisser qui change de cran (#582). C'est le seul moment où la carte peut se recadrer sur
 * ce que la feuille cache : ni à chaque hauteur du ressort, ni au cran haut, ni réduit. On y lit
 * la cible du cran, jamais la hauteur en vol.
 */
export const SelectionSheetReport = createContext<{
  readonly report: (height: number | null) => void;
  readonly onStep?: (height: number) => void;
} | null>(null);

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
  stage = false,
  height: chosen,
  onHeight,
  ceded = false,
  sheetRef,
  crest,
  pinned,
  unfolds = false,
  cycle,
  children,
}: {
  title: string;
  /** Ce qui suit le titre sur sa ligne — un compte, un repère. */
  aside?: ReactNode;
  /** **Le seul chemin de fermeture** : le bouton, le lancer, une autre surface qui prend la place,
   *  le retour du navigateur et la carte nue l'appellent tous (#584). */
  onClose: () => void;
  initial?: KeepingHeight;
  /** **L'étage du plateau personnel** (#589) : il ne se ferme jamais — glisser vers le bas le
   *  replie sur une barre de 44 px, un toucher la rouvre —, ne réclame pas la place, ne parle pas à
   *  la sélection. Son bouton plie et déplie au lieu de fermer. */
  stage?: boolean;
  /** Le cran que l'appelant tient (étage) ; sans lui, la feuille garde le sien. */
  height?: KeepingHeight;
  /** Le cran qu'un doigt, un toucher ou le bouton vient de choisir. */
  onHeight?: (height: KeepingHeight) => void;
  /** **Cédée** : une autre surface tient la place, ou la main a quitté l'étage : il se cache sans
   *  se fermer et revient tel quel — ni état perdu, ni `sheet-sink`. */
  ceded?: boolean;
  /** L'élément de la feuille, pour qui mesure son sommet. */
  sheetRef?: (element: HTMLElement | null) => void;
  /** Ce qui se pose sur le bord haut de la feuille : la bulle d'un premier pas. */
  crest?: ReactNode;
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
  /** **Ce qui reste épinglé sous l'en-tête** quand le corps défile (#586) : l'ordre visé et ses
   *  boutons tiennent à l'aperçu. Ses boutons ne tirent pas la feuille. */
  pinned?: ReactNode;
  /** **Toucher la ligne de titre déroule** : à l'aperçu, un toucher sur l'en-tête passe au cran
   *  moitié, comme tirer vers le haut (#587). */
  unfolds?: boolean;
  /** Les voisins de l'objet ouvert dans sa famille, au téléphone ; sans lui, pas de ‹ ›. */
  cycle?: SheetCycle | undefined;
  children: ReactNode;
}) {
  const [own, setOwn] = useState<KeepingHeight>(initial);
  const height = chosen ?? own;
  const setHeight = (next: KeepingHeight) => {
    setOwn(next);
    onHeight?.(next);
  };
  /** Pendant un glisser et son ressort, la feuille garde la hauteur du cran haut (`data-moving`) et
   *  se pose par `translateY` : ni mise en page ni recadrage de carte à chaque image. */
  const [moving, setMoving] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const [foot, setFoot] = useState<HTMLDivElement | null>(null);
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
  useSoleSurface(onClose, !stage);
  useLayoutEffect(() => {
    sheetRef?.(sheet.current);
    return () => sheetRef?.(null);
  }, [sheetRef]);
  const ports = useContext(SelectionSheetReport);
  const reporting = keepsSelection && !stage ? (ports?.report ?? null) : null;
  const onStep = ports?.onStep;

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
    setMoving(false);
  };
  /** Les styles du ressort partent avec `data-moving`, dans le même rendu : sans cela, la feuille
   *  reprendrait un instant la hauteur du cran sous la translation d'avant. */
  useLayoutEffect(() => {
    if (moving) return;
    sheet.current?.style.removeProperty('transform');
    sheet.current?.style.removeProperty('clip-path');
  }, [moving]);

  const keeps = keepsSelection || stage;
  const steps: ReadonlyArray<KeepingHeight> = stage
    ? STAGE_HEIGHTS
    : keepsSelection
      ? KEEPING_HEIGHTS
      : SHEET_HEIGHTS;
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
        else closing = !keeps;
      } else if (thrown < -STEP_PX && rank < steps.length - 1) {
        target = rank + 1;
      }
      swiped.current = target !== rank || closing || Math.abs(travel) > STEP_PX;
      const goal = measured.current[steps[target]!] ?? 0;
      const from = live.current;
      const motion = motionNow();
      if (target !== rank) setHeight(steps[target]!);
      const reached = steps[target]!;
      if (
        keepsSelection &&
        !stage &&
        target !== rank &&
        (reached === 'peek' || reached === 'half') &&
        goal > 0
      )
        onStep?.(goal);
      if (closing) {
        stop();
        onClose();
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
        state = stepSpring(state, goal, ceiling, Math.round(now - last));
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
      measured.current = measureSteps(element, [body.current, pin.current], steps);
      base.current = measured.current[height] ?? 0;
    } else {
      cancelAnimationFrame(frame.current);
      base.current = live.current.h;
    }
    live.current ??= { h: base.current, v: 0 };
    setMoving(true);
  };

  return createPortal(
    <SheetCloseContext.Provider value={onClose}>
      <SheetFootContext.Provider value={foot}>
        <section
          ref={sheet}
          // L'étage des tuiles est posé là en permanence : une région, pas une boîte de dialogue.
          role={stage ? undefined : 'dialog'}
          aria-label={title}
          data-height={height}
          data-moving={moving ? '' : undefined}
          data-hug={hug ? '' : undefined}
          data-stage={stage ? '' : undefined}
          // Cachée et non retirée : sa place reste, ce qu'elle porte garde son état, et un doigt
          // qui a pris une tuile dedans la tient encore.
          style={ceded ? { visibility: 'hidden' } : undefined}
          className={`hud board-sheet paper-grain sheet-rise z-[var(--z-band)] flex flex-col border-t-2 border-[var(--ink)] text-[var(--ink)]`}
        >
          {crest}
          <div
            onPointerDown={(event) => {
              swiped.current = false;
              take();
              grip.onPointerDown(event);
            }}
            className="min-h-[44px] shrink-0 cursor-grab"
            style={{ touchAction: 'none' }}
            onClick={(event) => {
              // Le clic déplie sans recadrer la carte : seul le glisser rejoue le cadrage.
              if (swiped.current) return;
              if (event.target instanceof Element && event.target.closest('button') !== null)
                return;
              if (collapsed) setHeight('peek');
              else if (unfolds && height === 'peek') setHeight('half');
            }}
          >
            {stage ? (
              /* **Une barre de 44 px d'écran** : le titre, le chantier en cours dessous, le bouton. */
              <div
                className="relative flex items-center gap-2 border-b border-[var(--ink)] pl-4"
                style={{ height: 'calc(44px / var(--hud-scale))' }}
              >
                <span
                  aria-hidden
                  className="absolute top-0 left-1/2 block h-[3px] w-[40px] -translate-x-1/2 bg-(--ink)/35"
                />
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <h2 className="truncate font-(family-name:--font-display) text-[16px] leading-[1.25] font-extrabold tracking-[.02em]">
                    {title}
                  </h2>
                  {aside}
                </div>
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? fr.footBar.grip.open : fr.footBar.grip.fold}
                  onClick={() => setHeight(collapsed ? 'peek' : 'collapsed')}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="h-full min-h-0 min-w-[44px] shrink-0 cursor-pointer text-[14px] text-[var(--ink)]"
                >
                  {collapsed ? '▴' : '▾'}
                </button>
              </div>
            ) : (
              <>
                <span
                  aria-hidden
                  className="mx-auto mt-[6px] block h-[3px] w-[40px] bg-(--ink)/35"
                />
                <div
                  className={`flex items-center border-b border-[var(--ink)] pt-[6px] pb-[8px] ${cycle === undefined ? 'gap-3 px-4' : 'gap-2 px-3'}`}
                >
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
                  {cycle !== undefined &&
                    (
                      [
                        ['‹', fr.common.previous, cycle.onPrev],
                        ['›', fr.common.next, cycle.onNext],
                      ] as const
                    ).map(([glyph, label, go]) => (
                      <button
                        key={glyph}
                        type="button"
                        aria-label={label}
                        onClick={go}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="min-h-[44px] min-w-[40px] shrink-0 cursor-pointer text-[20px] leading-none text-[var(--ink)]"
                      >
                        {glyph}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={onClose}
                    onPointerDown={(event) => event.stopPropagation()}
                    className={`min-h-[44px] shrink-0 cursor-pointer border border-[var(--ink)] text-[10px] tracking-[.18em] text-[var(--ink)] uppercase ${cycle === undefined ? 'px-[12px]' : 'px-[8px]'}`}
                  >
                    {fr.common.close}
                  </button>
                </div>
              </>
            )}
          </div>
          {pinned !== undefined && (
            <div ref={pin} className="shrink-0" hidden={collapsed && !moving}>
              {cycle === undefined ? pinned : <CycleFade key={cycle.at}>{pinned}</CycleFade>}
            </div>
          )}
          {/* Caché plutôt que démonté : ce qu'il porte garde son état, et revient tel quel. */}
          <div
            ref={body}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            // La fin du corps ne passe pas sous la barre d'accueil.
            style={
              stage ? undefined : { paddingBottom: 'calc(var(--board-bottom) / var(--hud-scale))' }
            }
            hidden={collapsed && !moving}
          >
            {cycle === undefined ? children : <CycleFade key={cycle.at}>{children}</CycleFade>}
          </div>
          <div ref={setFoot} className="shrink-0 empty:hidden" hidden={collapsed && !moving} />
        </section>
      </SheetFootContext.Provider>
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
 *  un aperçu qui épouse son contenu et l'en-tête seul n'ont de hauteur que mesurée. `folded` est ce
 *  que le cran réduit cache : le corps et ce qui reste épinglé. */
function measureSteps(
  element: HTMLElement,
  folded: ReadonlyArray<HTMLElement | null>,
  steps: ReadonlyArray<KeepingHeight>,
): Partial<Record<KeepingHeight, number>> {
  const { height, moving } = element.dataset;
  const nodes = folded.filter((node): node is HTMLElement => node !== null);
  const hidden = nodes.map((node) => node.hidden);
  delete element.dataset.moving;
  const result: Partial<Record<KeepingHeight, number>> = {};
  for (const step of steps) {
    element.dataset.height = step;
    for (const node of nodes) node.hidden = step === 'collapsed';
    result[step] = element.getBoundingClientRect().height;
  }
  element.dataset.height = height;
  if (moving !== undefined) element.dataset.moving = moving;
  nodes.forEach((node, index) => {
    node.hidden = hidden[index]!;
  });
  return result;
}

/** `.hud` porte un `zoom` : le doigt mesure en pixels d'écran, la translation s'écrit en pixels
 *  de la surface. */
function scaleOf(element: HTMLElement | null): number {
  if (!element || element.offsetHeight === 0) return 1;
  return element.getBoundingClientRect().height / element.offsetHeight;
}
