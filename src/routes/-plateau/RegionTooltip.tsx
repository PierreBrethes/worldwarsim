import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';

/**
 * The hovered region's tooltip, stacked above the arc-states panel. It says what the ground
 * holds — the one thing about a region that is both true and served.
 *
 * The terrain type used to read here, out of `regionType`: a hash of the region's name, so
 * the line was an invention printed in the place of the fact. It is gone from the screen and
 * kept in the code, waiting for the real classification pass.
 *
 * A region the player does not hold carries no line at all: `me.regions` is his own ground
 * and nothing else, so absence is the fog rather than a display test (ADR 0005).
 */
export function RegionTooltip({ id, name, view }: { id: string; name: string; view: PlayerView }) {
  const region = view.me.regions.find((candidate) => candidate.id === id);

  return (
    <aside className="hud paper-grain z-10 w-[210px] border border-[var(--ink)] px-3 py-2">
      <span className="eyebrow block">{fr.board.regionLabel}</span>
      <p className="mt-1 text-[13px] text-[var(--ink)]">{name}</p>
      {region && (
        <>
          <p className="text-[11.5px] text-[var(--ink-soft)]">
            {region.deposit === null
              ? fr.board.regionNoDeposit
              : fr.board.regionDeposit(fr.deposits[region.deposit])}
          </p>
          {region.coastal && (
            <p className="text-[11px] text-[var(--ink-quiet)] italic">{fr.board.regionCoastal}</p>
          )}
        </>
      )}
    </aside>
  );
}
