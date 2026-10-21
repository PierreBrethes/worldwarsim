import { FUEL_STEP_KM } from '../../convex/constants';
import { ResourcePlate } from '@/emblems/Plate';
import type { PileSupplies } from '@/domain/supplies';
import { fr } from '@/i18n/fr';

/**
 * **Coups et plein, en deux pictos** (ADR 0028 §3) : la planche des munitions et celle du carburant de la troupe (les mêmes que les réserves), chacune suivie
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
  const plate = size + 5;
  const count = (held: number, full: number) => (
    <span style={held === 0 ? { color: 'var(--critical)' } : undefined}>
      {held}/{full}
    </span>
  );
  return (
    <span className="supply-pictos inline-flex flex-wrap items-center gap-x-[8px] font-(family-name:--font-mono)">
      {rounds !== null && (
        <span
          className="inline-flex items-center gap-[2px]"
          title={fr.supplies.roundsTitle(rounds.held, rounds.full)}
          aria-label={`${fr.supplies.rounds} ${rounds.held}/${rounds.full}`}
        >
          <ResourcePlate resource="ammunition" height={plate} width={plate} onDark={!onPaper} />
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
          <ResourcePlate resource={fuel.resource} height={plate} width={plate} onDark={!onPaper} />
          {count(fuel.held, fuel.full)}
        </span>
      )}
      {fuel?.refuelAt != null && (
        <span
          className="whitespace-nowrap text-[var(--ink-soft)]"
          title={fr.supplies.refuelTitle(fr.supplies.refuelIn(fuel.refuelAt - Date.now()))}
        >
          {' '}
          +1 · {fr.supplies.refuelIn(fuel.refuelAt - Date.now())}
        </span>
      )}
    </span>
  );
}
