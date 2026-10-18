import type { ResourceKey } from '@/domain/ids';
import ammunition from './ammunition.webp';
import coal from './coal.webp';
import food from './food.webp';
import oil from './oil.webp';
import steel from './steel.webp';

/**
 * The illustrated plates of the five resources, cut and normalised by height by
 * `WWS/sprites/optimiser.py --recadrer`. **They do not replace `ResourceIcon`** — the two sets
 * coexist on purpose: an illustration loses its texture at 13 px, so the vector holds the
 * banner and the plate holds the surfaces that have room for it (ADR 0015 art direction,
 * `WWS/sprites/README.md`).
 *
 * The plates carry their own ink and take no tint: they are objects seen on paper, not
 * silhouettes coloured by a caller — which is exactly why `resourceColor` still exists for the
 * vector and has nothing to say here.
 *
 * The `Record` is complete: a resource added to the domain without a plate stops the
 * compilation, and a missing visual is written `null` explicitly, never by omission.
 */
export const RESOURCE_PLATES: Readonly<Record<ResourceKey, string | null>> = {
  food,
  steel,
  coal,
  oil,
  ammunition,
};

export const resourcePlate = (key: ResourceKey): string | null => RESOURCE_PLATES[key];

/**
 * **There is no per-plate size correction here, and there must not be one.** The bandage roll, since
 * retired, did read as the small one of the eight, and the cause was in the export rather than in the
 * drawing: its source carried a haze of alpha 1 to 3 across the bottom of the frame, which
 * defeated the crop and left the subject at 70 % of a canvas the other seven filled. The fix
 * is `optimiser.py --recadrer`, which now reads the alpha channel alone.
 *
 * A scale table would have hidden that — the roll would have looked right and stayed wrong,
 * and the next plate off the generator with the same haze would have earned a second entry.
 * A plate that reads small is an export to re-run, never a number to add.
 */
