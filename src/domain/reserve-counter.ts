import { currentStock, type Resource } from './player-view';

/**
 * **Le compteur des réserves** (POC « compteur », validé par Pierre le 13/10) : le chiffre de la
 * réglette ne suit plus l'horloge, il s'annonce. Chaque réserve tire son propre instant entre
 * trente secondes et une minute après la précédente, et dit ce qu'elle a gagné depuis ; un gain que le débit n'explique pas (dépôt, butin, caisse,
 * remboursement) s'annonce dès que la vue l'apporte. Le chiffre affiché est en retard sur le
 * stock — au-dessus de lui sous un débit négatif, jusqu'à l'annonce : la jauge, l'alerte et le
 * libellé accessible lisent le stock réel.
 */
const ANNOUNCE_MIN_MS = 30_000;
const ANNOUNCE_SPREAD_MS = 30_000;

export const nextAnnounceIn = (random: () => number = Math.random): number =>
  ANNOUNCE_MIN_MS + random() * ANNOUNCE_SPREAD_MS;

export type Announcement = { readonly shown: number; readonly gain: number };

/** Ce qu'une réserve dit à son instant. `null` : rien n'a bougé d'une unité, et ce qui
 *  s'accumule attend l'annonce suivante. */
export const announceOf = (shown: number, stockNow: number): Announcement | null =>
  stockNow === shown ? null : { shown: stockNow, gain: stockNow - shown };

type Reading = { readonly reserve: Resource; readonly at: number };

/**
 * Une vue neuve, comparée à ce que l'ancienne prédisait à son instant. Au-delà du débit d'une
 * unité au moins, c'est un gain qui s'annonce tout de suite — avec ce qui attendait, puisque le
 * chiffre roule d'autant ;
 * sous un chiffre resté au-dessus du stock (débit négatif), il descend sans étiquette. En deçà, c'est une dépense : elle se retire du chiffre sans étiquette,
 * et la production en attente reste en attente. `gain` vaut 0 quand il n'y a rien à dire.
 */
export function onNewView(shown: number, before: Reading, after: Reading): Announcement {
  const stockNow = currentStock(after.reserve, after.at, after.at);
  const surprise = stockNow - currentStock(before.reserve, before.at, after.at);
  if (surprise >= 1) return { shown: stockNow, gain: Math.max(0, stockNow - shown) };
  if (surprise <= -1) return { shown: Math.max(0, Math.min(stockNow, shown + surprise)), gain: 0 };
  return { shown, gain: 0 };
}
