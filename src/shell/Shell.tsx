import type { ReactNode } from 'react';
import type { PlayerView } from '@/domain/player-view';
import { NationBanner } from './NationBanner';
import { ResourceBand } from './ResourceBand';
import { SurfaceRail } from './SurfaceRail';

export function Shell({
  view,
  telegraphUnread,
  children,
}: {
  view: PlayerView;
  telegraphUnread: number;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <NationBanner view={view} />
      <ResourceBand view={view} />
      <div className="flex min-h-0 flex-1">
        <SurfaceRail
          season={view.season}
          loadedAt={view.loadedAt}
          playerInk={view.me.ink}
          telegraphUnread={telegraphUnread}
        />
        <main className="relative flex min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
