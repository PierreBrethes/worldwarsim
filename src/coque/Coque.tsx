import type { ReactNode } from 'react';
import type { VueJoueur } from '@/domaine/vue-joueur';
import { BandeauNation } from './BandeauNation';
import { RailSurfaces } from './RailSurfaces';

export function Coque({ vue, children }: { vue: VueJoueur; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <BandeauNation vue={vue} />
      <div className="flex min-h-0 flex-1">
        <RailSurfaces saison={vue.saison} chargeeA={vue.chargeeA} />
        <main className="relative flex min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
