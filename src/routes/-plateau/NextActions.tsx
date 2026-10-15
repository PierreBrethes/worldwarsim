import { useState, useSyncExternalStore } from 'react';
import { keepNextActionsFolded, readNextActionsFolded } from '@/data/settings';
import { fr } from '@/i18n/fr';
import { useSheetClose } from '@/shell/BottomSheet';
import type { LonLat } from '@/domain/geo';
import type { PlayerView } from '@/domain/player-view';
import {
  nextActionsOf,
  type NextAction,
  type NextActionSurface,
  type NextActionTarget,
} from '@/domain/next-actions';
import { SQUARE_FRAME } from '@/shell/SurfaceColumn';
import { FoundationRows, type FoundationPlacement } from './FoundationRows';

/**
 * **Le rang d'une ligne vit au-dessus de la feuille** : sur téléphone la feuille « à faire » se
 * referme au clic et se démonte, et le clic suivant doit mener à l'occurrence d'après, pas
 * revenir à la première. Il est indexé par l'`id` de la ligne et se retient avec **l'identité**
 * de ses cibles — une pile part, une autre arrive, et la longueur n'a pas bougé : on repart de
 * la première.
 */
const cursors = new Map<string, { readonly signature: string; readonly next: number }>();
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

const signatureOf = (targets: ReadonlyArray<NextActionTarget>): string => JSON.stringify(targets);

const nextRankOf = (action: NextAction): number => {
  const held = cursors.get(action.id);
  return held?.signature === signatureOf(action.targets) ? held.next : 0;
};

function advance(action: NextAction): NextActionTarget {
  const rank = nextRankOf(action);
  cursors.set(action.id, {
    signature: signatureOf(action.targets),
    next: (rank + 1) % action.targets.length,
  });
  version += 1;
  listeners.forEach((listener) => listener());
  return action.targets[rank] ?? action.targets[0];
}

const useRanks = () =>
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );

/**
 * **La carte « à faire maintenant »** (décision Pierre, 30/08). Elle a remplacé le widget de
 * troupes, qui était l'inventaire de ce que la carte montre déjà ; celle-ci ne liste rien qu'on
 * possède — seulement ce qui attend, et chaque ligne mène au geste qui la lève.
 *
 * **Vide, elle n'existe pas** : c'est ce qui interdit à un joueur en ordre de payer un cadre pour
 * lire « rien à faire ». **Pleine, elle se replie sur son titre** (décision Pierre, 10/10) : au
 * bureau elle prenait l'écran, et le repli tient d'une session à l'autre, comme le bandeau.
 */
export function NextActions({
  view,
  frame = 'card',
  placements,
  armed,
  error,
  onArm,
  onGoToMap,
  onOpenSurface,
  onOpenSite,
  onOpenOutpost,
}: {
  view: PlayerView;
  /**
   * **Sous le seuil, la carte quitte la carte** (piste A, passe 2, A5) : elle devient la feuille
   * qu'ouvre l'entrée « à faire » du pied, qui porte déjà le titre et le compte. Il n'en reste que
   * les lignes, et une phrase quand rien n'attend — l'entrée, elle, reste au pied.
   */
  frame?: 'card' | 'sheet';
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
  /** Le même geste pour un point : son mât se recadre et son panneau de garnison s'ouvre, où
   *  vit la porte de l'élévation (précision du 15/09). */
  onOpenOutpost: (outpostId: string) => void;
}) {
  /** Ouvert d'entrée : la fondation est la première chose à faire d'une saison, et la replier
   *  **désarme** — une clé armée dont le corps est caché laisserait le sol allumé sur le plateau
   *  sans plus rien à l'écran pour dire pourquoi. */
  const [unfolded, setUnfolded] = useState(true);
  const [folded, setFolded] = useState(() => readNextActionsFolded(view.mode === 'blitz'));
  const closeSheet = useSheetClose();
  const actions = nextActionsOf(view);
  useRanks();

  if (actions.length === 0) {
    return frame === 'sheet' ? (
      <p className="px-4 py-[14px] text-[13px] text-[var(--ink-soft)] italic">
        {fr.nextActions.nothing}
      </p>
    ) : null;
  }

  const rows = actions.map((action) =>
    action.targets[0].kind === 'unfold' ? (
      <div key={action.id}>
        {/* At the desk the card's own fold is the only one (Pierre, 10/10): two "replier" one
            above the other fought over the same gesture. */}
        {frame === 'card' ? (
          <p className="border-b border-(color:--ink)/18 px-[13px] py-[8px] text-[13px] leading-[1.25]">
            {action.label}
          </p>
        ) : (
          <Row
            action={action}
            destination={unfolded ? fr.nextActions.fold : fr.nextActions.unfold}
            leads={false}
            onPick={() => {
              onArm(null);
              setUnfolded((previous) => !previous);
            }}
          />
        )}
        {(frame === 'card' || unfolded) && (
          <FoundationRows placements={placements} armed={armed} error={error} onArm={onArm} />
        )}
      </div>
    ) : (
      <Row
        key={action.id}
        action={action}
        destination={destinationOf(action)}
        leads
        onPick={() => {
          const target = advance(action);
          if (target.kind === 'map') onGoToMap(target.point);
          else if (target.kind === 'surface') onOpenSurface(target.surface);
          else if (target.kind === 'site') onOpenSite(target.buildingId);
          else if (target.kind === 'outpost') onOpenOutpost(target.outpostId);
          closeSheet?.();
        }}
      />
    ),
  );

  if (frame === 'sheet') return <div>{rows}</div>;

  const fold = () => {
    // Folding hides an armed key's rows: it disarms, like the foundation's own fold.
    onArm(null);
    setFolded(!folded);
    keepNextActionsFolded(!folded, view.mode === 'blitz');
  };

  /* **Au bureau, un carré d'encre en tête de la colonne** (table plein écran, 13/10) : le compte,
     et la carte qui se déplie à sa droite. Replié, il ne reste que le carré — c'est le repli du
     10/10, déplacé du titre de la carte au carré qui la porte. */
  return (
    <>
      <button
        type="button"
        aria-expanded={!folded}
        title={fr.nextActions.header}
        onClick={fold}
        className={`${SQUARE_FRAME} bg-[var(--ink)] text-[var(--paper)] ${
          folded ? '' : 'outline-2 outline-offset-[3px] outline-[var(--ink)]'
        }`}
      >
        <span className="font-(family-name:--font-display) text-[21px] leading-none font-bold">
          {actions.length}
        </span>
        <span className="text-[7.5px] leading-none font-semibold tracking-[.1em] uppercase">
          {fr.rail.todo}
        </span>
      </button>
      {!folded && (
        <section
          className="float paper-grain absolute top-0 left-full ml-[calc(var(--table-gap)/var(--hud-scale)/0.75)] max-h-full w-[300px] overflow-y-auto border border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]"
          style={{ zoom: CARD_ZOOM }}
        >
          <div className="flex items-end gap-2 border-b-2 border-[var(--ink)] px-[13px] pt-[9px] pb-2">
            <div className="grid min-w-0 flex-1 gap-[5px]">
              <span className="text-[10px] leading-none font-semibold tracking-[.14em] text-[var(--ink-soft)] uppercase">
                {fr.nextActions.count(actions.length)}
              </span>
              <h2 className="font-(family-name:--font-display) text-[18px] leading-[1.05] font-bold">
                {fr.nextActions.header}
              </h2>
            </div>
            <button
              type="button"
              aria-expanded
              onClick={fold}
              className="cursor-pointer font-(family-name:--font-mono) text-[11px] tracking-[.12em] text-[var(--ink)] uppercase underline-offset-2 hover:underline"
            >
              {fr.nextActions.fold}
            </button>
          </div>
          {rows}
        </section>
      )}
    </>
  );
}

/** Three quarters of the HUD's scale on the desk (Pierre, 10/10): full size covered the board,
 *  half was too small to read. The column already carries the HUD's zoom. */
const CARD_ZOOM = 0.75;

const SURFACE_WORD: Readonly<Record<NextActionSurface, string>> = {
  economy: fr.nextActions.toEconomy,
};

/** Plusieurs occurrences : le mot dit laquelle le clic va ouvrir, « carte 1 / 6 ». */
const destinationOf = (action: NextAction): string =>
  action.targets.length === 1
    ? destinationWord(action.targets[0])
    : fr.nextActions.rank(
        destinationWord(action.targets[0]),
        nextRankOf(action) + 1,
        action.targets.length,
      );

/** Où la ligne mène, dit à droite et en petit : le joueur choisit de cliquer en sachant s'il
 *  quitte la carte des yeux. La fondation n'y passe jamais — elle se déplie sur place. */
const destinationWord = (target: NextActionTarget): string =>
  target.kind === 'map'
    ? fr.nextActions.toMap
    : target.kind === 'surface'
      ? SURFACE_WORD[target.surface]
      : target.kind === 'site'
        ? fr.nextActions.toSite
        : target.kind === 'outpost'
          ? fr.nextActions.toOutpost
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
      className="flex w-full cursor-pointer items-baseline gap-2 border-b border-(color:--ink)/18 px-[13px] py-[8px] text-left last:border-b-0 hover:bg-(--ink)/7"
    >
      <span
        className={`min-w-0 flex-1 text-[13px] leading-[1.25] ${
          action.kind === 'siteUnderCapture' ? 'text-[var(--critical)]' : 'text-[var(--ink)]'
        }`}
      >
        {action.label}
      </span>
      <span className="shrink-0 text-[10px] tracking-[.12em] text-[var(--ink-soft)] uppercase">
        {leads ? `${destination} ›` : destination}
      </span>
    </button>
  );
}
