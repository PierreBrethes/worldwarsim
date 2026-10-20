import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import type { PlayerView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';
import { FundsCell } from './Reglette';
import { useClock } from './clock';

/**
 * **La barre basse du téléphone est une seule feuille** (#179) : en Mondiale c'est le plateau
 * personnel lui-même — replié, la ligne des réserves ; tiré, le plateau —, et la clé des surfaces
 * est sa dernière case. `Shell` donne cette clé au plateau (`key`) et mesure la barre qu'il lui
 * dit (`claim`) : les feuilles et les indicateurs de la carte se posent au-dessus d'elle.
 * En Blitz, qui n'a pas de plateau, la barre est `FootBar` : les fonds et la clé.
 */
export type Foot = {
  readonly key: ReactNode;
  readonly claim: (node: HTMLElement | null) => void;
};

export const FootContext = createContext<Foot | null>(null);

/** La barre, sous le seuil seulement : `null` au bureau et dans un test sans coque. */
export const useFoot = (): Foot | null => useContext(FootContext);

/** Dit à la coque quel élément est la barre, tant qu'il est monté. */
export function useClaimFoot(foot: Foot | null, node: RefObject<HTMLElement | null>): void {
  const claim = foot?.claim;
  useEffect(() => {
    if (claim === undefined) return;
    claim(node.current);
    return () => claim(null);
  }, [claim, node]);
}

/** La hauteur d'une ligne de la barre, en pixels d'écran (`--foot-bar`, `tokens.css`), écrite à
 *  l'échelle de la surface `.hud` qui la porte. */
export const FOOT_ROW = 'calc(var(--foot-bar) / var(--hud-scale))';

/** **La barre de la Blitz** : les fonds au lieu des réserves, la clé à droite. */
export function FootBar({ view, foot }: { view: PlayerView; foot: Foot }) {
  const now = useClock();
  const bar = useRef<HTMLElement>(null);
  useClaimFoot(foot, bar);
  const funds = view.me.funds;
  return (
    <section
      ref={bar}
      aria-label={fr.footBar.label}
      className="hud paper-grain float absolute right-0 left-0 z-[var(--z-band)] flex items-stretch border-t border-[var(--ink)] text-[var(--ink)]"
      style={{ bottom: 'calc(var(--safe-bottom) / var(--hud-scale))', height: FOOT_ROW }}
    >
      <div className="flex min-w-0 flex-1 items-center px-[12px]">
        {funds !== null && <FundsCell funds={funds} loadedAt={view.loadedAt} now={now} stacked />}
      </div>
      {foot.key}
    </section>
  );
}
