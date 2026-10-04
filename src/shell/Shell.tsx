import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { PlayerView } from '@/domain/player-view';
import { FootBar } from './FootBar';
import { NationBanner } from './NationBanner';
import { NarrowBand, ResourceBand } from './ResourceBand';
import { SoleSurfaceProvider } from './sole-surface';
import { SurfaceRail } from './SurfaceRail';
import { useNarrowScreen } from './viewport';

export function Shell({
  view,
  telegraphUnread,
  todo,
  children,
}: {
  view: PlayerView;
  telegraphUnread: number;
  /** Les lignes « à faire maintenant » que la feuille du pied porte sous le seuil : le plateau
   *  seul sait où mène chacune. */
  todo: ReactNode;
  children: ReactNode;
}) {
  /** **Sous le seuil, le pied de page** (piste A, passe 2) : un bandeau repliable en tête, la
   *  carte, et une barre de cinq entrées au pied, qui remplace le rail. Au-dessus, rien ne
   *  change. */
  const narrow = useNarrowScreen();
  const top = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLElement>(null);
  usePublishedEdges(top, foot, narrow);
  /** **Le pincement est à la carte tant que le plateau est monté** (`.on-board`, `index.css`) : sur
   *  la racine du document et non sur ce cadre, parce que fenêtres et docks sont des portails. */
  useEffect(() => {
    document.documentElement.classList.add('on-board');
    return () => document.documentElement.classList.remove('on-board');
  }, []);

  if (narrow) {
    return (
      <SoleSurfaceProvider>
        <div className="board-frame flex h-full flex-col overflow-hidden">
          <NarrowBand view={view} ref={top} />
          <main className="relative flex min-h-0 min-w-0 flex-1">{children}</main>
          <FootBar view={view} telegraphUnread={telegraphUnread} todo={todo} ref={foot} />
        </div>
      </SoleSurfaceProvider>
    );
  }

  return (
    <div className="board-frame flex h-full flex-col overflow-hidden">
      <NationBanner view={view} />
      <ResourceBand view={view} />
      <div className="flex min-h-0 flex-1">
        <SurfaceRail
          season={view.season}
          loadedAt={view.loadedAt}
          playerInk={view.me.ink}
          telegraphUnread={telegraphUnread}
        />
        <main className="relative flex min-h-0 min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

/**
 * **Les deux bords du plateau, publiés en pixels d'écran** (`--board-top`, `--board-bottom`) :
 * feuilles et fenêtres se posent entre eux sans connaître la hauteur du bandeau — qui se replie —
 * ni celle du pied — qui gagne un étage. Mesurés et non calculés, parce que l'échelle d'interface,
 * l'encoche et la barre d'accueil s'y ajoutent chacune de son côté.
 */
function usePublishedEdges(
  top: RefObject<HTMLElement | null>,
  foot: RefObject<HTMLElement | null>,
  narrow: boolean,
): void {
  useEffect(() => {
    const root = document.documentElement.style;
    if (!narrow) return;
    const publish = () => {
      const band = top.current?.getBoundingClientRect();
      const bar = foot.current?.getBoundingClientRect();
      root.setProperty('--board-top', `${Math.round(band?.bottom ?? 0)}px`);
      root.setProperty(
        '--board-bottom',
        `${Math.round(bar === undefined ? 0 : window.innerHeight - bar.top)}px`,
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    if (top.current) observer.observe(top.current);
    if (foot.current) observer.observe(foot.current);
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publish);
      root.removeProperty('--board-top');
      root.removeProperty('--board-bottom');
    };
  }, [top, foot, narrow]);
}
