import type { Id } from '../../convex/_generated/dataModel';

/**
 * **Une notification ouvre la saison qu'elle nomme**, pas celle que le stockage local retenait
 * (`season` dans l'adresse du plateau). Si le compte y tient une place elle devient la place
 * active — même écriture que le choix au salon —, sinon le paramètre est ignoré sans bruit : une
 * adresse périmée ou forgée ne doit rien changer. Rend vrai quand la saison a été adoptée.
 */
export async function adoptSeason(
  season: string,
  {
    token,
    seatsOf,
    keepSeat,
  }: {
    token: string | null;
    seatsOf: (token: string) => Promise<ReadonlyArray<{ readonly seasonId: Id<'seasons'> }>>;
    keepSeat: (seasonId: Id<'seasons'>) => void;
  },
): Promise<boolean> {
  if (token === null) return false;
  try {
    const held = (await seatsOf(token)).find((seat) => seat.seasonId === season);
    if (held === undefined) return false;
    keepSeat(held.seasonId);
    return true;
  } catch {
    return false;
  }
}
