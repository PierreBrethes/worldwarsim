import { fr } from '@/i18n/fr';
import { regionType } from '@/domain/world';

/**
 * The hovered region's tooltip, stacked above the arc-states panel. The displayed type
 * comes from `regionType` — an assumed placeholder until the real terrain pass.
 */
export function RegionTooltip({ name }: { name: string }) {
  return (
    <aside className="hud paper-grain z-10 w-[210px] border border-[var(--ink)] px-3 py-2">
      <span className="eyebrow block">{fr.board.regionLabel}</span>
      <p className="mt-1 text-[13px] text-[var(--ink)]">{name}</p>
      <p className="text-[11.5px] text-[var(--ink-soft)] italic">{fr.regionTypes[regionType(name)]}</p>
    </aside>
  );
}
