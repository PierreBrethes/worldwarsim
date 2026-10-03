import { RESOURCES } from '@/domain/ids';
import type { CargoView } from '@/domain/player-view';
import { ResourceIcon, resourceColor } from '@/emblems/ResourceIcon';
import { fr } from '@/i18n/fr';

/** Exact owner-only load. The server groups connected carriers; this component never divides it. */
export function CargoReadout({ cargo, carriers }: { cargo: CargoView; carriers: number }) {
  if (cargo.carried <= 0) return null;
  return (
    <div className="mt-[9px] border-t border-(color:--ink)/32 pt-[8px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[9px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
          {fr.loot.sharedCargo(carriers)}
        </span>
        <span className="font-(family-name:--font-mono) text-[10.5px] text-[var(--ink)]">
          {fr.loot.cargoCapacity(cargo.carried, cargo.capacity)}
        </span>
      </div>
      <ResourceAmounts amounts={cargo.loot} />
      {cargo.free > 0 && (
        <p className="mt-[4px] font-(family-name:--font-mono) text-[10px] text-[var(--ink-quiet)]">
          {fr.loot.freeCapacity(cargo.free)}
        </p>
      )}
    </div>
  );
}

export function ResourceAmounts({ amounts }: { amounts: CargoView['loot'] }) {
  const rows = RESOURCES.filter((resource) => amounts[resource] > 0);
  return (
    <div className="mt-[6px] flex flex-wrap gap-x-[10px] gap-y-[5px]">
      {rows.map((resource) => (
        <span key={resource} className="flex items-center gap-[4px]" title={fr.resources[resource]}>
          <span className="flex" style={{ color: resourceColor(resource, true) }}>
            <ResourceIcon resource={resource} size={12} />
          </span>
          <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink)]">
            {amounts[resource]}
          </span>
        </span>
      ))}
    </div>
  );
}
