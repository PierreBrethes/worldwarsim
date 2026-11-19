import { fr } from '@/i18n/fr';
import { lootWords } from '@/domain/journal';
import type { ObjectiveView } from '@/domain/player-view';
import { objectiveArchetype } from '../../../convex/constants';
import { ObjectivePlate } from '@/emblems/Plate';
import type { Offer } from '@/domain/offers';
import { useNarrowScreen } from '@/shell/viewport';
import type { SheetCycle } from '@/shell/BottomSheet';
import { MapCard } from './MapCard';
import { leadOffersOf, StrikeOrders } from './StrikeOrders';

/**
 * **La popin lit, la carte agit** (décision Pierre, 30/08). Celle-ci lit ce qui est **public** —
 * le nom de 1940, le palier en toutes lettres, ce qu'il reste au dépôt et si l'objectif est
 * épuisé — et elle s'arrête exactement là où le brouillard reprend : *la composition de la
 * garnison n'y est pas*, et la phrase le dit une fois pour qu'un silence ne se lise pas comme un
 * chargement.
 *
 * Le palier se relit de la palette (`OBJECTIVE_ARCHETYPES`), la seule table qui le porte : une
 * copie cliente aurait dit « légères » d'une garnison que le serveur pose avec un blindé.
 *
 * Au bureau elle ne porte aucun ordre : l'attaque se donne au clic droit sur le même mât. Au
 * téléphone c'est la fiche commune (#588) : « Attaquer » par pile, d'un toucher.
 */
export function ObjectiveBadge({
  objective,
  at,
  offers = [],
  onOffer,
  cycle,
  onClose,
}: {
  objective: ObjectiveView;
  at: { x: number; y: number };
  /** Une offre par pile du joueur (`offersOf`), au téléphone : « Attaquer » part d'un toucher. */
  offers?: ReadonlyArray<Offer>;
  onOffer?: (offer: Offer) => void;
  /** ‹ › de la fiche au téléphone : l'objet voisin de sa famille (#593). */
  cycle?: SheetCycle | undefined;
  onClose: () => void;
}) {
  const name = fr.objectives.names[objective.key] ?? objective.key;
  const tier = fr.objectives.tiers[objectiveArchetype(objective.key)?.tier ?? ''] ?? '';
  const emptied = objective.status === 'taken';
  const narrow = useNarrowScreen();
  const depot = emptied
    ? fr.objectives.emptied
    : `${fr.objectives.depot} : ${lootWords(objective.depot)}`;

  return (
    <MapCard
      kicker={fr.objectives.badgeKicker}
      at={at}
      gap={{ x: ANCHOR_GAP, y: 14 }}
      width={228}
      cycle={cycle}
      onClose={onClose}
      sheet={{
        summary: (
          <>
            <span className="block truncate font-bold">{name}</span>
            <span className="block truncate text-[var(--ink-soft)]">
              {tier} · {depot}
            </span>
          </>
        ),
        lead:
          onOffer === undefined ? undefined : (
            <div className="paper-grain px-4 pb-[8px]">
              <StrikeOrders offers={leadOffersOf(offers)} onOffer={onOffer} />
            </div>
          ),
        tabs: [{ id: 'depot', label: fr.objectives.tab }],
        tab: 'depot',
        onTab: () => {},
      }}
    >
      <div className="mt-[7px] flex items-center gap-[9px]">
        {/* La planche de l'archétype, ou le cadre pointillé qui porte son nom : jamais une
              image cassée pour un dessin qui n'existe pas encore. */}
        <ObjectivePlate objective={objective.key} label={name} height={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-[var(--ink)] max-md:font-(family-name:--font-display) max-md:text-[20px] max-md:leading-[1.15] max-md:font-extrabold">
            {name}
          </span>
          <span className="block font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
            {tier}
          </span>
        </span>
      </div>

      <p className="mt-[6px] font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
        {depot}
      </p>

      <p className="mt-[6px] text-[10.5px] leading-[1.4] text-[var(--ink-quiet)]">
        {fr.objectives.unknownGarrison}
      </p>

      {narrow && onOffer !== undefined && !emptied && (
        <StrikeOrders offers={offers} onOffer={onOffer} />
      )}
    </MapCard>
  );
}

/** La même que celle du cartouche de camp : la rose s'ancre au même point que la popin. */
const ANCHOR_GAP = 64;
