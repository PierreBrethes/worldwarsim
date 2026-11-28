import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { countryLabel, fr } from '@/i18n/fr';
import { asSpan } from '@/domain/duration';
import { onFootMinutes, scaleBarOf } from '@/domain/map-scale';
import { searchPlaces, type Place } from '@/domain/place-search';
import { isTyping } from '@/map/typing';
import { PlaceStripContext } from '@/shell/viewport';
import type { CursorReading } from './cursor-reading';

/**
 * **Ce que la caméra dit de l'échelle**, hors de React : elle change à chaque image d'un zoom, et
 * le plateau entier ne se redessine pas pour une barre. On ne notifie que d'un demi-pour-cent.
 */
export function createScaleStore() {
  let kmPerPixel = 0;
  const listeners = new Set<() => void>();
  return {
    set(next: number) {
      if (Math.abs(next - kmPerPixel) <= kmPerPixel * 0.005) return;
      kmPerPixel = next;
      for (const listener of listeners) listener();
    },
    get: () => kmPerPixel,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export type ScaleStore = ReturnType<typeof createScaleStore>;

/** The longest the bar may be, in screen pixels. */
const BAR_ROOM_PX = 150;
const RESULTS = 6;

/**
 * **La barrette du haut de la carte** (#721, bureau seulement) : à gauche « Chercher un lieu » —
 * `/` y met le curseur, Échap la quitte — et le sol sous le curseur ; à droite l'échelle. Elle pend
 * sous la réglette, sur ses marges, et se déclare à la coque (`PlaceStripContext`) : ses bords vont
 * aux insets du plateau et à `--board-top`, les fenêtres se posent dessous.
 *
 * La recherche porte sur la géographie, pas sur des pièces : le calque « noms des villes » éteint
 * ne l'empêche pas.
 */
export function PlaceStrip({
  loadPlaces,
  onGo,
  reading,
  groundOpen,
  scale,
}: {
  /** The places, asked for when the field is first used: 5 000 names are not read at the board's start. */
  loadPlaces: () => Promise<ReadonlyArray<Place>>;
  onGo: (place: Place) => void;
  reading: CursorReading | null;
  /** La fiche de survol du sol est dépliée (#725) : elle est la référence, « sous le curseur »
   *  ne la redit pas. Repliée ou absente, il reparaît. */
  groundOpen: boolean;
  /** `null` where the scale would lie (the Blitz scales its theatre). */
  scale: ScaleStore | null;
}) {
  const claim = useContext(PlaceStripContext);
  const strip = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    claim(strip.current);
    return () => claim(null);
  }, [claim]);

  return (
    <div
      ref={strip}
      className="hud pointer-events-none absolute z-[var(--z-indicator)] flex items-start justify-between gap-[12px]"
      style={{
        top: 'calc((var(--band-bottom) + var(--table-gap)) / var(--hud-scale))',
        left: 'calc(var(--table-margin) / var(--hud-scale))',
        right: 'calc(var(--table-margin) / var(--hud-scale))',
      }}
    >
      <Finder loadPlaces={loadPlaces} onGo={onGo} reading={groundOpen ? null : reading} />
      {scale !== null && <Scale store={scale} />}
    </div>
  );
}

function Finder({
  loadPlaces,
  onGo,
  reading,
}: {
  loadPlaces: () => Promise<ReadonlyArray<Place>>;
  onGo: (place: Place) => void;
  reading: CursorReading | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<ReadonlyArray<Place>>([]);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const asked = useRef(false);

  const ask = () => {
    if (asked.current) return;
    asked.current = true;
    loadPlaces().then(setPlaces, () => (asked.current = false));
  };

  /** `/` puts the cursor in the field, unless a field already has the focus. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || isTyping()) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const found = useMemo(() => searchPlaces(places, query, RESULTS), [places, query]);
  const open = focused && query.trim() !== '';
  const go = (place: Place) => {
    onGo(place);
    setQuery('');
    input.current?.blur();
  };

  return (
    <div className="pointer-events-auto relative">
      <div className="float paper-grain flex h-[34px] items-stretch border border-[var(--ink)] text-[var(--ink)]">
        <label className="flex items-center gap-[8px] px-[10px]">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 10l4.5 4.5" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={fr.placeStrip.search}
            placeholder={fr.placeStrip.search}
            value={query}
            autoComplete="off"
            spellCheck={false}
            onFocus={() => {
              setFocused(true);
              ask();
            }}
            onBlur={() => setFocused(false)}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setQuery('');
                input.current?.blur();
              } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : found.length - 1;
                setActive((held) => (found.length === 0 ? 0 : (held + step) % found.length));
              } else if (event.key === 'Enter' && found[active] !== undefined) {
                event.preventDefault();
                go(found[active]);
              }
            }}
            className="w-[150px] bg-transparent text-[13px] outline-none placeholder:text-[var(--ink-soft)]"
          />
          <kbd className="border border-[var(--ink-soft)] px-[5px] font-(family-name:--font-mono) text-[11px] leading-[16px] text-[var(--ink-soft)]">
            {fr.placeStrip.searchKey}
          </kbd>
        </label>
        {reading !== null && (
          <div className="flex items-baseline gap-[8px] border-l border-[var(--ink)] px-[12px] pt-[9px] whitespace-nowrap">
            <span className="text-[11px] font-semibold tracking-[.14em] text-[var(--ink-soft)] uppercase">
              {fr.placeStrip.underCursor}
            </span>
            <b className="text-[13px] font-bold">{reading.place}</b>
            {[reading.country, reading.held, ...reading.deposits].map(
              (part) =>
                part !== null && (
                  <span key={part} className="text-[13px] text-[var(--ink-soft)]">
                    · {part}
                  </span>
                ),
            )}
          </div>
        )}
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={fr.placeStrip.results}
          className="float paper-grain absolute top-full left-0 mt-[4px] w-[340px] border border-[var(--ink)] text-[13px] text-[var(--ink)]"
        >
          {found.length === 0 && (
            <li className="px-[10px] py-[7px] text-[var(--ink-soft)]">{fr.placeStrip.none}</li>
          )}
          {found.map((place, at) => (
            <li
              key={`${place.kind}-${place.id ?? place.name}`}
              role="option"
              aria-selected={at === active}
              // Pressed rather than clicked: the field's blur would close the list before a click.
              onPointerDown={(event) => {
                event.preventDefault();
                go(place);
              }}
              onPointerEnter={() => setActive(at)}
              className={`flex cursor-pointer items-baseline gap-[8px] px-[10px] py-[6px] whitespace-nowrap ${
                at === active ? 'bg-[var(--paper-pile)]' : ''
              }`}
            >
              <b className="shrink-0 font-bold">{place.name}</b>
              <span className="min-w-0 truncate text-[11px] tracking-[.1em] text-[var(--ink-soft)] uppercase">
                {fr.placeStrip.kinds[place.kind]}
                {place.country === null ? '' : ` · ${countryLabel(place.country)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** **L'échelle** : une longueur ronde en km, et ce qu'une troupe à pied en marche. */
function Scale({ store }: { store: ScaleStore }) {
  const kmPerPixel = useSyncExternalStore(store.subscribe, store.get);
  const bar = scaleBarOf(kmPerPixel, BAR_ROOM_PX);
  if (bar === null) return null;
  return (
    <div
      role="img"
      aria-label={`${fr.placeStrip.scale(bar.km)} · ${fr.placeStrip.onFoot(asSpan(onFootMinutes(bar.km)))}`}
      className="float paper-grain flex h-[34px] items-center gap-[10px] border border-[var(--ink)] px-[10px] text-[var(--ink)]"
    >
      <span
        aria-hidden
        className="relative block h-[8px] border-x-2 border-b-2 border-[var(--ink)]"
        // Screen pixels: the strip is zoomed by the interface scale.
        style={{ width: `calc(${bar.px}px / var(--hud-scale))` }}
      >
        <span className="absolute inset-y-0 left-0 w-1/2 bg-[var(--ink)]" />
      </span>
      <span className="font-(family-name:--font-mono) text-[12px] whitespace-nowrap">
        {fr.placeStrip.scale(bar.km)}
        <span className="text-[var(--ink-soft)]">
          {' · '}
          {fr.placeStrip.onFoot(asSpan(onFootMinutes(bar.km)))}
        </span>
      </span>
    </div>
  );
}
