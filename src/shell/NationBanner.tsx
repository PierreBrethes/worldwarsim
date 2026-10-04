import type { CSSProperties } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import { currentMinutes } from '@/domain/player-view';
import { asDuration } from '@/domain/duration';
import { isOutpostWork } from '@/domain/ids';
import { BuildingPlate } from '@/emblems/Plate';
import { withWindow, type BoardSearch } from '@/routes/-plateau/board-search';
import { Wordmark } from './Masthead';
import { NationCartouche } from './NationCartouche';
import { Stamp } from './Stamp';
import { Pictogram } from './IndicatorGlyph';
import { useClock } from './clock';

/**
 * Forty-two pixels. The bar held 52 to seat a gauge under each of the eight figures; the
 * reserves left for a line of their own (`ResourceBand`, just below) and it fell to 32. It
 * stays at 42 now that the cartouche is back to a single line: the site strip, the slots and
 * the headline all sit on that height, and 32 crushes them against the rule.
 */
const BANNER_HEIGHT = 42;

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
  /** **Le bandeau ne compte que le non-lu.** Il comptait toutes les dépêches, pour toujours :
   *  un compteur qui ne redescend jamais cesse d'être lu au bout d'une journée. */
  const unread = view.journal.filter((dispatch) => dispatch.unread);
  const critical = unread.find((dispatch) => dispatch.severity === 'critical') ?? null;
  const hasNews = unread.length > 0;

  return (
    <header
      className="hud flex shrink-0 items-center border-b border-[var(--ink-quiet)] bg-[var(--desk)]"
      style={{ fontFamily: 'var(--font-body)', height: BANNER_HEIGHT }}
    >
      {/* **La manchette réduite, à la tête du seul en-tête du jeu.** Le pavé et sa suite, rien
          d'autre : la ligne de date et les filets appartiennent au papier, pas à une barre de
          42 px. Il ne mène nulle part — le plateau *est* la destination.

          L'encre de la barre est celle du papier (`.hud` sert `--ink`) : « SIM » prend la
          couleur courante et disparaissait sur le bureau sombre. Ici il tire du papier. */}
      <div className="flex h-full shrink-0 items-center border-r border-[var(--ink-quiet)] px-3 text-[var(--paper)]">
        <Wordmark size={15} />
      </div>

      <NationCartouche nation={me.nation} height={BANNER_HEIGHT} />

      {/* **Le cachet de la défaite, contre le cartouche.** À l'encre du papier et non au rouge :
          la règle 3 des tampons réserve le rouge à ce qui exige un geste, et un observateur n'en
          a plus aucun à faire. La barre est sombre, elle pose donc son encre de cachet. */}
      {me.defeated && (
        <span
          className="flex h-full shrink-0 items-center border-r border-[var(--ink-quiet)] px-3"
          style={{ '--stamp-ink': 'var(--paper-dim)' } as CSSProperties}
        >
          <Stamp label={fr.stamps.defeated} size="small" />
        </span>
      )}

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
        <span className="font-(family-name:--font-mono) text-[14px] font-medium text-[var(--paper)]">
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
            {critical ? critical.text : fr.banner.unread(unread.length)}
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
      {!isOutpostWork(site.key) && (
        <span className="resource-reserve flex">
          <BuildingPlate building={site.key} height={PLATE_HEIGHT} />
        </span>
      )}
      <span className="text-[12.5px] font-semibold text-[var(--paper)]">{site.name}</span>
      <span className="font-(family-name:--font-mono) text-[11.5px] text-[var(--paper-dim)]">
        {asDuration(currentMinutes(site.minutesLeft, view.loadedAt, now))}
      </span>
    </div>
  );
}
