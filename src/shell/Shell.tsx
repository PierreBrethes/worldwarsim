import type { ReactNode } from 'react';
import type { PlayerView } from '@/domain/player-view';
import { NationBanner } from './NationBanner';
import { ResourceBand } from './ResourceBand';
import { SurfaceRail } from './SurfaceRail';
import { useNarrowScreen } from './viewport';

export function Shell({
  view,
  telegraphUnread,
  children,
}: {
  view: PlayerView;
  telegraphUnread: number;
  children: ReactNode;
}) {
  /** **Le rail passe au pied de l'écran sous le seuil**, et l'ordre du document ne bouge pas :
   *  `flex-col-reverse` le pose en bas sans le déplacer dans la page, donc la tabulation continue
   *  de rencontrer la navigation avant la carte. */
  const narrow = useNarrowScreen();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <NationBanner view={view} />
      <ResourceBand view={view} />
      <div className={`flex min-h-0 flex-1 ${narrow ? 'flex-col-reverse' : ''}`}>
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
