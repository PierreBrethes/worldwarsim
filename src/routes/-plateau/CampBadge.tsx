import { fr } from '@/i18n/fr';
import { asDuration, asLocalTime } from '@/domain/duration';
import type { CampView } from '@/domain/player-view';
import { Glyph } from '@/shell/Glyph';
import { silhouettePaths } from '@/map/engine/silhouettes';
import { Draggable, DragHandle } from './Draggable';

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
  onClose,
}: {
  camp: CampView;
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;

  return (
    <Draggable
      className="absolute z-[var(--z-popin)]"
      style={{
        left: fromRight ? undefined : at.x + ANCHOR_GAP,
        right: fromRight ? `calc(100% - ${at.x - ANCHOR_GAP}px)` : undefined,
        top: fromBottom ? undefined : at.y + 14,
        bottom: fromBottom ? `calc(100% - ${at.y - 14}px)` : undefined,
      }}
    >
      <div className="hud paper-grain w-[228px] border border-[var(--ink)] bg-[var(--paper)] px-[10px] py-[8px]">
        <DragHandle className="flex items-baseline gap-2">
          <span className="text-[9px] tracking-[.18em] text-[var(--ink-soft)] uppercase">
            {fr.camps.badgeKicker}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto cursor-pointer border border-[var(--ink)] px-[6px] py-[1px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

        <div className="mt-[7px] flex items-center gap-[9px] text-[var(--ink-soft)]">
          {/* La silhouette de domaine, la même qu'un arc adverse : tout le portrait qu'un relevé
              accorde, et jamais une planche nationale. */}
          <Glyph size={30}>
            {silhouettePaths(camp.medium).map((path) => (
              <path key={path} d={path} fill="currentColor" stroke="none" />
            ))}
          </Glyph>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold text-[var(--ink)]">
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
      </div>
    </Draggable>
  );
}

/** La même que celle du cartouche de troupe : la rose s'ancre au même point que la popin. */
const ANCHOR_GAP = 64;
