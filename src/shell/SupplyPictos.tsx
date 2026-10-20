import { FUEL_STEP_KM } from '../../convex/constants';
import { resourceColor } from '@/emblems/ResourceIcon';
import type { PileSupplies } from '@/domain/supplies';
import { fr } from '@/i18n/fr';

/** La cartouche : une douille debout, ce que la troupe tire. */
const CARTRIDGE = 'M9 22V10.5C9 7 10.4 4 12 2c1.6 2 3 5 3 8.5V22zM8 22h8v-2H8z';
/** Le jerrican : la poignée en haut, le X embouti — ce que ses moteurs boivent. */
const JERRICAN =
  'M6 5h4V3h4v2h4v17H6zm2.6 4.2 6.8 9.6 1.2-.9-6.8-9.6zm6.8 0-6.8 9.6 1.2.9 6.8-9.6z';

/**
 * **Coups et plein, en deux pictos** (ADR 0028 §3) : une cartouche et un jerrican, chacun suivi
 * de « reste/plein ». Un compte à zéro passe en rouge : c'est ce qui manque, et la règle qu'il
 * casse est dans l'infobulle. Rien ne se dessine en Blitz (`null`).
 */
export function SupplyPictos({
  supplies,
  size = 11,
  onPaper = true,
}: {
  supplies: PileSupplies | null;
  size?: number;
  onPaper?: boolean;
}) {
  if (supplies === null || (supplies.rounds === null && supplies.fuel === null)) return null;
  const { rounds, fuel } = supplies;
  const count = (held: number, full: number) => (
    <span style={held === 0 ? { color: 'var(--critical)' } : undefined}>
      {held}/{full}
    </span>
  );
  return (
    <span className="supply-pictos inline-flex items-center gap-[8px] font-(family-name:--font-mono)">
      {rounds !== null && (
        <span
          className="inline-flex items-center gap-[2px]"
          title={fr.supplies.roundsTitle(rounds.held, rounds.full)}
          aria-label={`${fr.supplies.rounds} ${rounds.held}/${rounds.full}`}
        >
          <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="currentColor"
            style={{ color: resourceColor('ammunition', onPaper) }}
            aria-hidden
          >
            <path d={CARTRIDGE} />
          </svg>
          {count(rounds.held, rounds.full)}
        </span>
      )}
      {fuel !== null && (
        <span
          className="inline-flex items-center gap-[2px]"
          title={fr.supplies.fuelTitle(
            fuel.held,
            fuel.full,
            fuel.held * FUEL_STEP_KM,
            fuel.resource === 'coal',
          )}
          aria-label={`${fr.supplies.fuel} ${fuel.held}/${fuel.full}`}
        >
          <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="currentColor"
            fillRule="evenodd"
            style={{ color: resourceColor(fuel.resource, onPaper) }}
            aria-hidden
          >
            <path d={JERRICAN} />
          </svg>
          {count(fuel.held, fuel.full)}
          {fuel.refuelAt !== null && (
            <span
              className="text-[var(--ink-soft)]"
              title={fr.supplies.refuelTitle(fr.supplies.refuelIn(fuel.refuelAt - Date.now()))}
            >
              {' '}
              +1 · {fr.supplies.refuelIn(fuel.refuelAt - Date.now())}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
