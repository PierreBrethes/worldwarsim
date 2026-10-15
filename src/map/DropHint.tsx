import type { Ref } from 'react';
import type { Compass } from '@/domain/compass-rose';
import type { TroopStation } from '@/domain/player-view';
import { PICTOGRAM_PATHS } from './CompassRose';
import type { PieceClick } from './engine';

/** **Ce que le glisser prend ou vise** (15/10) : une pièce que la carte dessine, ou l'étiquette
 *  d'une de mes piles. */
export type PieceFrom =
  | { readonly kind: 'piece'; readonly hit: PieceClick }
  | { readonly kind: 'stack'; readonly station: TroopStation };

/** **Ce que ferait le lâcher, dit sous le pointeur** — le signe d'embarquement, ou le motif. */
export type DropHint = {
  readonly title: string;
  readonly detail: string | null;
  readonly boards: boolean;
  readonly refused: boolean;
};

/** La première branche de la rose qu'ouvrirait le lâcher, ou son motif : un aperçu, pas un ordre. */
export function hintOfCompass(compass: Compass | null): DropHint | null {
  if (compass === null) return null;
  const [first] = compass.actions;
  if (first === undefined)
    return compass.refusal === null
      ? null
      : { title: compass.refusal, detail: null, boards: false, refused: true };
  const boards = first.pictogram === 'anchor';
  return { title: first.label, detail: boards ? first.consequence : null, boards, refused: false };
}

/** Collée au pointeur par le moteur (`onCarryOver`), qui la place sans repasser par React. */
export function DropHintChip({ hint, ref }: { hint: DropHint; ref: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      role="status"
      className="pointer-events-none fixed top-0 left-0 z-[var(--z-popin)] max-w-[260px]"
    >
      <div
        className="float paper-grain flex items-start gap-[7px] border px-[8px] py-[5px] text-[var(--ink)]"
        style={{ borderColor: hint.refused ? 'var(--critical)' : 'var(--ink)' }}
      >
        {hint.boards && (
          <svg
            viewBox="0 0 20 20"
            width={18}
            height={18}
            aria-hidden
            className="mt-[1px] shrink-0"
            style={{ fill: hint.refused ? 'var(--critical)' : 'var(--ink)' }}
          >
            {PICTOGRAM_PATHS.anchor}
          </svg>
        )}
        <span className="min-w-0">
          <span
            className="block text-[11px] font-bold tracking-[.12em] uppercase"
            style={{ color: hint.refused ? 'var(--critical)' : undefined }}
          >
            {hint.title}
          </span>
          {hint.detail !== null && (
            <span
              className="block font-(family-name:--font-mono) text-[10.5px] leading-[1.35]"
              style={{ color: hint.refused ? 'var(--critical)' : 'var(--ink-soft)' }}
            >
              {hint.detail}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
