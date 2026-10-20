import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { heldRegions, type Occupation } from '../src/domain/control';
import { isStanding } from '../src/domain/outposts';
import { modeOf } from '../src/domain/season-mode';
import { playerBuildings } from './buildingReads';
import { outpostReachKm } from './constants';
import { outpostsOf, pointOf, seasonOutposts } from './movement/forces';
import { regionsWithinReach } from './regionGeometry';
import { homeCountryOf, regionFacts, regionsOf, type RegionFacts } from './regions';
import { isBlitz } from './blitz';
import { seatsOf } from './seats';
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
 * **La couleur que la production lit** (ADR 0020 §6) : celle de la carte, sauf pour le teneur de
 * **Narvik**, dont les exploitations produisent même hors réseau (P11) — chacune des régions
 * demandées lui revient alors. Un seul lecteur pour l'économie (`resources.heldFor`) et pour le
 * tampon « relié » de la vue : la règle cassée ne peut pas l'être d'un côté seulement.
 */
export async function linkingOver(
  ctx: QueryCtx,
  player: Doc<'players'>,
  regions: ReadonlyArray<RegionFacts>,
  now: number,
): Promise<ReadonlyMap<string, string>> {
  const narvik = (await seasonPoints(ctx, player.seasonId)).find((point) => point.key === 'narvik');
  if (narvik?.holderId === player._id) {
    return new Map(regions.map((region) => [region.id, player._id as string]));
  }
  return heldOver(ctx, player.seasonId, regions, now);
}

/**
 * **Le sol où il peut bâtir** : son pays, toute région qui porte un de ses bâtiments, et **le
 * cercle entier de chacun de ses avant-postes debout** (ADR 0020 §1 : là où je tiens est là où je
 * peux bâtir). Ce que la vue lui offre et le sol dont `recordLinkage` retient la couleur : une
 * seule définition, sans quoi la couleur retenue ne couvrirait pas ce que la vue demande.
 *
 * **Le disque, exactement celui de la couleur** (révision du 17/09) : `heldOver` et ce sol lisent
 * `regionsWithinReach`, la même fonction. La région du point y est toujours, à distance nulle.
 * **Un point hors service couvre encore** — il ancre toujours (§10) ; **un chantier n'atteint
 * rien** (révision du 15/09) : il n'ancre rien, donc il n'ouvre aucun sol.
 *
 * En Blitz personne ne joue chez soi : le sol est celui de ses bâtiments et de ses points.
 */
export function groundOf(
  player: Doc<'players'>,
  blitz: boolean,
  buildings: ReadonlyArray<Doc<'buildings'>>,
  outposts: ReadonlyArray<Doc<'outposts'>>,
  now: number,
): Map<string, RegionFacts> {
  const home = blitz ? null : homeCountryOf(player.nation);
  const ground = new Map((home === null ? [] : regionsOf(home)).map((facts) => [facts.id, facts]));
  for (const building of buildings) {
    const facts = regionFacts(building.regionId);
    if (facts) ground.set(facts.id, facts);
  }
  for (const outpost of outposts) {
    if (!isStanding(outpost, now)) continue;
    for (const regionId of regionsWithinReach(
      pointOf(outpost.point),
      outpostReachKm(outpost.level),
    ).keys()) {
      const facts = regionFacts(regionId);
      if (facts) ground.set(facts.id, facts);
    }
  }
  return ground;
}

/** L'empreinte d'un sol : la couleur retenue ne répond que pour le sol sur lequel on l'a lue. */
function footprintOf(ground: ReadonlyMap<string, unknown>): string {
  let hash = 0x811c9dc5;
  for (const char of [...ground.keys()].sort().join(','))
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  return `${String(ground.size)}:${(hash >>> 0).toString(36)}`;
}

/**
 * **La prochaine heure où la couleur change sans que personne n'écrive** : un chantier qui se
 * lève, une désactivation qui finit (borne inclusive, `colourReading`). Leurs travaux appellent
 * `reportChange`, mais une vue lue entre l'heure et le réveil du travail doit déjà voir la
 * vérité.
 */
function nextColourChange(outposts: ReadonlyArray<Doc<'outposts'>>, now: number): number | null {
  const edges = outposts.flatMap((outpost) => [
    ...(outpost.standsAt !== undefined && outpost.standsAt > now ? [outpost.standsAt] : []),
    ...(outpost.disabledUntil !== null && outpost.disabledUntil >= now
      ? [outpost.disabledUntil + 1]
      : []),
  ]);
  return edges.length === 0 ? null : Math.min(...edges);
}

/**
 * **La couleur de chaque siège, retenue au changement de couleur** (#144). La vue la lit au lieu
 * de relire toute la saison (`linkedOn`) ; elle sort de `linkingOver`, la règle même de la
 * production, sur le sol de `groundOf`. N'écrit que ce qui a changé : une ligne de siège écrite
 * réveille toutes les vues qui lisent les sièges.
 *
 * **Appelée par tout changement de couleur** : `reportChange` (le geste commun), `handOver` (un
 * point stratégique change de main) et `leaveTheWar` (un sol national cesse d'être tenu).
 */
export async function recordLinkage(ctx: MutationCtx, seasonId: Id<'seasons'>): Promise<void> {
  const season = await ctx.db.get(seasonId);
  if (season === null) return;
  const now = Date.now();
  const blitz = modeOf(season.mode) === 'blitz';
  const until = nextColourChange(await seasonOutposts(ctx, seasonId), now);
  for (const seat of await seatsOf(ctx, seasonId)) {
    const ground = groundOf(
      seat,
      blitz,
      await playerBuildings(ctx, seat._id),
      await outpostsOf(ctx, seat._id),
      now,
    );
    const held = await linkingOver(ctx, seat, [...ground.values()], now);
    const linkage = {
      ground: footprintOf(ground),
      unlinked: [...ground.keys()].filter((regionId) => held.get(regionId) !== seat._id),
      until,
    };
    const kept = seat.linkage;
    if (
      kept === undefined ||
      kept.ground !== linkage.ground ||
      kept.until !== linkage.until ||
      kept.unlinked.join() !== linkage.unlinked.join()
    ) {
      await ctx.db.patch(seat._id, { linkage });
    }
  }
}

/**
 * **La couleur de son sol, telle que la vue la sert** : celle que le dernier changement de couleur
 * a retenue, quand elle a été lue sur ce sol-là et qu'aucune heure n'a passé depuis ; la vérité
 * sinon (`linkingOver`). Rendue sous la forme que l'économie lit (`isLinked`) : la région, et
 * lui pour teneur quand elle porte sa couleur.
 */
export async function linkedOn(
  ctx: QueryCtx,
  player: Doc<'players'>,
  ground: ReadonlyMap<string, RegionFacts>,
  now: number,
): Promise<ReadonlyMap<string, string>> {
  const linkage = player.linkage;
  if (
    linkage === undefined ||
    linkage.ground !== footprintOf(ground) ||
    (linkage.until !== null && now >= linkage.until)
  ) {
    return linkingOver(ctx, player, [...ground.values()], now);
  }
  const unlinked = new Set(linkage.unlinked);
  return new Map(
    [...ground.keys()].flatMap((regionId) =>
      unlinked.has(regionId) ? [] : [[regionId, player._id as string] as const],
    ),
  );
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
  /** **Un éliminé n'a plus de sol** (M16) : son QG tombé, sa nation ne tient plus rien que ses
   *  irréguliers ne tiennent à sa place. Qui a seulement capitulé garde le sien. */
  return seats.flatMap((seat) => {
    const country = homeCountryOf(seat.nation);
    return country === null || (seat.eliminatedAt ?? null) !== null
      ? []
      : [{ owner: seat._id as string, country }];
  });
}
