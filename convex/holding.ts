import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { heldRegions } from '../src/domain/control';
import { isStanding } from '../src/domain/outposts';
import { outpostReachKm } from './constants';
import { pointOf, seasonOutposts } from './movement/forces';
import { homeCountryOf, regionOfOutpost, type RegionFacts } from './regions';

/**
 * **La vérité de la couleur, en un seul endroit.** Qui tient quoi se calcule depuis les
 * avant-postes debout et le sol d'origine des sièges (`heldRegions`, ADR 0020 §1) ; ce module
 * n'ajoute rien à la règle — il tend à la fonction pure les lignes de la base, une fois, pour
 * les **quatre** lecteurs qui en dépendent : le relevé du sol (`surveys.ts`), le classement
 * (`press.ts`), la production reliée (`resources.ts`, §6) et la vue (`view.ts`).
 *
 * Trois recopies de ce dépliage vivaient déjà côte à côte, et une quatrième pour la production
 * aurait été celle de trop : le jour où un avant-poste hors service cesse de colorer (§7), une
 * seule des quatre l'aurait appris. Une lecture, une réponse.
 *
 * **Sur les régions demandées, jamais sur le planisphère par défaut.** Le classement dépouille
 * les 4 589 régions cuites parce que c'est sa question ; la production n'en regarde que la
 * poignée qui porte des bâtiments, et lui faire mesurer le monde entier à chaque règlement de
 * stock serait payer un dépouillement pour une adresse.
 */
export async function heldOver(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
  regions: ReadonlyArray<RegionFacts>,
  now: number,
): Promise<ReadonlyMap<string, string>> {
  if (regions.length === 0) return new Map();
  return heldRegions({
    regions,
    outposts: (await seasonOutposts(ctx, seasonId)).map((outpost) => reading(outpost, now)),
    homeGrounds: await homeGroundsOf(ctx, seasonId),
  });
}

/**
 * Un avant-poste tel que la couleur le lit. L'heure n'entre que pour une question — est-il hors
 * service — et c'est l'appelant qui la porte : le domaine ne date rien (§7).
 *
 * **Un chantier a la même signature qu'un point hors service** (révision du 15/09) : il ne
 * colore rien tant qu'il n'est pas levé. Sans l'immunité, elle : on attaque un chantier.
 *
 * **La borne est inclusive**, et c'est la fin de la désactivation qui l'exige. Elle se règle à
 * `disabledUntil` exactement (`convex/production.ts`) : lue de façon stricte, ce règlement-là
 * trouverait le point déjà revenu et créditerait au plein débit toutes les heures où il était
 * hors service. Une milliseconde, qui referme la fenêtre sur elle-même.
 */
const reading = (outpost: Doc<'outposts'>, now: number) => ({
  owner: outpost.playerId as string,
  point: pointOf(outpost.point),
  reachKm: outpostReachKm(outpost.level),
  regionId: regionOfOutpost(outpost),
  disabled:
    !isStanding(outpost, now) || (outpost.disabledUntil !== null && outpost.disabledUntil >= now),
});

/** Le sol d'origine des sièges de la saison — ce qu'aucun avant-poste ne prend (ADR 0004). */
export async function homeGroundsOf(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<ReadonlyArray<{ owner: string; country: string }>> {
  const seats = await ctx.db
    .query('players')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();
  return seats.flatMap((seat) => {
    const country = homeCountryOf(seat.nation);
    return country === null ? [] : [{ owner: seat._id as string, country }];
  });
}
