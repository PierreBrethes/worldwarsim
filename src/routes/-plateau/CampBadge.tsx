import { fr } from '@/i18n/fr';
import { asDuration, asLocalTime } from '@/domain/duration';
import type { CampView } from '@/domain/player-view';
import { Glyph } from '@/shell/Glyph';
import { silhouettePaths } from '@/map/engine/silhouettes';
import { MapCard } from './MapCard';

/**
 * **La popin lit, la carte agit** (décision Pierre, 30/08), et ce cartouche-ci lit moins que
 * tous : un camp relevé n'a **structurellement** ni composition, ni effectif, ni nation (ADR 0024
 * §1, `CampView`). Ce qu'il dit est ce qu'un guetteur peut honnêtement rapporter — un milieu, une
 * heure, et ce qui de nous l'a pris — plus la phrase qui dit ce qu'on ne sait pas, une fois, pour
 * qu'un silence ne se lise pas comme un chargement.
 *
 * Il ne porte aucun ordre : l'attaque se donne au clic droit sur le même mât, comme partout
 * ailleurs sur la carte.
 */
export function CampBadge({
  camp,
  at,
  onOpenGunnery,
  onClose,
}: {
  camp: CampView;
  at: { x: number; y: number };
  /** Un relevé ne dit rien de la pièce : le type, s'il est percé un jour, se lit à l'abaque. */
  onOpenGunnery: () => void;
  onClose: () => void;
}) {
  return (
    <MapCard
      kicker={fr.camps.badgeKicker}
      at={at}
      gap={{ x: ANCHOR_GAP, y: 14 }}
      width={228}
      onClose={onClose}
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
        {camp.seenMinutesAgo === null
          ? fr.camps.since(asLocalTime(camp.since))
          : fr.camps.lastKnown(asDuration(camp.seenMinutesAgo))}
      </p>

      <p className="mt-[5px] text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">
        {camp.detector === 'station' && camp.detectorRegion !== null
          ? fr.camps.byStation(camp.detectorRegion)
          : fr.camps.by(fr.detectors[camp.detector])}
      </p>

      <p className="mt-[6px] text-[10.5px] leading-[1.4] text-[var(--ink-quiet)]">
        {fr.camps.unknown}
      </p>

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
