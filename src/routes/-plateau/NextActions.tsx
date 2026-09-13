import { useState } from 'react';
import { fr } from '@/i18n/fr';
import type { LonLat } from '@/domain/geo';
import type { PlayerView } from '@/domain/player-view';
import {
  nextActionsOf,
  type NextAction,
  type NextActionSurface,
  type NextActionTarget,
} from '@/domain/next-actions';
import { FoundationRows, type FoundationPlacement } from './FoundationRows';

/**
 * **La carte « à faire maintenant »** (décision Pierre, 30/08). Elle a remplacé le widget de
 * troupes, qui était l'inventaire de ce que la carte montre déjà ; celle-ci ne liste rien qu'on
 * possède — seulement ce qui attend, et chaque ligne mène au geste qui la lève.
 *
 * **Vide, elle n'existe pas.** Il n'y a pas d'état replié : son absence *est* l'état replié, et
 * c'est ce qui interdit à un joueur en ordre de payer un cadre pour lire « rien à faire ». Le
 * seul dépli est celui de la fondation, parce que son geste se fait dans la ligne.
 */
export function NextActions({
  view,
  placements,
  armed,
  error,
  onArm,
  onGoToMap,
  onOpenSurface,
  onOpenSite,
}: {
  view: PlayerView;
  placements: ReadonlyArray<FoundationPlacement>;
  /** L'identité de la dette armée (`debtKey`), jamais son gisement seul : le quartier
   *  général n'en a pas, et deux mines dues ne se distinguent que par le leur. */
  armed: string | null;
  error: string | null;
  onArm: (debt: string | null) => void;
  onGoToMap: (point: LonLat) => void;
  onOpenSurface: (surface: NextActionSurface) => void;
  /** Recentrer **et** ouvrir : une caserne au repos se lève sur la carte, pas dans un onglet. */
  onOpenSite: (buildingId: string) => void;
}) {
  /** Ouvert d'entrée : la fondation est la première chose à faire d'une saison, et la replier
   *  **désarme** — une clé armée dont le corps est caché laisserait le sol allumé sur le plateau
   *  sans plus rien à l'écran pour dire pourquoi. */
  const [unfolded, setUnfolded] = useState(true);
  const actions = nextActionsOf(view);
  if (actions.length === 0) return null;

  return (
    <section className="hud paper-grain w-[300px] border border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]">
      <div className="flex items-baseline gap-2 border-b-2 border-[var(--ink)] px-[13px] pt-[9px] pb-2">
        <h2 className="font-(family-name:--font-display) text-[15px] leading-none font-extrabold tracking-[.06em] uppercase">
          {fr.nextActions.header}
        </h2>
        <span className="h-px flex-1 bg-[rgba(42,33,24,.25)]" />
        <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
          {fr.nextActions.count(actions.length)}
        </span>
      </div>

      {actions.map((action) =>
        action.target.kind === 'unfold' ? (
          <div key={action.id}>
            <Row
              action={action}
              destination={unfolded ? fr.nextActions.fold : fr.nextActions.unfold}
              leads={false}
              onPick={() => {
                onArm(null);
                setUnfolded((previous) => !previous);
              }}
            />
            {unfolded && (
              <FoundationRows
                view={view}
                placements={placements}
                armed={armed}
                error={error}
                onArm={onArm}
              />
            )}
          </div>
        ) : (
          <Row
            key={action.id}
            action={action}
            destination={destinationWord(action.target)}
            leads
            onPick={() => {
              const target = action.target;
              if (target.kind === 'map') onGoToMap(target.point);
              else if (target.kind === 'surface') onOpenSurface(target.surface);
              else if (target.kind === 'site') onOpenSite(target.buildingId);
            }}
          />
        ),
      )}
    </section>
  );
}

const SURFACE_WORD: Readonly<Record<NextActionSurface, string>> = {
  economy: fr.nextActions.toEconomy,
};

/** Où la ligne mène, dit à droite et en petit : le joueur choisit de cliquer en sachant s'il
 *  quitte la carte des yeux. La fondation n'y passe jamais — elle se déplie sur place. */
const destinationWord = (target: NextActionTarget): string =>
  target.kind === 'map'
    ? fr.nextActions.toMap
    : target.kind === 'surface'
      ? SURFACE_WORD[target.surface]
      : target.kind === 'site'
        ? fr.nextActions.toSite
        : '';

/** Une ligne, une attente, une destination. Le chevron est la promesse que le clic mène quelque
 *  part — la carte ne coche rien et ne range rien, donc il n'y a rien d'autre à presser. */
function Row({
  action,
  destination,
  leads,
  onPick,
}: {
  action: NextAction;
  destination: string;
  /** Le chevron est réservé à ce qui emmène ailleurs : la fondation reste sur place, et lui en
   *  donner un promettrait un voyage qui n'a pas lieu. */
  leads: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full cursor-pointer items-baseline gap-2 border-b border-[rgba(42,33,24,.18)] px-[13px] py-[8px] text-left last:border-b-0 hover:bg-[rgba(42,33,24,.07)]"
    >
      <span className="min-w-0 flex-1 text-[12.5px] leading-[1.35] text-[var(--ink)]">
        {action.label}
      </span>
      <span className="shrink-0 text-[10px] tracking-[.12em] text-[var(--ink-soft)] uppercase">
        {leads ? `${destination} ›` : destination}
      </span>
    </button>
  );
}
