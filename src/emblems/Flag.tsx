import CN from 'country-flag-icons/string/3x2/CN';
import DE from 'country-flag-icons/string/3x2/DE';
import FR from 'country-flag-icons/string/3x2/FR';
import GB from 'country-flag-icons/string/3x2/GB';
import IT from 'country-flag-icons/string/3x2/IT';
import JP from 'country-flag-icons/string/3x2/JP';
import US from 'country-flag-icons/string/3x2/US';
import { nationLabel } from '@/i18n/fr';
import { isNation, type Nation } from '@/domain/nations';
import ussr from './ussr.svg?raw';

/**
 * The official paths from `country-flag-icons`, 3:2 ratio — under 4 KB in all, inlined as
 * data URIs rather than eight requests.
 *
 * **Single rule: a flag is never distorted.** Every use gives it a 3:2 box and builds the
 * layout around it, never the other way. Stretching over a wide band turns the Japanese disc
 * into an ellipse; cropping shows only a slice. The box adapts.
 *
 * Two exceptions: the **USSR** exists in no package, its path is ours; **Germany** carries
 * the current tricolor, never the 1940 flag.
 */

const asImage = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

const IMAGE_BY_NATION: Readonly<Record<Nation, string>> = {
  france: asImage(FR),
  uk: asImage(GB),
  usa: asImage(US),
  ussr: asImage(ussr),
  germany: asImage(DE),
  japan: asImage(JP),
  italy: asImage(IT),
  china: asImage(CN),
};

/**
 * An official flag is saturated: placed as-is it blows the contrast budget, which belongs to
 * the game layer. This filter brings it back into the palette.
 */
const CARTOUCHE_FILTER = 'saturate(.45) sepia(.28) brightness(.85) contrast(1.05)';
const WATERMARK_FILTER = 'saturate(.4) sepia(.22) brightness(1.15)';
const PAPER_WATERMARK_FILTER = 'saturate(.6) sepia(.18)';

export function nationImage(nation: string | null): string | null {
  return nation !== null && isNation(nation) ? IMAGE_BY_NATION[nation] : null;
}

/**
 * Watermark — the flag anchored to the left of a band, fading rightward. The container
 * is exactly 3:2 (`aspect-[3/2] h-full`), so the real path fits undistorted, and the fade
 * runs over its own width. The dark-band filter brightens, which on paper turns the flag into a
 * grey block: `onPaper` keeps its colour and lets the paper itself be what it fades into.
 */
const WATERMARK_MASK = 'linear-gradient(to right, #000 0%, #000 52%, transparent 100%)';

export function FlagWatermark({
  nation,
  opacity = 0.6,
  onPaper = false,
}: {
  nation: string | null;
  opacity?: number;
  onPaper?: boolean;
}) {
  const image = nationImage(nation);
  if (image === null) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 aspect-[3/2]"
      style={{
        opacity,
        backgroundImage: image,
        backgroundSize: '100% 100%',
        filter: onPaper ? PAPER_WATERMARK_FILTER : WATERMARK_FILTER,
        maskImage: WATERMARK_MASK,
        WebkitMaskImage: WATERMARK_MASK,
      }}
    />
  );
}

/**
 * Cartouche — the treatment for lists and paper surfaces.
 * The flag identifies; it must not compete with the counters.
 */
export function Flag({
  nation,
  width = 27,
  onPaper = false,
}: {
  nation: string | null;
  width?: number;
  onPaper?: boolean;
}) {
  const image = nationImage(nation);
  return (
    <span
      aria-hidden
      title={nation === null ? undefined : nationLabel(nation)}
      className="relative block shrink-0 border"
      style={{
        width,
        height: Math.round((width * 2) / 3),
        borderColor: onPaper ? 'var(--ink)' : 'var(--paper)',
        ...(image === null ? { background: 'var(--routine)' } : {}),
        ...(onPaper
          ? {}
          : { boxShadow: '0 1px 0 color-mix(in srgb, var(--map-desk) 80%, transparent)' }),
      }}
    >
      {image !== null && (
        <span
          className="absolute inset-0"
          style={{ backgroundImage: image, backgroundSize: '100% 100%', filter: CARTOUCHE_FILTER }}
        />
      )}
      <span
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,.10), color-mix(in srgb, var(--map-desk) 22%, transparent))',
        }}
      />
    </span>
  );
}
