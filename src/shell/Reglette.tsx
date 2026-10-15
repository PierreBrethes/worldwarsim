import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type Ref,
  type RefObject,
} from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { fr, nationLabel } from '@/i18n/fr';
import { isOutpostWork, RESOURCES, type ResourceKey } from '@/domain/ids';
import { currentMinutes, currentStock, type PlayerView, type Resource } from '@/domain/player-view';
import { announceOf, nextAnnounceIn, onNewView, type Announcement } from '@/domain/reserve-counter';
import { useMapMotion, usePrefersReducedMotion } from '@/data/mapMotion';
import { asDuration } from '@/domain/duration';
import { drynessOf, marksOf, sourceOf, type Dryness, type Mark } from '@/domain/resource-band';
import { FlagWatermark } from '@/emblems/Flag';
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
      className="hud paper-grain float absolute top-[calc(var(--table-margin)/var(--hud-scale))] right-[calc(var(--table-margin)/var(--hud-scale))] left-[calc(var(--table-margin)/var(--hud-scale))] z-[var(--z-band)] flex items-stretch border border-[var(--ink)] text-[var(--ink)]"
      style={{ fontFamily: 'var(--font-body)', height: RULE_HEIGHT }}
    >
      {/* Le drapeau en fondu, comme au bandeau sombre (Pierre, 13/10) : il touche le bord de la
          réglette et le nom commence là où il s'éteint. */}
      <div
        className={`${CELL} relative gap-[10px] overflow-hidden`}
        style={{ paddingLeft: WATERMARK_WIDTH * 0.9 + AIR_AFTER_WATERMARK }}
      >
        <Link
          to="/plateau"
          search={withWindow(search, 'nation')}
          title={fr.banner.nationSheet(nationLabel(me.nation))}
          aria-label={fr.banner.nationSheet(nationLabel(me.nation))}
          className="absolute inset-y-0 left-0"
          style={{ width: WATERMARK_WIDTH }}
        >
          <FlagWatermark nation={me.nation} opacity={0.85} onPaper />
        </Link>
        <div className="relative grid gap-[2px]">
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
            className="font-(family-name:--font-display) text-[22px] leading-none font-bold tracking-[.01em] whitespace-nowrap uppercase"
          >
            {nationLabel(me.nation)}
          </Link>
        </div>
        {me.defeated && <Stamp label={fr.stamps.defeated} size="small" />}
      </div>

      {me.construction !== null && <SiteCell view={view} now={now} />}

      {view.mode === 'blitz' && (
        <div className={`${CELL} whitespace-nowrap`}>
          <BlitzClock view={view} now={now} />
        </div>
      )}

      {/* Pas de slots en Blitz (B5) : la cadence est le rechargement. */}
      {view.mode !== 'blitz' && (
        <div
          className={`${CELL} gap-[9px] whitespace-nowrap`}
          title={fr.banner.slotsTitle(me.slots.used, me.slots.total)}
        >
          <span className="text-[8.5px] leading-none font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase max-[1500px]:hidden">
            {fr.resourceBand.slots}
          </span>
          <span className="max-[1500px]:hidden">
            <SlotBoxes used={me.slots.used} total={me.slots.total} />
          </span>
          <span className="font-(family-name:--font-mono) text-[13px] leading-none font-medium tabular-nums">
            {fr.banner.slotsCount(me.slots.used, me.slots.total)}
          </span>
        </div>
      )}

      <div
        ref={reserves}
        className="ml-auto flex min-w-0 items-center gap-[18px] px-[16px] max-[1500px]:gap-[4px] max-[1500px]:pl-[8px] max-[1500px]:pr-[12px] max-[1350px]:gap-[2px] max-[1350px]:pl-[4px] max-[1350px]:pr-[12px]"
        onPointerLeave={(event) => {
          if (event.pointerType !== 'touch') setShown(null);
        }}
      >
        {me.funds !== null && <FundsCell funds={me.funds} loadedAt={view.loadedAt} now={now} />}
        {me.funds === null &&
          RESOURCES.map((resource) => (
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
                  top={RULE_HEIGHT + 15}
                  {...(marks[resource] === null ? {} : { width: 240 })}
                />
              )}
            </span>
          ))}
      </div>
    </header>
  );
}

const CELL =
  'flex shrink-0 items-center border-r border-(color:--ink)/20 px-[13px] max-[1500px]:px-[9px] max-[1350px]:px-[6px]';

const RULE_HEIGHT = 48;
/** The watermark's box is the flag's own 3:2 at the rule's height: never a distorted flag. */
const WATERMARK_WIDTH = RULE_HEIGHT * 1.5;
/** The fade's tail runs a little past its computed end; a letter on it would read over two
 *  grounds. Counted in pixels: it makes up for the mask's falloff, not a proportion. */
const AIR_AFTER_WATERMARK = 6;

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
      <span className="text-[8.5px] leading-none font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase max-[1500px]:hidden">
        {fr.banner.site}
      </span>
      {!isOutpostWork(site.key) && <BuildingPlate building={site.key} height={20} />}
      <span className="text-[12px] font-semibold max-[1500px]:hidden">{site.name}</span>
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
  const motion = useMapMotion();
  const reduced = usePrefersReducedMotion();
  const still = motion === 'off' || reduced;
  const { shown, tag, clearTag } = useAnnouncedStock(reserve, view.loadedAt, still);
  const tagSpot = stacked
    ? {
        left: '50%',
        top: dry === null ? 'calc(100% + 1px)' : 'calc(100% - 2px)',
        transform: 'translateX(-50%)',
      }
    : { left: '50%', bottom: 'calc(100% + 7px)', transform: 'translateX(-50%)' };
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
        aria-hidden
        className="relative inline-flex font-(family-name:--font-mono) text-[13px] leading-none font-medium tabular-nums"
        style={{ color: ink }}
      >
        <Odometer value={still ? stock : shown} roll={motion === 'full' && !still} />
        {tag !== null && !stacked && (
          <ReserveTag
            gain={tag.gain}
            alarm={dry !== null && !tag.spent}
            quiet={motion === 'reduced'}
            spot={tagSpot}
            onDone={clearTag}
            key={tag.id}
          />
        )}
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
      {tag !== null && stacked && (
        <ReserveTag
          gain={tag.gain}
          alarm={dry !== null && !tag.spent}
          quiet={motion === 'reduced'}
          spot={tagSpot}
          onDone={clearTag}
          key={tag.id}
        />
      )}
    </button>
  );
}

/**
 * **Le compte à rebours de la Blitz** (B11) : à zéro, le plus gros revenu gagne. Il se lit à la
 * seconde parce que la soirée se joue à la minute ; conclue, la case le dit en un mot.
 */
export function BlitzClock({ view, now }: { view: PlayerView; now: number }) {
  const { season } = view;
  const ended = season.reduction.concludedAt !== null;
  const minutesLeft = Math.max(
    0,
    ((season.durationHours ?? 0) - season.elapsedHours) * 60 - (now - view.loadedAt) / 60_000,
  );
  return (
    <span
      role="timer"
      aria-label={ended ? fr.blitz.clockEnded : fr.blitz.clockLabel(asDuration(minutesLeft))}
      className="flex items-baseline gap-[8px]"
    >
      <span className="text-[8.5px] leading-none font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase">
        {fr.blitz.clock}
      </span>
      <span className="font-(family-name:--font-mono) text-[15px] leading-none font-medium tabular-nums">
        {ended ? fr.blitz.clockEnded : asDuration(minutesLeft)}
      </span>
    </span>
  );
}

/**
 * **Les fonds de la Blitz, seuls sur la réglette** (lot 4) : aucune des huit réserves n'y paraît.
 * Le chiffre s'annonce comme celui d'une réserve (`useAnnouncedStock`) — un fonds est une réserve
 * sans plafond —, et le débit par minute se lit à côté : c'est lui que la capture d'une ville
 * fait monter.
 */
export function FundsCell({
  funds,
  loadedAt,
  now,
  stacked = false,
}: {
  funds: { readonly stock: number; readonly perMinute: number };
  loadedAt: number;
  now: number;
  stacked?: boolean;
}) {
  const reserve = useMemo(
    () => ({ stock: funds.stock, ratePerHour: funds.perMinute * 60, cap: Infinity }),
    [funds.stock, funds.perMinute],
  );
  const stock = currentStock(reserve, loadedAt, now);
  const motion = useMapMotion();
  const reduced = usePrefersReducedMotion();
  const still = motion === 'off' || reduced;
  const { shown, tag, clearTag } = useAnnouncedStock(reserve, loadedAt, still);
  return (
    <span
      role="status"
      aria-label={fr.blitz.fundsLabel(stock, funds.perMinute)}
      className={`flex items-baseline whitespace-nowrap ${stacked ? 'gap-[8px]' : 'gap-[10px]'}`}
    >
      <span className="text-[8.5px] leading-none font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase">
        {fr.blitz.funds}
      </span>
      <span
        aria-hidden
        className="relative inline-flex font-(family-name:--font-mono) text-[17px] leading-none font-medium tabular-nums"
      >
        <Odometer value={still ? stock : shown} roll={motion === 'full' && !still} />
        {tag !== null && (
          <ReserveTag
            gain={tag.gain}
            alarm={false}
            quiet={motion === 'reduced'}
            spot={{ left: '50%', bottom: 'calc(100% + 7px)', transform: 'translateX(-50%)' }}
            onDone={clearTag}
            key={tag.id}
          />
        )}
      </span>
      <span
        aria-hidden
        className="font-(family-name:--font-mono) text-[11.5px] leading-none text-[var(--ink-soft)]"
      >
        {fr.blitz.perMinute(funds.perMinute)}
      </span>
    </span>
  );
}

/**
 * Ce que le chiffre vient de faire, un instant : au bureau au-dessus de lui, à cheval sur le bord
 * de la réglette — à droite il couvrait l'icône voisine ; au téléphone sous la jauge, et posé
 * sur l'alerte qui pend plutôt que dessous : l'alerte reste lisible, l'étiquette passe.
 */
function ReserveTag({
  gain,
  alarm,
  quiet,
  spot,
  onDone,
}: {
  gain: number;
  alarm: boolean;
  quiet: boolean;
  spot: CSSProperties;
  onDone: () => void;
}) {
  return (
    <span
      aria-hidden
      className={`reserve-tag ${quiet ? 'reserve-tag--quiet' : ''}`}
      style={{
        ...spot,
        background: gain > 0 ? 'var(--notable)' : alarm ? 'var(--critical)' : 'var(--ink-soft)',
      }}
      onAnimationEnd={onDone}
    >
      {gain > 0 ? '+' : '−'}
      {Math.abs(gain).toLocaleString('fr-FR')}
    </span>
  );
}

type Tag = { readonly gain: number; readonly spent: boolean; readonly id: number };

/**
 * Le chiffre d'une réserve tel que la réglette l'annonce (`reserve-counter.ts`) : figé entre deux
 * annonces, roulé à la sienne. Hors de l'onglet rien ne s'annonce — tout attend le retour, et
 * chaque réserve y parle à son tour dans la seconde et demie. Une annonce hors tirage relance le
 * tirage : sinon le gain suivant tomberait parfois une seconde après.
 */
function useAnnouncedStock(
  reserve: Resource,
  loadedAt: number,
  still: boolean,
): { shown: number; tag: Tag | null; clearTag: () => void } {
  const [said, setSaid] = useState(() => ({
    shown: currentStock(reserve, loadedAt, Date.now()),
    tag: null as Tag | null,
  }));
  const shown = useRef(said.shown);
  const silent = useRef(still);
  silent.current = still;
  const reading = useRef({ reserve, at: loadedAt });
  const schedule = useRef<(delay: number) => void>(() => {});
  const say = useCallback((next: Announcement) => {
    shown.current = next.shown;
    setSaid((last) => ({
      shown: next.shown,
      tag:
        next.gain === 0 || silent.current
          ? last.tag
          : { gain: next.gain, spent: next.spent === true, id: (last.tag?.id ?? 0) + 1 },
    }));
  }, []);
  const clearTag = useCallback(() => setSaid((last) => ({ ...last, tag: null })), []);

  useEffect(() => {
    const before = reading.current;
    if (before.reserve === reserve && before.at === loadedAt) return;
    reading.current = { reserve, at: loadedAt };
    const next = onNewView(shown.current, before, reading.current);
    if (next.gain > 0 && document.hidden) return;
    say(next);
    if (next.gain !== 0) schedule.current(nextAnnounceIn());
  }, [reserve, loadedAt, say]);

  useEffect(() => {
    let timer = 0;
    const after = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!document.hidden) {
          const { reserve: last, at } = reading.current;
          const next = announceOf(shown.current, currentStock(last, at, Date.now()));
          if (next !== null) say(next);
        }
        after(nextAnnounceIn());
      }, delay);
    };
    schedule.current = after;
    const back = () => {
      if (!document.hidden) after(Math.random() * RETURN_SPREAD_MS);
    };
    after(nextAnnounceIn());
    document.addEventListener('visibilitychange', back);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', back);
    };
  }, [say]);

  return { ...said, clearTag };
}

const RETURN_SPREAD_MS = 1_500;
const DIGITS = Array.from({ length: 30 }, (_, rank) => rank % 10);

/**
 * Un compteur mécanique : chaque chiffre est une roue 0-9 posée trois fois, au repos sur le tour
 * du milieu. Elle tourne dans le sens du nombre — en avant quand il monte, même si son chiffre
 * repasse par zéro — puis se recale sans bruit sur le tour du milieu. Les roues se comptent
 * depuis la droite, pour qu'un chiffre de plus ne fasse pas tourner les autres.
 */
function Odometer({ value, roll }: { value: number; roll: boolean }) {
  const [last, setLast] = useState({ value, up: true });
  if (last.value !== value) setLast({ value, up: value > last.value });
  const chars = [...value.toLocaleString('fr-FR')];
  return (
    <span className="inline-flex h-[1em] overflow-hidden">
      {chars.map((char, rank) =>
        /\d/.test(char) ? (
          <Wheel key={chars.length - rank} digit={Number(char)} up={last.up} roll={roll} />
        ) : (
          <span key={chars.length - rank}>{char}</span>
        ),
      )}
    </span>
  );
}

function Wheel({ digit, up, roll }: { digit: number; up: boolean; roll: boolean }) {
  const [wheel, setWheel] = useState({ digit, at: digit + 10, settling: false });
  if (wheel.digit !== digit) {
    const wraps = up ? digit < wheel.digit : digit > wheel.digit;
    setWheel({
      digit,
      at: !roll ? digit + 10 : wraps ? digit + (up ? 20 : 0) : digit + 10,
      settling: false,
    });
  }
  return (
    <span className="relative inline-block h-[1em] w-[1ch]">
      <span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{
          transform: `translateY(${-wheel.at}em)`,
          transition: roll && !wheel.settling ? 'transform 700ms cubic-bezier(.16,1,.3,1)' : 'none',
        }}
        onTransitionEnd={() => {
          if (wheel.at !== wheel.digit + 10)
            setWheel({ digit: wheel.digit, at: wheel.digit + 10, settling: true });
        }}
      >
        {DIGITS.map((shown, rank) => (
          <span key={rank} className="h-[1em]">
            {shown}
          </span>
        ))}
      </span>
    </span>
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
