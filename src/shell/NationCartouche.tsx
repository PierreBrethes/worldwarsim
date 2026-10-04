import { Link, useSearch } from '@tanstack/react-router';
import { fr, nationLabel } from '@/i18n/fr';
import { FlagWatermark } from '@/emblems/Flag';
import { withWindow, type BoardSearch } from '@/routes/-plateau/board-search';

/**
 * The flag touches the surface's edge and the text starts where the watermark dies out.
 * Its box stays at 3:2 — a flag is never distorted — so its width derives from the height,
 * and the text indent with it: nothing to retune by hand.
 * **Dark background only**, like every use of the watermark.
 */
/**
 * The watermark does not die out sharply: its tail runs a little past the computed point,
 * and a letter set on it reads over two backgrounds. This air is counted in pixels, never
 * as a fraction of the height — it makes up for the mask's falloff, not a proportion.
 */
const AIR_AFTER_WATERMARK = 6;

export function NationCartouche({ nation, height }: { nation: string | null; height: number }) {
  const search = useSearch({ strict: false }) as BoardSearch;
  return (
    <Link
      to="/plateau"
      search={withWindow(search, 'nation')}
      title={fr.banner.nationSheet(nationLabel(nation))}
      className="relative flex shrink-0 items-center overflow-hidden pr-5 whitespace-nowrap hover:brightness-125"
      style={{ height }}
    >
      <FlagWatermark nation={nation} />
      {/* Une seule ligne depuis que la doctrine est partie (ADR 0020 §9), et elle reprend les
          19 px qu'elle tenait quand elle était seule : à 17 px, le pays flottait au milieu d'un
          bandeau taillé pour deux lignes. */}
      <div
        className="relative flex items-center"
        style={{
          paddingLeft: Math.round(height * 1.5 * 0.8) + AIR_AFTER_WATERMARK,
          textShadow: '0 1px 3px color-mix(in srgb, var(--map-desk) 90%, transparent)',
        }}
      >
        <span className="font-(family-name:--font-display) text-[19px] leading-none font-extrabold tracking-[.02em] text-[var(--paper)] uppercase">
          {nationLabel(nation)}
        </span>
      </div>
    </Link>
  );
}
