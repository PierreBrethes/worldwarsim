import type { Ref } from 'react';
import type { CompassAction } from '@/domain/compass-rose';
import { chipOf, type DropChip, type DropReading, type Forbidden } from '@/domain/drop-order';
import { fr } from '@/i18n/fr';
import type { FuelGauge } from '@/domain/supplies';
import { ResourcePlate } from '@/emblems/Plate';
import type { TroopStation } from '@/domain/player-view';
import type { PieceClick } from './engine';
import type { RingState } from './engine/ink-ring';

/** **Ce que le glisser prend ou vise** (15/10) : une pièce que la carte dessine, ou l'étiquette
 *  d'une de mes piles. */
export type PieceFrom =
  | { readonly kind: 'piece'; readonly hit: PieceClick }
  | { readonly kind: 'stack'; readonly station: TroopStation };

/** **What letting go would do, said under the pointer** (POC, `#hint`): a sign in a round, the
 *  verb, its consequence — or the refusal in red, or « reposer » when nothing moves. */
export type DropHint = {
  readonly icon: string;
  readonly tone: DropChip['tone'] | 'calm' | 'refused';
  readonly verb: string;
  readonly detail: string | null;
  /** Plusieurs ordres possibles : lequel est choisi, et le suivant au Tab. */
  readonly choice?: string;
  /** **Joining one of my piles**: its ring turns as a squad's would (POC, `merge`). */
  readonly joins?: boolean;
  /** **Boarding**: the transport aimed at, the seats the hand takes in it, and whether they fit —
   *  its tag opens on them (POC, `seats`). */
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
  if (reading.kind === 'pending')
    return { icon: '…', tone: 'calm', verb: reading.reason, detail: null };
  const { verbs } = reading;
  const at = chosenOf(verbs);
  const verb = verbs[at]!;
  const boarding =
    verb.key === 'board'
      ? { carrierId: verb.carrierId, need: verb.need, fits: true }
      : verb.key === 'aim' && verb.boardsOn !== undefined
        ? { carrierId: verb.boardsOn, need: verb.boardNeed ?? 0, fits: true }
        : null;
  const chip = chipOf(verb, forbidden);
  return {
    ...chip,
    ...(verb.key === 'aim' && verb.join !== undefined ? { joins: true } : {}),
    ...(boarding === null ? {} : { boarding }),
    detail:
      verb.key === 'aim' && verb.join !== undefined
        ? fr.drop.pieces(verb.join.pieces)
        : verb.key === 'aim' && chip.tone === 'fight'
          ? strikeOf(verb.cost)
          : verb.cost,
    ...(verbs.length > 1
      ? { choice: fr.drop.choice(at + 1, verbs.length, verbs[(at + 1) % verbs.length]!.label) }
      : {}),
  };
}

/** **The ring of what the hand is over** (POC, `ringStyle`): red and ticked on the enemy, turning
 *  dashes on a pile one joins, solid and beating on a transport, red dashes on a refusal. */
export function ringOfHint(hint: DropHint): RingState {
  if (hint.tone === 'refused') return 'bad';
  if (hint.tone === 'fight') return 'enemy';
  return hint.joins === true ? 'merge' : 'target';
}

/** **What an attack says beforehand** (POC, `odds`): not the outcome — the fog serves neither
 *  the composition nor the strength across — but the initiative (B16). */
const strikeOf = (cost: string | null): string =>
  cost === null ? fr.drop.strike : `${fr.drop.strike} · ${cost}`;

/** Ce que la route du serveur ajoute au pointeur arrêté : l'heure d'arrivée, la morsure du
 *  repos, ou l'absence de route — il n'y a plus de carte pour le dire avant l'ordre. */
export type DropNote = { readonly text: string; readonly alarm: boolean };

/** Le plein qu'une route mangerait (#250), lu sur l'aperçu du serveur. */
export type DropFuel = FuelGauge & { readonly roundTrip: boolean };

/** **The fuel gauge under the verb** (#250): one step a cell, those that would stay in ink, those
 *  the road eats pale and hatched, those Singapore spares ringed, what is missing spilling red
 *  past the tube. Drawn like the personal board's tubes, lying down. */
function FuelGaugeLine({ fuel }: { fuel: DropFuel }) {
  const eaten = Math.min(fuel.eaten, fuel.held);
  const kept = fuel.held - eaten;
  /** Singapore's steps stay in the tube when the fuel holds them; past it, they are the spill the
   *  plain price would have made, ringed and empty. */
  const sparedIn = Math.min(fuel.spared, kept);
  const spill = [
    ...Array<string>(fuel.short).fill('short'),
    ...Array<string>(fuel.spared - sparedIn).fill('spared-out'),
  ];
  const cells = Array.from({ length: fuel.full }, (_, at) =>
    at >= fuel.held ? 'empty' : at >= kept ? 'eaten' : at >= kept - sparedIn ? 'spared' : 'kept',
  );
  const label = fr.supplies.gauge(fuel.held, fuel.eaten, fuel.roundTrip);
  return (
    <span
      className="drop-chip-fuel"
      title={fuel.spared > 0 ? `${label} — ${fr.supplies.spared(fuel.spared)}` : label}
      aria-label={label}
      style={{ ['--fuel-ink' as string]: `var(--res-${fuel.resource}-paper)` }}
    >
      <ResourcePlate resource={fuel.resource} height={13} width={13} />
      <span className="fuel-tube" aria-hidden>
        {cells.map((cell, at) => (
          <i key={at} className={`fuel-step fuel-step--${cell}`} />
        ))}
      </span>
      {spill.length > 0 && (
        <span className={`fuel-spill${fuel.short > 0 ? ' fuel-spill--short' : ''}`} aria-hidden>
          {spill.map((cell, at) => (
            <i key={at} className={`fuel-step fuel-step--${cell}`} />
          ))}
        </span>
      )}
      <span className={`fuel-count${fuel.short > 0 ? ' fuel-count--short' : ''}`} aria-hidden>
        {fuel.held} → {kept}
        {fuel.short > 0 && ` · ${fr.supplies.lacking(fuel.short)}`}
        {fuel.roundTrip && <small> · {fr.supplies.roundTrip}</small>}
      </span>
    </span>
  );
}

/** Collée au pointeur par le moteur (`onCarryOver`), qui la place sans repasser par React. */
export function DropHintChip({
  hint,
  notes = [],
  fuel = null,
  ref,
}: {
  hint: DropHint;
  notes?: ReadonlyArray<DropNote>;
  fuel?: DropFuel | null;
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
      {hint.tone !== 'refused' && fuel !== null && <FuelGaugeLine fuel={fuel} />}
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
