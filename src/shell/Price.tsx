import { ResourcePlate } from '@/emblems/Plate';
import type { ResourceKey } from '@/domain/ids';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';

type Costs = Readonly<Partial<Record<ResourceKey, number>>>;

/** The steel first, then the resource of the family: that is the order a price is read in. */
const ORDER: ReadonlyArray<ResourceKey> = ['steel', ...RESOURCES.filter((key) => key !== 'steel')];

/** The plate is an illustration: it keeps its texture only a few pixels above the text it leads. */
const PLATE_EXTRA = 5;

/**
 * **A price is its resources, each with its picto and its ink** (ADR 0028 §2): the same pair
 * everywhere a price is printed. The plate is the reserves' own, the number carries the
 * verdict — `lacking` turns the missing figure critical, because the resource is *what* is
 * short and the number *how much*.
 */
export function Price({
  costs,
  onPaper = true,
  lacking = null,
  held = null,
  size = 12,
  stacked = false,
}: {
  costs: Costs;
  /** False on an ink-dark ground, where the lighter inks of the plate read better. */
  onPaper?: boolean;
  lacking?: ResourceKey | null;
  /** **Le prix contre le stock** (#579) : une matière que le stock ne couvre pas s'écrit
   *  « stock/prix », en rouge ; les autres gardent leur prix seul. */
  held?: Costs | null;
  size?: number;
  /** Une ressource par ligne : la cellule étroite d'un tableau. */
  stacked?: boolean;
}) {
  // Down a table column the rows set the height: the plate keeps to the figure's own line.
  const plate = size + (stacked ? 2 : PLATE_EXTRA);
  return (
    <span
      className={`inline-flex ${stacked ? 'flex-col items-start gap-0' : 'items-center gap-[9px]'}`}
    >
      {ORDER.filter((key) => (costs[key] ?? 0) > 0).map((key) => (
        <span key={key} className="inline-flex items-center gap-[3px]" title={fr.resources[key]}>
          <ResourcePlate resource={key} height={plate} width={plate} onDark={!onPaper} />
          {held !== null && (held[key] ?? 0) < (costs[key] ?? 0) ? (
            <span style={{ color: 'var(--critical)' }}>
              {Math.floor(held[key] ?? 0)}/{costs[key]}
            </span>
          ) : (
            <span style={lacking === key ? { color: 'var(--critical)' } : undefined}>
              {costs[key]}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
