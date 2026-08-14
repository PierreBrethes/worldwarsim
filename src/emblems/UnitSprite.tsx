import { roleLabel } from '@/i18n/fr';
import type { UnitRole } from '@/domain/ids';
import type { UnitTier } from '@/domain/troops';
import { spriteUrl } from './units/manifest';

/**
 * Same logic as the flag filter: art direction is a display pass, never baked into the
 * asset. A sprite re-baked in ink would serve neither the replay nor a revised palette, and
 * would get re-encoded at every art tweak.
 */
const INK_FILTER = 'saturate(.5) sepia(.22) brightness(.94)';

/**
 * `width` fixes the box, not the image: ratios range from a standing rifleman to a ship
 * lying full length, so at equal height a column of sprites goes sawtooth. `object-contain`
 * lets each subject breathe in a common box.
 */
export function UnitSprite({
  nation,
  role,
  tier = 1,
  height,
  width,
}: {
  nation: string | null;
  role: UnitRole;
  tier?: UnitTier;
  height: number;
  width?: number;
}) {
  const label = roleLabel(role, 1);
  const url = spriteUrl(nation, role, tier);
  if (url === null) return <RoleWithoutVisual label={label} height={height} width={width} />;
  return (
    <img
      src={url}
      alt=""
      title={label}
      // No `image-rendering: pixelated`: these are renders, not pixel sprites.
      className="block shrink-0 object-contain"
      style={{ height, width: width ?? 'auto', filter: INK_FILTER }}
    />
  );
}

/**
 * The cargo has no visual, and seven nations out of eight have none at all: a broken `<img>`
 * would flag them with a browser icon, off-palette and mute about what it is.
 */
function RoleWithoutVisual({
  label,
  height,
  width,
}: {
  label: string;
  height: number;
  width: number | undefined;
}) {
  return (
    <span
      title={label}
      className="flex shrink-0 items-center justify-center overflow-hidden border border-dashed px-1 text-center leading-[1.1] uppercase"
      style={{
        height,
        width: width ?? 'auto',
        minWidth: width ?? height,
        borderColor: 'var(--ink-soft)',
        color: 'var(--ink-soft)',
        fontSize: 'var(--size-eyebrow-sm)',
        letterSpacing: 'var(--track-eyebrow)',
      }}
    >
      {label}
    </span>
  );
}
