import { resourceColor } from '@/emblems/resource-color';
import { SUPPLY_KEYS, loadTotal, type SupplyLoad } from '@/domain/logistics';
import { fr } from '@/i18n/fr';
import { useMapMotion } from '@/data/mapMotion';

/**
 * **Une charge, une barre découpée par couleur** (ADR 0028, précision du 18/10) : munitions,
 * pétrole et charbon côte à côte dans la seule charge maximale d'un dépôt ou d'un transport, et
 * le total en regard. Les jetons ne sont qu'une animation ; le compte se lit ici.
 */
export function ChargeBar({
  load,
  capacity,
  width = 72,
}: {
  load: SupplyLoad;
  capacity: number;
  width?: number;
}) {
  const total = loadTotal(load);
  /** La barre glisse selon le réglage : actives, réduites, coupées. */
  const motion = useMapMotion();
  const transition =
    motion === 'off' ? 'none' : `width ${motion === 'reduced' ? 150 : 500}ms ease-out`;
  const said = SUPPLY_KEYS.filter((key) => load[key] > 0)
    .map((key) => `${load[key]} ${fr.resources[key]}`)
    .join(', ');
  return (
    <span
      className="charge-bar inline-flex items-center gap-[4px] font-(family-name:--font-mono) text-[10px]"
      title={fr.logistics.chargeTitle(said, total, capacity)}
    >
      <span
        aria-hidden
        className="flex h-[6px] overflow-hidden bg-(--ink)/14 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ink)_35%,transparent)]"
        style={{ width }}
      >
        {SUPPLY_KEYS.map((key) => (
          <i
            key={key}
            className="block h-full"
            style={{
              transition,
              width: `${capacity > 0 ? (load[key] / capacity) * 100 : 0}%`,
              background: resourceColor(key, true),
            }}
          />
        ))}
      </span>
      <span style={total >= capacity ? { color: 'var(--notable-paper)' } : undefined}>
        {total}/{capacity}
      </span>
    </span>
  );
}
