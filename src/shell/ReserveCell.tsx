import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { fr } from '@/i18n/fr';
import type { ResourceKey } from '@/domain/ids';
import { currentStock, type PlayerView, type Resource } from '@/domain/player-view';
import {
  announceOf,
  displayedStock,
  nextAnnounceIn,
  onNewView,
  type Announcement,
} from '@/domain/reserve-counter';
import { drynessOf, marksOf, sourceOf } from '@/domain/resource-band';
import { useMapMotion, usePrefersReducedMotion } from '@/data/mapMotion';
import { ResourcePlate } from '@/emblems/Plate';
import { resourceColor } from '@/emblems/ResourceIcon';

/**
 * **Les registres épinglés** (#121), que `Shell` tient et que chaque réserve lit : un toucher sur
 * une réserve en pose ou en décroche le ticket, d'où qu'elle se lise — la barre basse du téléphone,
 * la ligne repliée du plateau au bureau, ses jauges dépliées.
 */
export const PinContext = createContext<{
  pinned: ReadonlyArray<ResourceKey>;
  onPin: (resource: ResourceKey) => void;
}>({ pinned: [], onPin: () => {} });

/** Under this travel a press that took a token hand is still a tap (`TokenDrag`'s own bar). */
const TAP_PX = 5;

/**
 * **Le toucher d'une réserve, et rien d'autre** : un clic épingle son registre ; une réserve qu'on
 * peut prendre pour charger un transport (`onTake`) garde le geste de la prise, qui avale le clic
 * qui suit — un appui qui n'a pas bougé épingle alors à la levée du doigt.
 */
export function usePinning(
  resource: ResourceKey,
  onTake: ((event: ReactPointerEvent<HTMLElement>) => void) | null,
) {
  const { pinned, onPin } = useContext(PinContext);
  const down = useRef<{ x: number; y: number } | null>(null);
  return {
    'aria-pressed': pinned.includes(resource),
    onClick: () => onPin(resource),
    ...(onTake === null
      ? {}
      : {
          'data-grab': fr.logistics.grab,
          onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
            down.current = { x: event.clientX, y: event.clientY };
            onTake(event);
          },
          onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
            const origin = down.current;
            down.current = null;
            if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < TAP_PX)
              onPin(resource);
          },
        }),
  };
}

/** Une heure entière, jamais « dans 0 h » : sous l'heure, c'est déjà à sec dans l'heure. `null` :
 *  rien à dire. **La seule phrase de l'alerte**, lue par la cellule et par la jauge dépliée. */
export function dryLabelOf(stock: number, netPerHour: number): string | null {
  const dry = drynessOf(stock, netPerHour);
  if (dry === null) return null;
  return dry.hoursLeft === 0
    ? fr.resourceBand.dry
    : fr.resourceBand.drySoonShort(Math.max(1, Math.floor(dry.hoursLeft)));
}

/** L'étiquette rouge de l'alerte : elle prend la place du débit, jamais une ligne de plus. */
export function DryTag({ label }: { label: string }) {
  return (
    <span className="bg-[var(--critical)] px-[3px] py-[2px] text-[7px] leading-none font-semibold tracking-[.04em] whitespace-nowrap text-[var(--paper)] uppercase">
      {label}
    </span>
  );
}

/**
 * **La seule lecture d'une réserve** : le stock réel, ce qu'on en montre (`shown`, le chiffre que la
 * récolte rejoue, sinon le stock), la part du plafond que la jauge remplit, l'alerte — qui se dit
 * sur le stock réel, jamais sur le chiffre rejoué — et la phrase du survol. La cellule de la ligne et
 * la jauge du plateau tiré la lisent.
 */
export function reserveReading(
  view: PlayerView,
  resource: ResourceKey,
  now: number,
  shown: number | null = null,
) {
  const reserve = view.me.resources[resource];
  const stock = currentStock(reserve, view.loadedAt, now);
  const displayed = Math.floor(shown ?? stock);
  const share = reserve.cap > 0 ? Math.min(1, displayed / reserve.cap) : 0;
  const alert = dryLabelOf(stock, reserve.ratePerHour);
  const source = sourceOf(view, resource);
  const full = marksOf(view, now)[resource];
  const title = [
    fr.resourceBand.tooltip(fr.resources[resource], stock, reserve.cap, reserve.ratePerHour),
    source === null ? null : fr.resourceBand.source(fr.buildings[source.by], source.level),
    full?.diagnosis ?? null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
  return { reserve, stock, displayed, share, alert, title };
}

const PLATE = 16;

/**
 * **Une réserve, sur une ligne de barre** — la seule : la barre basse du téléphone et la ligne
 * repliée du plateau au bureau la posent telles quelles. L'icône et le chiffre (une roue par
 * chiffre), puis le débit par heure — ou, à sec, l'étiquette rouge qui le remplace —, puis la
 * jauge du stock sur son plafond. Le chiffre rouge et l'étiquette sont la seule encre rouge de la
 * ligne. Le nom, le plafond, la source et le diagnostic du plafond sont au toucher ou au survol
 * (`title`) ; le registre s'épingle d'un toucher (`usePinning`).
 *
 * `shown` est le chiffre que la récolte rejoue : il passe devant l'annonce, et la roue s'arrête.
 */
export function ReserveCell({
  resource,
  view,
  now,
  shown = null,
  onTake = null,
  register,
}: {
  resource: ResourceKey;
  view: PlayerView;
  now: number;
  shown?: number | null;
  /** Munitions, pétrole et charbon se prennent ici pour charger un transport. */
  onTake?: ((event: ReactPointerEvent<HTMLElement>) => void) | null;
  register?: Ref<HTMLElement>;
}) {
  const { reserve, stock, share: fill, alert, title } = reserveReading(view, resource, now, shown);
  const ink = alert === null ? 'var(--ink)' : 'var(--critical)';
  const motion = useMapMotion();
  const reduced = usePrefersReducedMotion();
  const still = motion === 'off' || reduced;
  const announced = useAnnouncedStock(reserve, view.loadedAt, still);
  return (
    <button
      ref={register as Ref<HTMLButtonElement>}
      type="button"
      data-bin={resource}
      title={onTake === null ? title : `${title} — ${fr.logistics.grab}`}
      aria-label={title}
      {...usePinning(resource, onTake)}
      className={`relative flex h-full min-w-0 flex-1 touch-none flex-col items-center justify-center gap-[3px] border-l border-dotted border-(color:--ink)/25 px-[1px] select-none first:border-l-0 ${
        onTake === null ? '' : 'cursor-grab hover:bg-(--arc-mine)/14'
      }`}
    >
      <span className="flex items-center gap-[3px]">
        <span className="flex shrink-0 items-end" style={{ height: PLATE }}>
          <ResourcePlate resource={resource} height={PLATE} width={PLATE} />
        </span>
        <span
          aria-hidden
          className="relative inline-flex font-(family-name:--font-mono) text-[13px] leading-none font-semibold tabular-nums"
          style={{ color: ink }}
        >
          <Odometer
            value={shown ?? (still ? stock : displayedStock(announced.shown, stock))}
            roll={shown === null && motion === 'full' && !still}
          />
          {announced.tag !== null && shown === null && (
            <ReserveTag
              gain={announced.tag.gain}
              alarm={alert !== null && !announced.tag.spent}
              quiet={motion === 'reduced'}
              spot={{ left: '50%', bottom: 'calc(100% + 7px)', transform: 'translateX(-50%)' }}
              onDone={announced.clearTag}
              key={announced.tag.id}
            />
          )}
        </span>
      </span>
      {alert === null ? (
        <span
          aria-hidden
          className="font-(family-name:--font-mono) text-[9.5px] leading-none whitespace-nowrap"
          style={{ color: reserve.ratePerHour < 0 ? 'var(--critical)' : 'var(--ink-soft)' }}
        >
          {fr.personalBoard.rateShort(reserve.ratePerHour)}
        </span>
      ) : (
        <DryTag label={alert} />
      )}
      <span aria-hidden className="block h-[3px] w-[calc(100%-10px)] bg-(--ink)/15">
        <span
          className="block h-full"
          style={{
            width: `${fill * 100}%`,
            background: alert === null ? resourceColor(resource, true) : ink,
          }}
        />
      </span>
    </button>
  );
}

/**
 * Ce que le chiffre vient de faire, un instant : au bureau au-dessus de lui, à cheval sur le bord
 * de la réglette — à droite il couvrait l'icône voisine ; au téléphone sous la jauge, et posé
 * sur l'alerte qui pend plutôt que dessous : l'alerte reste lisible, l'étiquette passe.
 */
export function ReserveTag({
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
export function useAnnouncedStock(
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
export function Odometer({ value, roll }: { value: number; roll: boolean }) {
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
          transition: roll && !wheel.settling ? 'transform 700ms var(--ease-out)' : 'none',
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
