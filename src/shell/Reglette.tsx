import { useEffect, useRef, useState, type ComponentProps, type Ref, type RefObject } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { fr, nationLabel } from '@/i18n/fr';
import { isOutpostWork, RESOURCES, type ResourceKey } from '@/domain/ids';
import { currentMinutes, currentStock, type PlayerView } from '@/domain/player-view';
import { asDuration } from '@/domain/duration';
import { drynessOf, marksOf, sourceOf, type Dryness, type Mark } from '@/domain/resource-band';
import { Flag } from '@/emblems/Flag';
import { BuildingPlate, ResourcePlate } from '@/emblems/Plate';
import { withWindow, type BoardSearch } from '@/routes/-plateau/board-search';
import { HoverCard } from './HoverCard';
import { Stamp } from './Stamp';
import { useClock } from './clock';

/**
 * **La réglette** (table plein écran, décision de Pierre du 13/10) : une bande de papier posée en
 * haut de la carte, avec sa marge et son ombre, à la place du bandeau sombre et de la ligne des
 * ressources. Qui je suis, ce qui se bâtit, les mouvements libres, et les huit réserves — chacune
 * son icône, son chiffre et sa jauge à l'encre. Le journal en est parti : il a son carré dans la
 * colonne, et le dire deux fois était le doublon.
 *
 * **Le rouge n'y sert qu'à l'alerte, et l'alerte est la réserve à sec** (`drynessOf`) : vide, ou
 * vide avant un jour au débit net. Le chiffre et la jauge rougissent, un cercle l'entoure, et une
 * étiquette pend sous la case. **Au plafond n'est pas une alarme** (Pierre, 13/10) : la jauge
 * pleine le dit à l'encre, et le diagnostic reste à la carte de la réserve.
 */
export function Reglette({ view, ref }: { view: PlayerView; ref?: Ref<HTMLElement> }) {
  const { me } = view;
  const search = useSearch({ strict: false }) as BoardSearch;
  const now = useClock();
  const marks = marksOf(view, now);
  const [shown, setShown] = useState<ResourceKey | null>(null);
  const reserves = useRef<HTMLDivElement>(null);
  useClosedOnTouchElsewhere(shown !== null, reserves, () => setShown(null));

  return (
    <header
      ref={ref}
      className="hud paper-grain float absolute top-[calc(var(--table-margin)/var(--hud-scale))] right-[calc(var(--table-margin)/var(--hud-scale))] left-[calc(var(--table-margin)/var(--hud-scale))] z-[var(--z-band)] flex h-[55px] items-stretch border border-[var(--ink)] text-[var(--ink)]"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <div className={`${CELL} gap-[10px] pl-[12px]`}>
        <Link
          to="/plateau"
          search={withWindow(search, 'nation')}
          title={fr.banner.nationSheet(nationLabel(me.nation))}
          aria-label={fr.banner.nationSheet(nationLabel(me.nation))}
          className="shrink-0"
        >
          <Flag nation={me.nation} width={38} onPaper />
        </Link>
        <div className="grid gap-[2px]">
          {/* L'enseigne ramène à l'accueil (05/10) : sans elle, le plateau ne se quittait que par
              la déconnexion. */}
          <span className="flex items-baseline gap-[8px]">
            <Link
              to="/accueil"
              title={fr.banner.home}
              aria-label={fr.banner.home}
              className="font-(family-name:--font-display) text-[10px] leading-none text-[var(--ink-soft)] italic hover:underline"
            >
              {fr.masthead.article} {fr.masthead.word}
            </Link>
            <SeasonMark season={view.season} loadedAt={view.loadedAt} />
          </span>
          <Link
            to="/plateau"
            search={withWindow(search, 'nation')}
            title={fr.banner.nationSheet(nationLabel(me.nation))}
            className="font-(family-name:--font-display) text-[25px] leading-none font-bold tracking-[.01em] whitespace-nowrap uppercase"
          >
            {nationLabel(me.nation)}
          </Link>
        </div>
        {me.defeated && <Stamp label={fr.stamps.defeated} size="small" />}
      </div>

      {me.construction !== null && <SiteCell view={view} now={now} />}

      <div
        className={`${CELL} gap-[9px] whitespace-nowrap`}
        title={fr.banner.slotsTitle(me.slots.used, me.slots.total)}
      >
        <span className="text-[8.5px] leading-none font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase max-[1400px]:hidden">
          {fr.resourceBand.slots}
        </span>
        <SlotBoxes used={me.slots.used} total={me.slots.total} />
        <span className="font-(family-name:--font-mono) text-[13px] leading-none font-medium tabular-nums">
          {fr.banner.slotsCount(me.slots.used, me.slots.total)}
        </span>
      </div>

      <div
        ref={reserves}
        className="flex min-w-0 flex-1 items-center justify-around gap-[4px] px-[10px]"
        onPointerLeave={(event) => {
          if (event.pointerType !== 'touch') setShown(null);
        }}
      >
        {RESOURCES.map((resource) => (
          <span key={resource} className="relative">
            <ResourceCell
              resource={resource}
              view={view}
              now={now}
              onPointerEnter={(event) => {
                if (event.pointerType !== 'touch') setShown(resource);
              }}
              onClick={() => setShown((open) => (open === resource ? null : resource))}
            />
            {shown === resource && (
              <ReserveCard
                resource={resource}
                view={view}
                now={now}
                mark={marks[resource]}
                left={0}
                top={70}
                {...(marks[resource] === null ? {} : { width: 240 })}
              />
            )}
          </span>
        ))}
      </div>
    </header>
  );
}

const CELL = 'flex shrink-0 items-center border-r border-(color:--ink)/25 px-[15px]';

/** Une case par slot, pleine quand il est engagé — au-delà de huit, le compte seul : une rangée
 *  de cases qu'on dénombre ne se lit plus d'un coup d'œil. */
export function SlotBoxes({ used, total }: { used: number; total: number }) {
  if (total > 8) return null;
  return (
    <span aria-hidden className="flex gap-[3px]">
      {Array.from({ length: total }, (_, rank) => (
        <i
          key={rank}
          className={`block h-[11px] w-[11px] border border-[var(--ink)] ${rank < used ? 'bg-[var(--ink)]' : ''}`}
        />
      ))}
    </span>
  );
}

/** Le chantier et son compte à rebours, jamais une barre : la vue ne sert que les minutes
 *  restantes, une fraction remplie serait inventée. */
function SiteCell({ view, now }: { view: PlayerView; now: number }) {
  const site = view.me.construction;
  if (site === null) return null;
  return (
    <div
      className={`${CELL} gap-[9px] whitespace-nowrap`}
      title={fr.banner.siteTitle(site.name, site.regionName)}
    >
      <span className="text-[8.5px] leading-none font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase">
        {fr.banner.site}
      </span>
      {!isOutpostWork(site.key) && <BuildingPlate building={site.key} height={20} />}
      <span className="text-[12px] font-semibold max-[1400px]:hidden">{site.name}</span>
      <span className="font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
        {asDuration(currentMinutes(site.minutesLeft, view.loadedAt, now))}
      </span>
    </div>
  );
}

/**
 * **Une réserve, en case de réglette** : l'icône, le chiffre, et la jauge du stock sur son plafond
 * sous le chiffre. Le bureau la pose en ligne et l'entoure d'un cercle en alerte ; le téléphone la
 * pose en colonne et s'en passe — le chiffre rouge et l'étiquette qui pend y suffisent.
 */
export function ResourceCell({
  resource,
  view,
  now,
  stacked = false,
  ...button
}: {
  resource: ResourceKey;
  view: PlayerView;
  now: number;
  stacked?: boolean;
} & Pick<ComponentProps<'button'>, 'onClick' | 'onPointerEnter'>) {
  const reserve = view.me.resources[resource];
  const stock = currentStock(reserve, view.loadedAt, now);
  const fill = reserve.cap > 0 ? Math.min(1, stock / reserve.cap) : 0;
  const dry = drynessOf(stock, reserve.ratePerHour);
  const ink = dry === null ? 'var(--ink)' : 'var(--critical)';
  return (
    <button
      type="button"
      aria-label={fr.resourceBand.tooltip(
        fr.resources[resource],
        stock,
        reserve.cap,
        reserve.ratePerHour,
      )}
      className={`relative grid cursor-pointer items-center ${
        stacked
          ? 'min-h-[44px] justify-items-center gap-[3px]'
          : 'grid-cols-[auto_auto] grid-rows-[auto_3px] gap-x-[6px] gap-y-[4px]'
      }`}
      {...button}
    >
      {/* Unboxed, every plate is the same height and seated in the same slot, cut for the
          widest: the figures then fall in one column from one case to the next. */}
      <span
        className={`flex max-w-full items-end justify-center overflow-hidden ${stacked ? '' : 'row-span-2'}`}
        style={{ width: Math.round(PLATE * SLOT_RATIO), height: PLATE }}
      >
        <ResourcePlate resource={resource} height={PLATE} boxed={false} />
      </span>
      <span
        className="font-(family-name:--font-mono) text-[13px] leading-none font-medium tabular-nums"
        style={{ color: ink }}
      >
        {stock.toLocaleString('fr-FR')}
      </span>
      <span
        aria-hidden
        className={`block h-[3px] bg-(--ink)/15 ${stacked ? 'w-[34px]' : 'w-[30px]'}`}
      >
        <span className="block h-full" style={{ width: `${fill * 100}%`, background: ink }} />
      </span>
      {dry !== null && !stacked && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-x-[9px] -inset-y-[8px] rotate-[-4deg] border-[1.5px] border-[var(--critical)]"
          style={{ borderRadius: '50% 46% 52% 44%' }}
        />
      )}
      {dry !== null && <AlertTag label={dryLabel(dry, stacked)} />}
    </button>
  );
}

/** Une heure entière, jamais « dans 0 h » : sous l'heure, c'est déjà à sec dans l'heure. */
const dryLabel = (dry: Dryness, stacked: boolean): string => {
  if (dry.hoursLeft === 0) return fr.resourceBand.dry;
  const hours = Math.max(1, Math.floor(dry.hoursLeft));
  return stacked ? fr.resourceBand.drySoonShort(hours) : fr.resourceBand.drySoon(hours);
};

const PLATE = 22;
const SLOT_RATIO = 1.8;

/** L'étiquette qui pend sous la case en alerte, au bout d'un fil. Le diagnostic entier reste à la
 *  carte de la réserve : l'étiquette nomme l'état, la carte dit quoi faire. */
function AlertTag({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-[calc(100%+12px)] left-1/2 -translate-x-1/2 rotate-[-1deg] bg-[var(--critical)] px-[6px] py-[3px] text-[8.5px] leading-none font-semibold tracking-[.1em] whitespace-nowrap text-[var(--paper)] uppercase float"
    >
      <span className="absolute -top-[12px] left-1/2 h-[12px] w-px bg-[var(--critical)]" />
      {label}
    </span>
  );
}

/** Le nom, le plafond, le débit, la source et le diagnostic : tout ce que la case tait. */
export function ReserveCard({
  resource,
  view,
  now,
  mark,
  left,
  top,
  width,
}: {
  resource: ResourceKey;
  view: PlayerView;
  now: number;
  mark: Mark | null;
  left: number;
  top?: number;
  width?: number;
}) {
  const reserve = view.me.resources[resource];
  const source = sourceOf(view, resource);
  return (
    <HoverCard
      left={left}
      {...(top === undefined ? {} : { top })}
      {...(width === undefined ? {} : { width })}
    >
      {fr.resourceBand.tooltip(
        fr.resources[resource],
        currentStock(reserve, view.loadedAt, now),
        reserve.cap,
        reserve.ratePerHour,
      )}
      {source !== null && ` · ${fr.resourceBand.source(fr.buildings[source.by], source.level)}`}
      {mark !== null && (
        <span className="mt-[3px] block text-[var(--critical)]">{mark.diagnosis}</span>
      )}
    </HoverCard>
  );
}

/** Un doigt n'a pas de survol : ce que la souris quitterait, un toucher ailleurs le referme. */
function useClosedOnTouchElsewhere(
  open: boolean,
  inside: RefObject<HTMLElement | null>,
  close: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const elsewhere = (event: PointerEvent) => {
      if (inside.current?.contains(event.target as Node)) return;
      close();
    };
    document.addEventListener('pointerdown', elsewhere);
    return () => document.removeEventListener('pointerdown', elsewhere);
  }, [open, inside, close]);
}

/** La saison et sa fin, contre l'enseigne, comme elle l'était au pied du rail : un repère, pas une entrée. */
function SeasonMark({ season, loadedAt }: { season: PlayerView['season']; loadedAt: number }) {
  const now = useClock(60_000);
  /** `null` = sans horloge : rien à décompter, et la réglette le dit en un mot plutôt que
   *  d'afficher un « 0 h 00 » qui se lirait comme une fin imminente (ADR 0017). */
  const minutesLeft =
    season.durationHours === null
      ? null
      : Math.max(0, (season.durationHours - season.elapsedHours) * 60 - (now - loadedAt) / 60_000);
  return (
    <span
      title={
        minutesLeft === null
          ? fr.rail.seasonNoClock(season.number)
          : fr.rail.seasonEnd(
              season.number,
              Math.floor(minutesLeft / 60),
              String(Math.floor(minutesLeft % 60)).padStart(2, '0'),
            )
      }
      className="font-(family-name:--font-mono) text-[8.5px] leading-none text-[var(--ink-soft)]"
    >
      {fr.rail.seasonShort(season.number)}
    </span>
  );
}
