import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { heldRegions, type Occupation } from '../src/domain/control';
import { isStanding } from '../src/domain/outposts';
import { outpostReachKm } from './constants';
import { pointOf, seasonOutposts } from './movement/forces';
import { regionsWithinReach } from './regionGeometry';
import { homeCountryOf, type RegionFacts } from './regions';
import { isBlitz } from './blitz';
import { seasonPoints } from './strategicPoints';

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
    outposts: (await seasonOutposts(ctx, seasonId)).map((outpost) => colourReading(outpost, now)),
    homeGrounds: await homeGroundsOf(ctx, seasonId),
    occupations: await occupationsOf(ctx, seasonId),
  });
}

/**
 * Les bâtiments capturés de la saison, lus sur leur seul intervalle d'index (`capturedAt`), et
 * les points stratégiques tenus : **un point colore sa région pour son teneur** (P1), sans y
 * ouvrir de chantier ni y ravitailler personne — ni l'un ni l'autre ne lit la couleur.
 */
export async function occupationsOf(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<ReadonlyArray<Occupation>> {
  const captured = (
    await ctx.db
      .query('buildings')
      .withIndex('bySeasonCaptured', (q) => q.eq('seasonId', seasonId).gt('capturedAt', 0))
      .collect()
  ).map((building) => ({ regionId: building.regionId, owner: building.playerId as string }));
  const held = (await seasonPoints(ctx, seasonId)).flatMap((point) =>
    point.holderId === null ? [] : [{ regionId: point.regionId, owner: point.holderId as string }],
  );
  return [...captured, ...held];
}

/**
 * Un avant-poste tel que la couleur le lit. L'heure n'entre que pour une question — est-il hors
 * service — et c'est l'appelant qui la porte : le domaine ne date rien (§7).
 *
 * **La région où il se tient n'est plus une ligne à part** : sa cellule est dans son disque, à
 * distance nulle, donc la précision du 04/09 sort d'ici sans rien perdre (révision du 17/09).
 *
 * **Un chantier a la même signature qu'un point hors service** (révision du 15/09) : il ne
 * colore rien tant qu'il n'est pas levé. Sans l'immunité, elle : on attaque un chantier.
 *
 * **La borne est inclusive**, et c'est la fin de la désactivation qui l'exige. Elle se règle à
 * `disabledUntil` exactement (`convex/production.ts`) : lue de façon stricte, ce règlement-là
 * trouverait le point déjà revenu et créditerait au plein débit toutes les heures où il était
 * hors service. Une milliseconde, qui referme la fenêtre sur elle-même.
 */
export const colourReading = (outpost: Doc<'outposts'>, now: number) => ({
  owner: outpost.playerId as string,
  /** **Le disque, et non le pôle** (révision du 17/09) : la mesure est faite une fois par point,
   *  mémoïsée par l'isolat, et c'est la même que la vue lit pour offrir le sol à bâtir. */
  covers: regionsWithinReach(pointOf(outpost.point), outpostReachKm(outpost.level)),
  disabled:
    !isStanding(outpost, now) || (outpost.disabledUntil !== null && outpost.disabledUntil >= now),
});

/**
 * **Ce qu'un point tient à lui seul** — les régions qui changeraient de main s'il n'était plus
 * debout. Une soustraction et rien d'autre : la carte que ce point debout donne, moins celle
 * qu'il donne couché, gardée sur les seules régions qui reviennent à son propriétaire. Aucune
 * seconde règle n'est écrite ici, donc aucune ne peut diverger de `heldRegions` le jour où la
 * portée change.
 *
 * **Deux lecteurs, deux questions qui n'en font qu'une** (16/09) : la zone hachurée d'un point
 * hors service (`control.held`, ADR 0020 §7) et la couleur qu'un démantèlement fait perdre
 * (`outposts.dismantle`). Le premier interroge un point couché, le second un point debout, et la
 * différence répond aux deux — c'est la même question posée dans les deux sens.
 *
 * **Sur les seuls points du joueur.** L'appelant tend ce qu'il a lu de son propre index : la
 * requête de la carte n'a pas le droit de lire la vérité des autres (`brouillard-et-fanout.md`),
 * et un avant-poste adverse qui disputerait la région ne change pas ce que **celui-ci** tient —
 * il change à qui elle revient après, ce qui n'est pas la question posée ici.
 */
export function soleHoldOf({
  regions,
  outposts,
  outpost,
  homeGrounds,
  occupations = [],
  now,
}: {
  readonly regions: ReadonlyArray<RegionFacts>;
  readonly occupations?: ReadonlyArray<Occupation>;
  readonly outposts: ReadonlyArray<Doc<'outposts'>>;
  readonly outpost: Doc<'outposts'>;
  readonly homeGrounds: ReadonlyArray<{ owner: string; country: string }>;
  readonly now: number;
}): ReadonlyArray<string> {
  const readings = outposts.map((candidate) => colourReading(candidate, now));
  const swap = (disabled: boolean) =>
    heldRegions({
      regions,
      occupations,
      outposts: readings.map((reading, rank) =>
        outposts[rank]!._id === outpost._id ? { ...reading, disabled } : reading,
      ),
      homeGrounds,
    });
  const without = swap(true);
  const owner = outpost.playerId as string;
  return [...swap(false)].flatMap(([regionId, holder]) =>
    holder === owner && !without.has(regionId) ? [regionId] : [],
  );
}

/** Le sol d'origine des sièges de la saison — ce qu'aucun avant-poste ne prend (ADR 0004). */
export async function homeGroundsOf(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<ReadonlyArray<{ owner: string; country: string }>> {
  /** **En Blitz personne ne joue chez soi** : un Français joue le Pacifique, et ce qu'il tient
   *  est ce qu'il a reçu ou capturé (`occupationsOf`), jamais son sol national. */
  if (await isBlitz(ctx, seasonId)) return [];
  const seats = await ctx.db
    .query('players')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();
  return seats.flatMap((seat) => {
    const country = homeCountryOf(seat.nation);
    return country === null ? [] : [{ owner: seat._id as string, country }];
  });
}
