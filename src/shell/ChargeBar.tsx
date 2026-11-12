import { resourceColor } from '@/emblems/resource-color';
import { RESOURCES, type ResourceKey } from '@/domain/ids';
import type { HarvestLoad, SupplyLoad } from '@/domain/logistics';
import { fr } from '@/i18n/fr';
import { useMapMotion } from '@/data/mapMotion';

/**
 * **Une charge, une barre découpée par couleur** (ADR 0028, précision du 18/10) : munitions,
 * pétrole et charbon côte à côte dans la seule charge maximale d'un dépôt ou d'un transport, et
 * le total en regard. Les jetons ne sont qu'une animation ; le compte se lit ici.
 */
export function ChargeBar({
  load,
  harvest,
  capacity,
  width = 72,
}: {
  load: SupplyLoad;
  /** **La récolte à bord** (ADR 0041) : elle prend sa part de la même capacité, par ressource. */
  harvest?: HarvestLoad | undefined;
  capacity: number;
  width?: number;
}) {
  /** Ce que la barre compte, par ressource : la charge d'abord, la récolte ensuite, en unités
   *  entières (la récolte à bord croît au fil de l'eau). */
  const held = Object.fromEntries(
    RESOURCES.map((key) => [
      key,
      Math.floor(
        ((load as Partial<Record<ResourceKey, number>>)[key] ?? 0) + (harvest?.[key] ?? 0),
      ),
    ]),
  ) as Record<ResourceKey, number>;
  const total = RESOURCES.reduce((sum, key) => sum + held[key], 0);
  /** La barre glisse selon le réglage : actives, réduites, coupées. */
  const motion = useMapMotion();
  const transition =
    motion === 'off' ? 'none' : `width ${motion === 'reduced' ? 150 : 500}ms ease-out`;
  const said = RESOURCES.filter((key) => held[key] > 0)
    .map((key) => `${held[key]} ${fr.resources[key]}`)
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
        {RESOURCES.map((key) => (
          <i
            key={key}
            className="block h-full"
            style={{
              transition,
              width: `${capacity > 0 ? (held[key] / capacity) * 100 : 0}%`,
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
