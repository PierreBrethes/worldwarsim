import type { Ref } from 'react';
import type { CompassAction } from '@/domain/compass-rose';
import type { DropReading } from '@/domain/drop-order';
import { fr } from '@/i18n/fr';
import type { TroopStation } from '@/domain/player-view';
import { PICTOGRAM_PATHS } from './CompassRose';
import type { PieceClick } from './engine';

/** **Ce que le glisser prend ou vise** (15/10) : une pièce que la carte dessine, ou l'étiquette
 *  d'une de mes piles. */
export type PieceFrom =
  | { readonly kind: 'piece'; readonly hit: PieceClick }
  | { readonly kind: 'stack'; readonly station: TroopStation };

/** **Ce que ferait le lâcher, dit sous le pointeur** — l'ordre, sa conséquence, ou le motif. */
export type DropHint = {
  readonly title: string;
  readonly detail: string | null;
  readonly boards: boolean;
  readonly refused: boolean;
  /** Plusieurs ordres possibles : lequel est choisi, et le suivant au Tab. */
  readonly choice?: string;
};

/** La pastille d'une lecture du lâcher (`dropReadingOf`) : le verbe choisi, ou le refus. */
export function hintOfReading(
  reading: DropReading,
  chosenOf: (verbs: ReadonlyArray<CompassAction>) => number,
): DropHint | null {
  if (reading.kind === 'none') return null;
  if (reading.kind === 'refused')
    return { title: reading.reason, detail: null, boards: false, refused: true };
  const { verbs } = reading;
  const at = chosenOf(verbs);
  const verb = verbs[at]!;
  return {
    title: verb.label,
    detail: verb.cost ?? (verb.consequence || null),
    boards: verb.pictogram === 'anchor',
    refused: false,
    ...(verbs.length > 1
      ? { choice: fr.drop.choice(at + 1, verbs.length, verbs[(at + 1) % verbs.length]!.label) }
      : {}),
  };
}

/** Ce que la route du serveur ajoute au pointeur arrêté : l'heure d'arrivée, la morsure du
 *  repos, ou l'absence de route — il n'y a plus de carte pour le dire avant l'ordre. */
export type DropNote = { readonly text: string; readonly alarm: boolean };

/** Collée au pointeur par le moteur (`onCarryOver`), qui la place sans repasser par React. */
export function DropHintChip({
  hint,
  notes = [],
  ref,
}: {
  hint: DropHint;
  notes?: ReadonlyArray<DropNote>;
  ref: Ref<HTMLDivElement>;
}) {
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
          {!hint.refused &&
            notes.map((note) => (
              <span
                key={note.text}
                className="block font-(family-name:--font-mono) text-[10.5px] leading-[1.35]"
                style={{ color: note.alarm ? 'var(--critical)' : 'var(--ink)' }}
              >
                {note.text}
              </span>
            ))}
          {hint.choice !== undefined && (
            <span className="mt-[3px] block font-(family-name:--font-mono) text-[10.5px] leading-[1.35] text-[var(--ink)]">
              {hint.choice}
            </span>
          )}
          <span className="mt-[4px] block border-t border-dotted border-(color:--ink)/40 pt-[3px] text-[9px] tracking-[.1em] text-[var(--ink-soft)] uppercase">
            {hint.refused ? fr.drop.refused : fr.drop.release}
          </span>
        </span>
      </div>
    </div>
  );
}
