import { Link, useSearch } from '@tanstack/react-router';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import { currentStock } from '@/domain/player-view';
import { ResourceIcon, resourceColor, type ResourceKey } from '@/emblems/ResourceIcon';
import { withWindow, type BoardSearch } from '@/routes/plateau';
import { NationCartouche } from './NationCartouche';
import { Pictogram } from './IndicatorGlyph';
import { useClock } from './clock';

const BANNER_HEIGHT = 42;

/**
 * The banner answers "what's new", and the cartouche says under which colors. Everything
 * else that is consulted rather than watched — rest window, season, slots, due times —
 * lives in the surface that carries it. That trimming is what removes the overflow, not one
 * more horizontal scroll.
 */
export function NationBanner({ view }: { view: PlayerView }) {
  const { me } = view;
  const search = useSearch({ strict: false }) as BoardSearch;
  const now = useClock();
  const critical = view.journal.find((dispatch) => dispatch.severity === 'critical') ?? null;
  const hasNews = critical !== null || view.journal.length > 0;
  return (
    <header
      className="hud flex shrink-0 items-center border-b border-[var(--ink-quiet)] bg-[var(--desk)]"
      style={{ fontFamily: 'var(--font-body)', height: BANNER_HEIGHT }}
    >
      <NationCartouche nation={me.nation} doctrine={me.doctrine} height={BANNER_HEIGHT} />

      <div className="flex-1" />

      <Group>
        <Counter
          resource="supply"
          label={fr.resources.supply}
          value={currentStock(me.supply, view.loadedAt, now)}
          rate={me.supply.ratePerHour}
        />
        <Separator />
        <Counter
          resource="steel"
          label={fr.resources.steel}
          value={currentStock(me.steel, view.loadedAt, now)}
          rate={me.steel.ratePerHour}
        />
        <Separator />
        <Counter
          resource="manpower"
          label={fr.resources.manpower}
          value={currentStock(me.manpower, view.loadedAt, now)}
          rate={me.manpower.ratePerHour}
          cap={me.manpower.cap}
        />
      </Group>

      <div className="flex-1" />

      <Link
        to="/plateau"
        search={withWindow(search, 'journal')}
        title={hasNews ? undefined : fr.banner.journalEmpty}
        className="flex h-full min-w-0 items-center gap-3 border-l border-[var(--ink-quiet)] px-4 whitespace-nowrap hover:bg-[var(--ink)]"
      >
        <span className="shrink-0" style={{ color: critical ? 'var(--critical)' : 'var(--routine)' }}>
          <Pictogram pictogram="journal" weight={20} size={20} />
        </span>
        {/* The headline beats the counter: a newspaper titles, it does not enumerate.
            But a paper without a dispatch has no headline either — it stays silent. */}
        {hasNews && (
          <span className="min-w-0 max-w-[260px] overflow-hidden text-[13px] text-ellipsis"
            style={{ color: critical ? 'var(--critical)' : 'var(--paper)' }}
          >
            {critical ? critical.text : fr.banner.unread(view.journal.length)}
          </span>
        )}
      </Link>
    </header>
  );
}

// Groups no longer carry a rule: whitespace separates them now, and the two remaining rules
// hold at the banner's two ends.
function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-3 px-4 whitespace-nowrap">{children}</div>
  );
}

function Separator() {
  return <span className="text-[12px] text-[var(--paper-dim-2)] opacity-40">·</span>;
}

/**
 * Icon and figure, nothing else: the rate is read once per game, it need not occupy a line
 * permanently. It waits for the hover.
 */
function Counter({
  resource,
  label,
  value,
  rate,
  cap,
}: {
  resource: ResourceKey;
  label: string;
  value: number;
  rate: number;
  cap?: number | undefined;
}) {
  const depleted = value === 0 && rate === 0;
  return (
    <span
      className={`flex shrink-0 items-center gap-[6px] ${depleted ? 'resource-depleted' : ''}`}
      title={fr.banner.rate(label, rate)}
    >
      <span className="flex" style={{ color: resourceColor(resource) }}>
        <ResourceIcon resource={resource} size={13} />
      </span>
      <span className="font-[var(--font-mono)] text-[15px] font-medium text-[var(--paper)]">
        {value.toLocaleString('fr-FR')}
        {cap !== undefined && (
          <span className="text-[12px] text-[var(--paper-dim-2)]">/{cap}</span>
        )}
      </span>
    </span>
  );
}
