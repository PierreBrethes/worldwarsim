import { fr } from '@/i18n/fr';
import { asDuration, asLocalTime } from '@/domain/duration';
import type { CampView } from '@/domain/player-view';
import { Glyph } from '@/shell/Glyph';
import { silhouettePaths } from '@/map/engine/silhouettes';
import { compositionText } from '@/domain/map-poster';
import type { Offer } from '@/domain/offers';
import { useNarrowScreen } from '@/shell/viewport';
import type { SheetCycle } from '@/shell/BottomSheet';
import { MapCard } from './MapCard';
import { leadOffersOf, StrikeOrders } from './StrikeOrders';

/**
 * **La popin lit, la carte agit** (décision Pierre, 30/08), et ce cartouche-ci lit moins que
 * tous : un camp relevé n'a ni effectif ni nation (ADR 0024 §1, `CampView`), et sa pile seulement
 * sous un Guet (ADR 0037 §5). Ce qu'il dit est ce qu'un guetteur peut honnêtement rapporter — un
 * milieu, une heure, et ce qui de nous l'a pris — plus la phrase qui dit ce qu'on sait ou ne sait
 * pas, une fois, pour qu'un silence ne se lise pas comme un chargement.
 *
 * Au bureau il ne porte aucun ordre : l'attaque se donne au clic droit sur le même mât, comme
 * partout ailleurs sur la carte. Au téléphone c'est la fiche commune (#588) : « Attaquer » par pile,
 * d'un toucher, le refus de chaque pile dit à sa place.
 */
export function CampBadge({
  camp,
  at,
  offers = [],
  onOffer,
  onOpenGunnery,
  cycle,
  onClose,
}: {
  camp: CampView;
  at: { x: number; y: number };
  /** Une offre par pile du joueur (`offersOf`), au téléphone : « Attaquer » part d'un toucher. */
  offers?: ReadonlyArray<Offer>;
  onOffer?: (offer: Offer) => void;
  /** Un relevé ne dit rien de la pièce : le type, s'il est percé un jour, se lit à l'abaque. */
  onOpenGunnery: () => void;
  /** ‹ › de la fiche au téléphone : l'objet voisin de sa famille (#593). */
  cycle?: SheetCycle | undefined;
  onClose: () => void;
}) {
  const narrow = useNarrowScreen();
  const since =
    camp.seenMinutesAgo === null
      ? fr.camps.since(asLocalTime(camp.since))
      : fr.camps.lastKnown(asDuration(camp.seenMinutesAgo));
  return (
    <MapCard
      kicker={fr.camps.badgeKicker}
      at={at}
      gap={{ x: ANCHOR_GAP, y: 14 }}
      width={228}
      cycle={cycle}
      onClose={onClose}
      sheet={{
        summary: (
          <>
            <span className="block truncate font-bold">{fr.camps.marker}</span>
            <span className="block truncate text-[var(--ink-soft)]">
              {fr.camps.medium[camp.medium]} · {since}
            </span>
          </>
        ),
        lead:
          onOffer === undefined ? undefined : (
            <div className="paper-grain px-4 pb-[8px]">
              <StrikeOrders offers={leadOffersOf(offers)} onOffer={onOffer} />
            </div>
          ),
        tabs: [{ id: 'camp', label: fr.camps.tab }],
        tab: 'camp',
        onTab: () => {},
      }}
    >
      <div className="mt-[7px] flex items-center gap-[9px] text-[var(--ink-soft)]">
        {/* La silhouette de domaine, la même qu'un arc adverse : tout le portrait qu'un relevé
              accorde, et jamais une planche nationale. */}
        <Glyph size={30}>
          {silhouettePaths(camp.medium).map((path) => (
            <path key={path} d={path} fill="currentColor" stroke="none" />
          ))}
        </Glyph>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-[var(--ink)] max-md:font-(family-name:--font-display) max-md:text-[20px] max-md:leading-[1.15] max-md:font-extrabold">
            {fr.camps.marker}
          </span>
          <span className="block font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
            {fr.camps.medium[camp.medium]}
          </span>
        </span>
      </div>

      <p className="mt-[6px] font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
        {since}
      </p>

      <p className="mt-[5px] text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">
        {camp.detector === 'station' && camp.detectorRegion !== null
          ? fr.camps.byStation(camp.detectorRegion)
          : fr.camps.by(fr.detectors[camp.detector])}
      </p>

      <p className="mt-[6px] text-[10.5px] leading-[1.4] text-[var(--ink-quiet)]">
        {camp.identification.pierced
          ? compositionText(camp.identification, Date.now())
          : fr.camps.unknown}
      </p>

      {narrow && onOffer !== undefined && <StrikeOrders offers={offers} onOffer={onOffer} />}

      <button
        type="button"
        onClick={onOpenGunnery}
        className="mt-[6px] cursor-pointer text-[11px] text-[var(--interaction)] underline underline-offset-2 max-md:min-h-[44px]"
      >
        {fr.stats.seeGunnery}
      </button>
    </MapCard>
  );
}

/** La même que celle du cartouche de troupe : la rose s'ancre au même point que la popin. */
const ANCHOR_GAP = 64;
