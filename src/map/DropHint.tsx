import type { Ref } from 'react';
import type { CompassAction } from '@/domain/compass-rose';
import { chipOf, type DropChip, type DropReading, type Forbidden } from '@/domain/drop-order';
import { fr } from '@/i18n/fr';
import type { TroopStation } from '@/domain/player-view';
import type { PieceClick } from './engine';
import type { RingState } from './engine/ink-ring';

/** **Ce que le glisser prend ou vise** (15/10) : une pièce que la carte dessine, ou l'étiquette
 *  d'une de mes piles. */
export type PieceFrom =
  | { readonly kind: 'piece'; readonly hit: PieceClick }
  | { readonly kind: 'stack'; readonly station: TroopStation };

/** **Ce que ferait le lâcher, dit sous le pointeur** (POC, `#hint`) : un signe dans un rond, le
 *  verbe, sa conséquence — ou le refus en rouge, ou « reposer » quand rien ne bouge. */
export type DropHint = {
  readonly icon: string;
  readonly tone: DropChip['tone'] | 'calm' | 'refused';
  readonly verb: string;
  readonly detail: string | null;
  /** Plusieurs ordres possibles : lequel est choisi, et le suivant au Tab. */
  readonly choice?: string;
  /** **Monter à bord** : le transport visé, les places que la main y prend, et si elles y
   *  tiennent — son étiquette s'ouvre dessus (POC, `seats`). */
  readonly boarding?: { readonly carrierId: string; readonly need: number; readonly fits: boolean };
};

/** La pastille d'une lecture du lâcher (`dropReadingOf`) : le verbe choisi, ou le refus. */
export function hintOfReading(
  reading: DropReading,
  chosenOf: (verbs: ReadonlyArray<CompassAction>) => number,
  forbidden: Forbidden,
): DropHint | null {
  if (reading.kind === 'none') return null;
  if (reading.kind === 'refused')
    return { icon: '✕', tone: 'refused', verb: reading.reason, detail: null };
  const { verbs } = reading;
  const at = chosenOf(verbs);
  const verb = verbs[at]!;
  const boarding =
    verb.key === 'board'
      ? { carrierId: verb.carrierId, need: verb.need, fits: true }
      : verb.key === 'aim' && verb.boardsOn !== undefined
        ? { carrierId: verb.boardsOn, need: verb.boardNeed ?? 0, fits: true }
        : null;
  return {
    ...chipOf(verb, forbidden),
    ...(boarding === null ? {} : { boarding }),
    detail:
      verb.key === 'aim' && verb.join !== undefined ? fr.drop.pieces(verb.join.pieces) : verb.cost,
    ...(verbs.length > 1
      ? { choice: fr.drop.choice(at + 1, verbs.length, verbs[(at + 1) % verbs.length]!.label) }
      : {}),
  };
}

/** **L'anneau de ce que la main survole** (POC, `ringStyle`) : rouge et cerclé de repères sur
 *  l'ennemi, en tirets qui tournent sur une pile qu'on rejoint, plein et battant sur un transport,
 *  en tirets rouges sur un refus. */
export function ringOfHint(hint: DropHint): RingState {
  if (hint.tone === 'refused') return 'bad';
  if (hint.tone === 'fight') return 'enemy';
  return hint.icon === '+' ? 'merge' : 'target';
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
    <div ref={ref} role="status" className={`drop-chip paper-grain float drop-chip--${hint.tone}`}>
      {/* Keyed by what it says: a new verb pops its sign. */}
      <span key={hint.icon + hint.verb} className="drop-chip-icon" aria-hidden>
        {hint.icon}
      </span>
      <span className="drop-chip-verb">{hint.verb}</span>
      {hint.detail !== null && <span className="drop-chip-detail">{hint.detail}</span>}
      {hint.tone !== 'refused' &&
        notes.map((note) => (
          <span
            key={note.text}
            className={`drop-chip-detail${note.alarm ? ' drop-chip-detail--alarm' : ''}`}
          >
            {note.text}
          </span>
        ))}
      {hint.choice !== undefined && <span className="drop-chip-detail">{hint.choice}</span>}
      <span className="drop-chip-keys">
        {hint.tone === 'refused'
          ? fr.drop.refused
          : hint.tone === 'calm'
            ? fr.drop.still
            : fr.drop.release}
      </span>
    </div>
  );
}
