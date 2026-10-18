import { ResourceIcon, resourceColor, type ResourceKey } from '@/emblems/ResourceIcon';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';

type Costs = Readonly<Partial<Record<ResourceKey, number>>>;

/** The steel first, then the resource of the family: that is the order a price is read in. */
const ORDER: ReadonlyArray<ResourceKey> = ['steel', ...RESOURCES.filter((key) => key !== 'steel')];

/**
 * **A price is its resources, each with its picto and its ink** (ADR 0028 §2): the same pair
 * everywhere a price is printed. The silhouette carries the colour, the number carries the
 * verdict — `lacking` turns the missing figure critical, because the resource is *what* is
 * short and the number *how much*.
 */
export function Price({
  costs,
  onPaper = true,
  lacking = null,
  size = 12,
}: {
  costs: Costs;
  /** False on an ink-dark ground, where the lighter inks of the plate read better. */
  onPaper?: boolean;
  lacking?: ResourceKey | null;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-[9px]">
      {ORDER.filter((key) => (costs[key] ?? 0) > 0).map((key) => (
        <span key={key} className="inline-flex items-center gap-[3px]" title={fr.resources[key]}>
          <span className="flex" style={{ color: resourceColor(key, onPaper) }}>
            <ResourceIcon resource={key} size={size} />
          </span>
          <span style={lacking === key ? { color: 'var(--critical)' } : undefined}>
            {costs[key]}
          </span>
        </span>
      ))}
    </span>
  );
}
