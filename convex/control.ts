import { v } from 'convex/values';
import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { knownRegions, type KnownRegion } from '../src/domain/control';
import { nationInk } from '../src/domain/nations';
import { isStanding } from '../src/domain/outposts';
import { isBlitz } from './blitz';
import { homeGroundsOf, occupationsOf, soleHoldOf } from './holding';
import { outpostsOf } from './movement/forces';
import { allRegions, homeCountryOf, regionFacts, regionsOf } from './regions';
import { playerOf, seatsOf } from './seats';
import { regionsCoveredBy } from './regionGeometry';
import { standingObserversOf } from './surveys';

/**
 * **La carte qu'un joueur a relevée** (ADR 0020 §5) — pas la vérité, et c'est toute la règle. La
 * promesse de l'ADR 0004 (« la carte qui se colore ») tenue de la seule façon que l'ADR 0005
 * autorise : on voit son dernier relevé, daté, et il peut être faux.
 *
 * **Une query à part, jamais un champ de `PlayerView`.** La vue d'un joueur est déjà invalidée
 * par la moindre troupe qui bouge — c'est le risque connu du fan-out
 * (`technique/brouillard-et-fanout.md`) — alors que sa carte ne change que quand il regarde.
 * Les coudre ensemble ferait relire les 4 589 régions à chaque pas d'une colonne.
 *
 * **La vérité n'entre pas ici.** Aucune lecture de la table des avant-postes, aucun filtre de ce
 * que les autres tiennent : cette requête ne dépend que des lignes du joueur — son relevé, ses
 * points, ses troupes, ses bâtiments — et de la table des sièges, pour l'encre et les noms.
 * C'était le piège nommé dans `brouillard-et-fanout.md` : une requête « ce que je connais » qui
 * filtrerait la vérité se recalculerait pour **tous** les joueurs à chaque fondation. Ce qui
 * écrit le relevé, ce sont les événements (`convex/surveys.ts`).
 *
 * Trois états, et le premier n'est pas une couleur : une région **vierge** n'est pas renvoyée —
 * inconnue, jamais neutre.
 *
 * **Et une quatrième forme, servie à son seul propriétaire** : `suspended`, ce qu'un de ses
 * avant-postes hors service tiendrait s'il était debout (§7). Ce n'est pas une possession — le
 * classement, la production et la vérité l'ignorent — c'est le souvenir d'une couleur, que la
 * carte hachure au lieu de l'effacer.
 */
export const held = query({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: (ctx, { token, seasonId }) => heldOf(ctx, token, seasonId),
});

/** La même carte, en fonction, pour que l'export de l'état de référence (`dev.snapshot`) serve
 *  ce que le plateau lit et non une seconde lecture qui en divergerait. */
export async function heldOf(ctx: QueryCtx, token: string, seasonId: Id<'seasons'>) {
  // La session authentifie et la place cloisonne : c'est la saison du joueur qu'on lit, jamais
  // la table.
  const { player, season } = await playerOf(ctx, token, seasonId);
  const seats = await seatsOf(ctx, season._id);

  /** L'ordre des entrées ne sert plus qu'à ranger la réponse : stable, il garde la légende en
   *  place d'un battement à l'autre. */
  const ordered = [...seats].sort((left, right) => left._creationTime - right._creationTime);
  const homeGrounds = await homeGroundsOf(ctx, season._id);

  /** **Son sol, et le sien seul.** Il n'a pas besoin de s'observer lui-même : une nation n'est
   *  jamais annexée (ADR 0004), donc rien ne peut s'y périmer. Le sol des autres, lui, se
   *  relève comme n'importe quel sol — savoir qui joue l'Allemagne ne dit pas où elle tient. */
  const home = (await isBlitz(ctx, seasonId)) ? null : homeCountryOf(player.nation);

  /** **Ce qu'une de ses portées couvre à l'instant**, lu sur ses propres index et rien d'autre :
   *  il est sur place, donc la date n'y apprendrait rien et la couleur y reste franche. */
  const covered = regionsCoveredBy(await standingObserversOf(ctx, player._id));

  const surveys = await ctx.db
    .query('regionSightings')
    .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
    .collect();

  /** **Une occupation se sait de deux côtés** : chez qui tient le bâtiment, et chez qui a perdu
   *  ce sol-là. Un tiers ne l'apprend que par son relevé. */
  const occupied = new Map(
    (await occupationsOf(ctx, season._id))
      .filter(
        ({ regionId, owner }) =>
          owner === player._id || (home !== null && regionFacts(regionId)?.country === home),
      )
      .map(({ regionId, owner }) => [regionId, owner]),
  );

  const known = knownRegions({
    occupied,
    home: {
      owner: player._id,
      regionIds: home === null ? [] : regionsOf(home).map((region) => region.id),
    },
    covered,
    surveys: surveys.map(({ regionId, ownerId, seenAt }) => ({
      regionId,
      owner: ownerId,
      seenAt,
    })),
  });

  /** **Ce que ses points hors service tiendraient s'ils étaient debout** (§7) — lu avant le
   *  regroupement, parce qu'il en retire ses propres lignes : un relevé d'hier dit encore que ce
   *  sol est à lui, et le peindre plein pendant la désactivation serait le mensonge que la
   *  hachure existe pour éviter. */
  const suspended = await suspendedRegionsOf(ctx, player._id, homeGrounds, [
    ...(await occupationsOf(ctx, season._id)),
  ]);

  /** Par tenant, et les mains vides ne voyagent pas : un siège dont ce joueur ne connaît rien
   *  ne tient rien *pour lui*, et une ligne vide serait une couleur de plus dans la légende. */
  const byHolder = new Map<string, Array<KnownRegion>>();
  for (const region of known) {
    if (region.owner === player._id && suspended.has(region.regionId)) continue;
    const kept = byHolder.get(region.owner) ?? [];
    kept.push(region);
    byHolder.set(region.owner, kept);
  }

  return ordered.flatMap((seat) => {
    const regions = byHolder.get(seat._id) ?? [];
    /** **La suspension n'est servie qu'à son propriétaire** (ADR 0005) : à l'adversaire qui
     *  observe la zone, elle se lit décolorée comme n'importe quel sol que personne ne tient —
     *  lui donner l'heure du retour lui donnerait la durée d'un raid qu'il n'a pas mené. */
    const mine = seat._id === player._id ? [...suspended] : [];
    if (regions.length === 0 && mine.length === 0) return [];
    return [
      {
        playerId: seat._id,
        nation: seat.nation,
        nickname: seat.nickname,
        /** **L'encre est celle de la nation** (palette des nations, 14/10/2026) : une nation
         *  n'a qu'une place par saison, et une seconde encre — celle du rang d'entrée —
         *  peignait le sol tenu d'une couleur et le sol bâti d'une autre. */
        ink: nationInk(seat.nation),
        regions: [
          ...regions.map((region) =>
            region.state === 'current'
              ? { id: region.regionId, state: 'current' as const }
              : { id: region.regionId, state: 'surveyed' as const, seenAt: region.seenAt },
          ),
          ...mine.map(([id, until]) => ({ id, state: 'suspended' as const, until })),
        ],
      },
    ];
  });
}

/**
 * **Le souvenir d'une couleur, et la promesse de son retour** (ADR 0020 §7). Un avant-poste hors
 * service ne tient rien — le classement ne le compte pas, ce qu'il couvre ne produit plus, une
 * région disputée revient au voisin — mais sa zone disparaissait de la carte, et son propriétaire
 * n'avait plus rien à lire là où il tenait la veille. Ce n'est pas une couleur de plus : c'est la
 * même, hachurée, et elle ne doit rien reprendre au classement.
 *
 * **La même règle, lue deux fois.** La différence entre la carte telle qu'elle est et la carte
 * qu'un seul point relevé debout donnerait *est* ce que ce point tiendrait — aucune seconde règle
 * n'est écrite ici, donc aucune ne peut diverger de `heldRegions` le jour où la portée change.
 * Une lecture de plus par point hors service, et il n'y en a qu'une poignée.
 *
 * **Ses points, et les siens seuls.** La requête reste ce qu'elle doit être : une lecture des
 * lignes de ce joueur (`brouillard-et-fanout.md`). Les sols d'origine entrent parce qu'ils sont
 * publics et qu'ils l'emportent sur tout avant-poste (ADR 0004) — sans eux, un point hors service
 * planté chez un voisin hachurerait un sol qu'il n'a jamais tenu.
 */
async function suspendedRegionsOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  homeGrounds: ReadonlyArray<{ owner: string; country: string }>,
  occupations: ReadonlyArray<{ regionId: string; owner: string }>,
): Promise<ReadonlyMap<string, number>> {
  const now = Date.now();
  const outposts = await outpostsOf(ctx, playerId);
  /** **Un chantier n'est pas hors service** (révision du 15/09) : il n'a pas de couleur à se
   *  rappeler, il a une heure à attendre — et le mât la porte déjà. */
  const halted = outposts.filter(
    (outpost) =>
      isStanding(outpost, now) && outpost.disabledUntil !== null && outpost.disabledUntil >= now,
  );
  if (halted.length === 0) return new Map();

  const regions = allRegions();
  const suspended = new Map<string, number>();
  for (const outpost of halted) {
    for (const regionId of soleHoldOf({
      regions,
      outposts,
      outpost,
      homeGrounds,
      occupations,
      now,
    })) {
      /** Deux points hors service qui couvrent la même région : la couleur revient au premier
       *  des deux, et c'est la seule date qu'il y ait à promettre. */
      const already = suspended.get(regionId);
      if (already === undefined || outpost.disabledUntil! < already) {
        suspended.set(regionId, outpost.disabledUntil!);
      }
    }
  }
  return suspended;
}
