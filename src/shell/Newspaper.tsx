import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import boardBackdrop from './board-backdrop.jpg';
import { LOOP_POSTER_URL, LOOP_URL, filmBackdrop, type FilmBackdrop } from './media';

/**
 * The off-season is a newspaper laid on the map table: home and lobby are two pages of the
 * same edition. Going from one to the other turns the page — the axis is the fold, on the
 * left. A crossfade would say "two screens"; the fold says "a single edition".
 */

const EXIT_MS = 320;
const ENTRY_MS = 440;

export type Turning = 'exit' | 'entry' | null;

/**
 * `turn` plays the exit **then** runs the continuation (most often a navigation): the next
 * page mounts already turned and plays its entry, so the two halves of the motion chain
 * without the two routes having to talk to each other.
 */
export function usePageTurn() {
  const [turning, setTurning] = useState<Turning>('entry');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The turned page becomes a page again: without this, the last keyframe's `perspective`
  // stays on the sheet and gives it a permanent 3D context.
  useEffect(() => {
    const end = setTimeout(() => setTurning(null), ENTRY_MS);
    return () => clearTimeout(end);
  }, []);

  const turn = useCallback((next: () => void) => {
    if (timer.current !== null) clearTimeout(timer.current);
    setTurning('exit');
    timer.current = setTimeout(next, EXIT_MS);
  }, []);

  return { turning, turn };
}

const ANIMATION: Readonly<Record<'exit' | 'entry', string>> = {
  exit: `page-turn-out ${EXIT_MS}ms ease-in both`,
  entry: `page-turn-in ${ENTRY_MS}ms cubic-bezier(.2,.7,.2,1) both`,
};

export function Newspaper({
  width,
  turning = null,
  backdrop = 'map',
  children,
}: {
  width: number;
  turning?: Turning;
  /** `'film'` : les deux pages qu'un invité voit en arrivant, la connexion et l'invitation. */
  backdrop?: 'map' | 'film';
  children: ReactNode;
}) {
  return (
    <div className="relative h-full overflow-hidden bg-[var(--desk)]">
      {backdrop === 'film' ? <FilmTable /> : <MapTable />}
      {/* `m-auto` on the sheet rather than `items-center` on the scroller: auto margins centre
          what fits and give up the moment it does not, where centred alignment would keep
          eating the top of a page taller than the window and put it out of reach.
          La feuille ne défile qu'en hauteur : les piles de papier débordent la feuille par
          construction, leur rotation d'autant plus que la page est haute, et un débordement de
          côté se lisait au doigt comme une page qui glisse. Le cadre intérieur les rogne sans
          devenir un défileur (`clip`, pas `hidden`), donc rien ne compte dans la largeur
          défilable ; le défileur redit `clip` pour ce qu'on y posera un jour. */}
      <div className="relative h-full overflow-x-clip overflow-y-auto">
        <div className="flex min-h-full justify-center overflow-x-clip px-[clamp(16px,4vw,72px)] py-[26px]">
          <div className="hud relative m-auto max-w-full" style={{ width }}>
            <div
              aria-hidden
              className="absolute -bottom-[15px] -left-[9px] top-[11px] right-[5px] rotate-[-.7deg] border border-(color:--map-desk)/60 bg-[var(--paper-pile-2)] shadow-[0_10px_24px_rgba(0,0,0,.5)]"
            />
            <div
              aria-hidden
              className="absolute -right-[11px] -bottom-[8px] left-[7px] top-[5px] rotate-[.9deg] border border-(color:--map-desk)/55 bg-[var(--paper-pile)] shadow-[0_9px_21px_rgba(0,0,0,.45)]"
            />
            <div
              className="relative origin-left"
              style={turning === null ? undefined : { animation: ANIMATION[turning] }}
            >
              {children}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 transition-opacity duration-300"
                style={{
                  opacity: turning === 'exit' ? 1 : 0,
                  background:
                    'linear-gradient(90deg, color-mix(in srgb, var(--map-desk) 60%, transparent) 0%, color-mix(in srgb, var(--map-desk) 12%, transparent) 45%, color-mix(in srgb, var(--map-desk) 0%, transparent) 75%)',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The map seen from above, out of reach: it gives depth without ever asking for a click.
 * It is a shot of the engine itself, straight down — not an illustration: the off-season
 * shows the board that waits, not another map. Blurred and darkened, it costs neither
 * three.js nor the whole world at load time.
 */
function MapTable() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <MapImage />
      <TableShade />
    </div>
  );
}

/**
 * **La table de carte reste dessous, et c'est le repli** : le film se pose par-dessus en fondu
 * quand il joue vraiment, et reste invisible s'il échoue — sans médias, la page est la table de
 * toujours. Les ombres de la table passent sur le film, mais il n'est que peu flouté : il doit
 * se reconnaître dans les bandes latérales, la feuille rester lisible.
 */
function FilmTable() {
  const [mode] = useState<FilmBackdrop>(() =>
    filmBackdrop({
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      // Absent sur Safari et Firefox : absent vaut « pas d'économie demandée ».
      saveData:
        (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
        true,
      width: window.innerWidth,
    }),
  );
  const [shown, setShown] = useState(false);

  const layer = 'absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms]';
  const style = { opacity: shown ? 1 : 0, filter: FILM_FILTER };
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <MapImage />
      {mode === 'video' && (
        <video
          className={layer}
          style={style}
          src={LOOP_URL}
          poster={LOOP_POSTER_URL}
          muted
          loop
          playsInline
          autoPlay
          disablePictureInPicture
          aria-hidden
          tabIndex={-1}
          onPlaying={() => setShown(true)}
          onError={() => setShown(false)}
        />
      )}
      {mode === 'poster' && (
        <img
          className={layer}
          style={style}
          src={LOOP_POSTER_URL}
          alt=""
          onLoad={() => setShown(true)}
          onError={() => setShown(false)}
        />
      )}
      <TableShade />
    </div>
  );
}

const FILM_FILTER = 'grayscale(.2) sepia(.2) blur(1.5px) brightness(.65) contrast(1.04)';

function MapImage() {
  return (
    <div
      className="absolute -inset-[2%]"
      style={{
        backgroundImage: `url(${boardBackdrop})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: '190%',
        backgroundPosition: '46% 62%',
        filter: 'grayscale(.35) sepia(.3) blur(4px) brightness(.72) contrast(1.06)',
        opacity: 0.72,
      }}
    />
  );
}

function TableShade() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(68% 52% at 50% -8%, rgba(200,150,72,.26) 0%, color-mix(in srgb, var(--map-desk) 0%, transparent) 62%), radial-gradient(46% 40% at 18% 88%, rgba(63,90,125,.22) 0%, color-mix(in srgb, var(--map-desk) 0%, transparent) 70%)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(18,14,7,.26) 0%, rgba(18,14,7,.5) 55%, rgba(10,8,4,.78) 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, color-mix(in srgb, var(--map-desk) 50%, transparent) 0 1px, transparent 1px 4px)',
        }}
      />
      {/* the vignette bites into the side bands, the only ones where the map shows:
          beyond ~130px of reach it extinguishes them entirely */}
      <div className="absolute inset-0 shadow-[inset_0_0_110px_rgba(8,6,3,.72)]" />
    </>
  );
}

/** The newspaper's strong rule: three points of lead then one — never the reverse. */
export function ThickRule({ margin = 30 }: { margin?: number | string }) {
  return (
    <div aria-hidden style={{ margin: `0 ${gutter(margin)}` }}>
      <div className="h-[3px] bg-[var(--ink)]" />
      <div className="mt-[2px] h-px bg-[var(--ink)]" />
    </div>
  );
}

export function ThickRuleInverse({ margin = 30 }: { margin?: number | string }) {
  return (
    <div aria-hidden style={{ margin: `0 ${gutter(margin)}` }}>
      <div className="h-px bg-[var(--ink)]" />
      <div className="mt-[2px] h-[3px] bg-[var(--ink)]" />
    </div>
  );
}

/** Un chiffre est en pixels ; une chaîne est déjà une longueur — `var(--sheet-pad)`. */
const gutter = (margin: number | string): string =>
  typeof margin === 'number' ? `${margin}px` : margin;
