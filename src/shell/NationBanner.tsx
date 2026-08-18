import { Link, useSearch } from '@tanstack/react-router';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import { currentMinutes } from '@/domain/player-view';
import { asHoursMinutes } from '@/domain/duration';
import { BuildingPlate } from '@/emblems/Plate';
import { withWindow, type BoardSearch } from '@/routes/plateau';
import { NationCartouche } from './NationCartouche';
import { Pictogram } from './IndicatorGlyph';
import { useClock } from './clock';

/**
 * Thirty-two pixels, twenty given back to the map. The bar held 52 to seat a gauge under each
 * of the eight figures; the reserves left for a panel of their own (`ReservesPanel`), and with
 * them the only content that needed two lines.
 */
const BANNER_HEIGHT = 32;

const PLATE_HEIGHT = 20;

/**
 * **What is left is what one watches rather than reads**: who I am, what is being built, how
 * many dispatches I may still send, and the day's headline. Three questions and a title.
 *
 * The site and the slots are never grouped: a single deadline that arrives, against a resource
 * that comes back. The rule between them says they do not belong to the same system — and the
 * journal keeps the end of the bar, because a banner answers "what's new" before anything else.
 */
export function NationBanner({ view }: { view: PlayerView }) {
  const { me } = view;
  const search = useSearch({ strict: false }) as BoardSearch;
  const critical = view.journal.find((dispatch) => dispatch.severity === 'critical') ?? null;
  const hasNews = critical !== null || view.journal.length > 0;

  return (
    <header
      className="hud flex shrink-0 items-center border-b border-[var(--ink-quiet)] bg-[var(--desk)]"
      style={{ fontFamily: 'var(--font-body)', height: BANNER_HEIGHT }}
    >
      <NationCartouche nation={me.nation} doctrine={me.doctrine} height={BANNER_HEIGHT} />

      {me.construction !== null && <SiteStrip view={view} />}

      <div className="flex-1" />

      {/* The slots ride with the journal, on the same edge: both are things one glances at
          rather than reads, and the free slot is the first question before any dispatch. */}
      <div
        className="flex h-full shrink-0 items-center gap-[10px] border-l border-[var(--ink-quiet)] px-4 whitespace-nowrap"
        title={fr.banner.slotsTitle(me.slots.used, me.slots.total)}
      >
        <span className="text-[9px] leading-none tracking-[.14em] text-[var(--paper-dim)] uppercase">
          {fr.banner.slots}
        </span>
        <span className="font-[var(--font-mono)] text-[14px] font-medium text-[var(--paper)]">
          {fr.banner.slotsCount(me.slots.used, me.slots.total)}
        </span>
      </div>

      <Link
        to="/plateau"
        search={withWindow(search, 'journal')}
        title={hasNews ? undefined : fr.banner.journalEmpty}
        className="flex h-full min-w-0 items-center gap-3 border-l border-[var(--ink-quiet)] px-4 whitespace-nowrap hover:bg-[var(--ink)]"
      >
        <span
          className="shrink-0"
          style={{ color: critical ? 'var(--critical)' : 'var(--routine)' }}
        >
          <Pictogram pictogram="journal" weight={20} size={18} />
        </span>
        {/* The headline beats the counter: a newspaper titles, it does not enumerate.
            But a paper without a dispatch has no headline either — it stays silent. */}
        {hasNews && (
          <span
            className="min-w-0 max-w-[260px] overflow-hidden text-[12.5px] text-ellipsis"
            style={{ color: critical ? 'var(--critical)' : 'var(--paper)' }}
          >
            {critical ? critical.text : fr.banner.unread(view.journal.length)}
          </span>
        )}
      </Link>
    </header>
  );
}

/**
 * The work in progress, **and its countdown rather than a progress bar**: the view serves the
 * minutes left, never the total, so a filled fraction here would be invented. What the player
 * acts on is the moment it lands.
 */
function SiteStrip({ view }: { view: PlayerView }) {
  const now = useClock();
  const site = view.me.construction;
  if (site === null) return null;

  return (
    <div
      className="flex h-full shrink-0 items-center gap-[10px] border-l border-[var(--ink-quiet)] px-4 whitespace-nowrap"
      title={fr.banner.siteTitle(site.name, site.regionName)}
    >
      <span className="text-[9px] leading-none tracking-[.16em] text-[var(--paper-dim)] uppercase">
        {fr.banner.site}
      </span>
      <span className="resource-reserve flex">
        <BuildingPlate building={site.key} height={PLATE_HEIGHT} />
      </span>
      <span className="text-[12.5px] font-semibold text-[var(--paper)]">{site.name}</span>
      <span className="font-[var(--font-mono)] text-[11.5px] text-[var(--paper-dim)]">
        {asHoursMinutes(currentMinutes(site.minutesLeft, view.loadedAt, now))}
      </span>
    </div>
  );
}
