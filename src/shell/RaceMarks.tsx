import { fr } from '@/i18n/fr';
import { nationInk } from '@/domain/nations';
import type { RaceMark } from '@/domain/race-mark';

/** Les hachures d'un point contesté : du papier sur l'encre du teneur ; sur un point neutre, le
 *  papier sur le papier ne se verrait pas, elles sont d'encre douce. */
const HATCH = { held: 'var(--paper)', neutral: 'color-mix(in srgb, var(--ink) 55%, transparent)' };

/**
 * **Les Sept en sept marques** (Presse et réglette) : chacune à l'encre de son teneur, vide si
 * neutre ; un point contesté garde l'encre de son teneur et gagne des hachures, sans jamais dire
 * qui l'attaque.
 */
export function RaceMarks({
  marks,
  size,
}: {
  marks: ReadonlyArray<RaceMark>;
  size: number | string;
}) {
  return (
    <span className="flex gap-[3px]">
      {marks.map((mark) => (
        <i
          key={mark.id}
          title={`${fr.points.names[mark.key]}${mark.contested ? ` (${fr.points.race.contested})` : ''}`}
          className="border border-[var(--ink)]"
          style={{
            width: size,
            height: size,
            background: mark.nation === null ? 'transparent' : nationInk(mark.nation),
            ...(mark.contested
              ? {
                  backgroundImage: `repeating-linear-gradient(45deg, transparent 0 2px, ${HATCH[mark.nation === null ? 'neutral' : 'held']} 2px 3px)`,
                }
              : {}),
          }}
        />
      ))}
    </span>
  );
}
