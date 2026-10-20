import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';
import { FundsCell } from './Reglette';
import { ReserveCell } from './ReserveCell';
import { useClock } from './clock';

/**
 * **La barre basse du téléphone est une seule feuille** (#179) : en Mondiale c'est le plateau
 * personnel lui-même — replié, la ligne des réserves ; tiré, le plateau —, et la clé des surfaces
 * est sa dernière case. `Shell` donne cette clé au plateau (`key`) et mesure la barre qu'il lui
 * dit (`claim`) : les feuilles et les indicateurs de la carte se posent au-dessus d'elle.
 * Sans plateau — la Blitz, un rejeu, le chargement —, la barre est `FootBar`.
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

/**
 * **La barre quand le plateau personnel n'est pas là** : en Blitz, qui n'en a pas, les fonds ; en
 * Mondiale pendant un rejeu ou le temps que le plateau se charge, la ligne des réserves — l'alerte
 * « à sec » et la clé ne disparaissent jamais. Sous le seuil (la coque donne sa clé) elle est la
 * barre basse ; au bureau, la ligne repliée du plateau, sans ses poignées.
 */
export function FootBar({ view }: { view: PlayerView }) {
  const foot = useFoot();
  const now = useClock();
  const bar = useRef<HTMLElement>(null);
  useClaimFoot(foot, bar);
  const funds = view.me.funds;
  const cells =
    funds !== null ? (
      <div className="flex min-w-0 flex-1 items-center px-[12px]">
        <FundsCell funds={funds} loadedAt={view.loadedAt} now={now} stacked />
      </div>
    ) : (
      <div className="flex h-full min-w-0 flex-1">
        {RESOURCES.map((resource) => (
          <ReserveCell key={resource} resource={resource} view={view} now={now} />
        ))}
      </div>
    );
  return (
    <section
      ref={bar}
      aria-label={fr.footBar.label}
      className="hud paper-grain float fixed z-[var(--z-band)] flex items-stretch border border-[var(--ink)] text-[var(--ink)]"
      style={
        foot === null
          ? {
              left: 'calc((var(--board-left) + var(--table-gap)) / var(--hud-scale))',
              right: 'calc((var(--board-left) + var(--table-gap)) / var(--hud-scale))',
              bottom: 'calc(var(--table-margin) / var(--hud-scale))',
              height: '54px',
            }
          : {
              left: 0,
              right: 0,
              bottom: 'calc(var(--safe-bottom) / var(--hud-scale))',
              height: FOOT_ROW,
              borderWidth: '1px 0 0',
            }
      }
    >
      {cells}
      {foot?.key}
    </section>
  );
}
