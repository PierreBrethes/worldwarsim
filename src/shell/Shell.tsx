import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { PlayerView } from '@/domain/player-view';
import { NarrowBand } from './NarrowBand';
import { Protractor } from './Protractor';
import { Reglette } from './Reglette';
import { SoleSurfaceProvider } from './sole-surface';
import { SurfaceColumn } from './SurfaceColumn';
import { BoardInsetsContext, useNarrowScreen, type BoardInsets } from './viewport';

export function Shell({
  view,
  telegraphUnread,
  todo,
  onShowBriefing,
  children,
}: {
  view: PlayerView;
  telegraphUnread: number;
  /** « À faire maintenant », que le plateau seul sait mener : au bureau le carré d'encre en tête
   *  de la colonne et sa carte, sous le seuil les lignes de la feuille du pied. */
  todo: ReactNode;
  /** L'aide-mémoire, que le dossier de la nation rouvre sous le seuil. */
  onShowBriefing: () => void;
  children: ReactNode;
}) {
  /** **La table plein écran** (décision de Pierre, 13/10) : la carte prend tout l'écran, et la
   *  réglette et la colonne se posent dessus, sans cadre noir. Sous le seuil, la réglette sur
   *  deux lignes et le rapporteur dans le coin, qui remplace la barre de pied. */
  const narrow = useNarrowScreen();
  const board = useRef<HTMLElement>(null);
  const top = useRef<HTMLElement>(null);
  const side = useRef<HTMLElement>(null);
  const insets = usePublishedEdges(board, top, side, narrow);
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
          {/* `clip` et non `hidden` : les arcs du rapporteur sont des cercles entiers centrés sur le
              coin, et un cadre `hidden` reste un défileur qu'un focus peut faire glisser. */}
          <div className="board-frame flex h-full flex-col overflow-clip">
            <main ref={board} className="relative flex min-h-0 min-w-0 flex-1">
              {children}
              <NarrowBand view={view} onShowBriefing={onShowBriefing} ref={top} />
              <Protractor view={view} telegraphUnread={telegraphUnread} todo={todo} />
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
          {children}
          <Reglette view={view} ref={top} />
          <SurfaceColumn view={view} telegraphUnread={telegraphUnread} todo={todo} ref={side} />
        </main>
      </div>
    </BoardInsetsContext.Provider>
  );
}

/**
 * **Les bords du plateau, publiés deux fois.** En pixels d'écran pour ce qui se pose en `fixed`
 * (`--board-top`, `--board-bottom`, `--board-left`) : feuilles et fenêtres se posent sous la
 * réglette et à droite de la colonne sans connaître leur taille, et au téléphone au-dessus de la barre d'accueil, que plus aucune barre de pied
 * n'absorbe. Et depuis le bord de la carte pour ce qu'elle range au bord (`BoardInsets`) : la
 * réglette, la colonne et le coin du rapporteur couvrent la carte, ils ne la poussent plus.
 * Mesurés et non calculés, parce que l'échelle d'interface, l'encoche et la barre d'accueil s'y
 * ajoutent chacune de son côté.
 */
function usePublishedEdges(
  board: RefObject<HTMLElement | null>,
  top: RefObject<HTMLElement | null>,
  side: RefObject<HTMLElement | null>,
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
      root.setProperty('--board-bottom', narrow ? 'var(--safe-bottom)' : '0px');
      root.setProperty('--board-left', `${Math.round(column?.right ?? 0)}px`);
      const corner = board.current?.querySelector('.protractor-hub')?.getBoundingClientRect();
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
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publish);
      root.removeProperty('--board-top');
      root.removeProperty('--board-bottom');
      root.removeProperty('--board-left');
    };
  }, [board, top, side, narrow]);
  return insets;
}
