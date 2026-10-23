import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { ResourceKey } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { ConsumptionTickets, MAX_TICKETS, pinToggled } from './ConsumptionTickets';
import { FootBar, FootContext, type Foot } from './foot';
import { NarrowBand } from './NarrowBand';
import { PinContext } from './ReserveCell';
import { SurfaceKey } from './SurfaceKey';
import { Reglette } from './Reglette';
import { SoleSurfaceProvider } from './sole-surface';
import { SurfaceColumn } from './SurfaceColumn';
import { BoardInsetsContext, useNarrowScreen, type BoardInsets } from './viewport';

export function Shell({
  view,
  telegraphUnread,
  todo,
  onShowBriefing,
  onResumeSteps = null,
  sweep = null,
  children,
}: {
  view: PlayerView;
  telegraphUnread: number;
  /** « À faire maintenant », que le plateau seul sait mener : au bureau le carré d'encre en tête
   *  de la colonne et sa carte, sous le seuil les lignes de la feuille du pied. */
  todo: ReactNode;
  /** L'aide-mémoire, que le dossier de la nation rouvre sous le seuil. */
  onShowBriefing: () => void;
  /** Reprendre les premiers pas repliés ou passés, depuis le dossier du téléphone. */
  onResumeSteps?: (() => void) | null;
  /** Le bouton de la sonde, posé dans la réglette au bureau (#249) ; au téléphone, le plateau le
   *  tient sous le pouce. */
  sweep?: ReactNode;
  children: ReactNode;
}) {
  /** **La table plein écran** (décision de Pierre, 13/10) : la carte prend tout l'écran, et la
   *  réglette et la colonne se posent dessus, sans cadre noir. Sous le seuil, l'en-tête sur une
   *  ligne et la barre basse, dont la clé ouvre les surfaces (#179). */
  const narrow = useNarrowScreen();
  const board = useRef<HTMLElement>(null);
  const top = useRef<HTMLElement>(null);
  const side = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<HTMLElement | null>(null);
  const insets = usePublishedEdges(board, top, side, bar, narrow);
  /** **Les registres épinglés**, du plus ancien au plus récent (#121) : un clic sur une réserve du
   *  bandeau en pose ou en décroche le ticket ; au-delà de trois, le plus ancien part. */
  const [pinned, setPinned] = useState<ReadonlyArray<ResourceKey>>([]);
  const togglePin = (resource: ResourceKey) =>
    setPinned((held) => pinToggled(held, resource, narrow ? 1 : MAX_TICKETS));
  const tickets = (
    <ConsumptionTickets view={view} pinned={pinned} narrow={narrow} onUnpin={togglePin} />
  );
  const foot: Foot = {
    key: <SurfaceKey view={view} telegraphUnread={telegraphUnread} todo={todo} />,
    claim: setBar,
  };
  /** **Le pincement est à la carte tant que le plateau est monté** (`.on-board`, `index.css`) : sur
   *  la racine du document et non sur ce cadre, parce que fenêtres et docks sont des portails. */
  useEffect(() => {
    document.documentElement.classList.add('on-board');
    return () => document.documentElement.classList.remove('on-board');
  }, []);

  if (narrow) {
    return (
      <SoleSurfaceProvider>
        <BoardInsetsContext.Provider value={insets}>
          {/* `clip` et non `hidden` : un cadre `hidden` reste un défileur qu'un focus peut faire
              glisser. */}
          <div className="board-frame flex h-full flex-col overflow-clip">
            <main ref={board} className="relative flex min-h-0 min-w-0 flex-1">
              <PinContext.Provider value={{ pinned, onPin: togglePin }}>
                <FootContext.Provider value={foot}>
                  {children}
                  <NarrowBand
                    view={view}
                    onShowBriefing={onShowBriefing}
                    onResumeSteps={onResumeSteps}
                    ref={top}
                  />
                  {tickets}
                  {/* La Mondiale n'a pas ici de barre : c'est le plateau personnel, qui reçoit la
                      clé par `FootContext`. La Blitz, sans plateau, a la sienne. */}
                  {view.mode === 'blitz' && <FootBar view={view} />}
                </FootContext.Provider>
              </PinContext.Provider>
            </main>
          </div>
        </BoardInsetsContext.Provider>
      </SoleSurfaceProvider>
    );
  }

  return (
    <BoardInsetsContext.Provider value={insets}>
      <div className="board-frame flex h-full overflow-hidden">
        <main ref={board} className="relative flex min-h-0 min-w-0 flex-1">
          <PinContext.Provider value={{ pinned, onPin: togglePin }}>
            {children}
            <Reglette view={view} telegraphUnread={telegraphUnread} sweep={sweep} ref={top} />
            {tickets}
            <SurfaceColumn todo={todo} ref={side} />
          </PinContext.Provider>
        </main>
      </div>
    </BoardInsetsContext.Provider>
  );
}

/**
 * **Les bords du plateau, publiés deux fois.** En pixels d'écran pour ce qui se pose en `fixed`
 * (`--board-top`, `--board-bottom`, `--board-left`) : feuilles et fenêtres se posent sous la
 * réglette et à droite de la colonne sans connaître leur taille, et au téléphone au-dessus de la
 * barre basse repliée (`--foot-bar`) et de la barre d'accueil. Et depuis le bord de la carte pour
 * ce qu'elle range au bord (`BoardInsets`) : la réglette, la colonne et la barre basse — telle
 * qu'elle est, repliée ou tirée — couvrent la carte, ils ne la poussent plus.
 * Mesurés et non calculés, parce que l'échelle d'interface, l'encoche et la barre d'accueil s'y
 * ajoutent chacune de son côté.
 */
function usePublishedEdges(
  board: RefObject<HTMLElement | null>,
  top: RefObject<HTMLElement | null>,
  side: RefObject<HTMLElement | null>,
  foot: HTMLElement | null,
  narrow: boolean,
): BoardInsets {
  const [insets, setInsets] = useState<BoardInsets>({ top: 0, right: 0, bottom: 0, left: 0 });
  useEffect(() => {
    const root = document.documentElement.style;
    const publish = () => {
      const map = board.current?.getBoundingClientRect();
      const band = top.current?.getBoundingClientRect();
      const column = side.current?.getBoundingClientRect();
      root.setProperty('--board-top', `${Math.round(band?.bottom ?? 0)}px`);
      root.setProperty(
        '--board-bottom',
        narrow ? 'calc(var(--safe-bottom) + var(--foot-bar))' : '0px',
      );
      root.setProperty('--board-left', `${Math.round(column?.right ?? 0)}px`);
      const corner = foot?.getBoundingClientRect();
      const left = Math.round(
        column === undefined || map === undefined ? 0 : column.right - map.left,
      );
      // The map's buttons stand in the right corner with the column's square and margin: the
      // same width, measured once.
      const next = {
        top: Math.round(band === undefined || map === undefined ? 0 : band.bottom - map.top),
        right: left,
        bottom: Math.round(corner === undefined || map === undefined ? 0 : map.bottom - corner.top),
        left,
      };
      setInsets((held) =>
        held.top === next.top &&
        held.right === next.right &&
        held.bottom === next.bottom &&
        held.left === next.left
          ? held
          : next,
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    for (const ref of [board, top, side]) if (ref.current) observer.observe(ref.current);
    if (foot) observer.observe(foot);
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publish);
      root.removeProperty('--board-top');
      root.removeProperty('--board-bottom');
      root.removeProperty('--board-left');
    };
  }, [board, top, side, foot, narrow]);
  return insets;
}
