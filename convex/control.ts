import { v } from 'convex/values';
import { query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { coveredRegions, knownRegions, seatInk, type KnownRegion } from '../src/domain/control';
import { allRegions, homeCountryOf, regionsOf } from './regions';
import { playerByToken } from './seasons';
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
 */
export const held = query({
  args: { token: v.string() },
  handler: (ctx, { token }) => heldOf(ctx, token),
});

/** La même carte, en fonction, pour que l'export de l'état de référence (`dev.snapshot`) serve
 *  ce que le plateau lit et non une seconde lecture qui en divergerait. */
export async function heldOf(ctx: QueryCtx, token: string) {
  // Le jeton authentifie et cloisonne : c'est la saison du joueur qu'on lit, jamais la table.
  const { player, season } = await playerByToken(ctx, token);
  const seats = await ctx.db
    .query('players')
    .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
    .collect();

  /**
   * **L'encre suit le siège, dans l'ordre des entrées.** Rien n'est stocké là non plus : un
   * joueur ne quitte jamais une saison — on la détruit entière (`seasons.destroy`) — donc son
   * rang d'entrée est aussi stable qu'un champ, et un champ de plus serait une seconde vérité
   * à tenir d'accord avec la première.
   */
  const ordered = [...seats].sort((left, right) => left._creationTime - right._creationTime);
  const inkOf = new Map(ordered.map((seat, rank) => [seat._id, seatInk(rank)]));

  /** **Son sol, et le sien seul.** Il n'a pas besoin de s'observer lui-même : une nation n'est
   *  jamais annexée (ADR 0004), donc rien ne peut s'y périmer. Le sol des autres, lui, se
   *  relève comme n'importe quel sol — savoir qui joue l'Allemagne ne dit pas où elle tient. */
  const home = homeCountryOf(player.nation);

  /** **Ce qu'une de ses portées couvre à l'instant**, lu sur ses propres index et rien d'autre :
   *  il est sur place, donc la date n'y apprendrait rien et la couleur y reste franche. */
  const covered = coveredRegions(allRegions(), await standingObserversOf(ctx, player._id));

  const surveys = await ctx.db
    .query('regionSightings')
    .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
    .collect();

  const known = knownRegions({
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

  /** Par tenant, et les mains vides ne voyagent pas : un siège dont ce joueur ne connaît rien
   *  ne tient rien *pour lui*, et une ligne vide serait une couleur de plus dans la légende. */
  const byHolder = new Map<string, Array<KnownRegion>>();
  for (const region of known) {
    const kept = byHolder.get(region.owner) ?? [];
    kept.push(region);
    byHolder.set(region.owner, kept);
  }

  return ordered.flatMap((seat) => {
    const regions = byHolder.get(seat._id) ?? [];
    if (regions.length === 0) return [];
    return [
      {
        playerId: seat._id,
        nation: seat.nation,
        nickname: seat.nickname,
        ink: inkOf.get(seat._id)!,
        regions: regions.map((region) =>
          region.state === 'current'
            ? { id: region.regionId, state: 'current' as const }
            : { id: region.regionId, state: 'surveyed' as const, seenAt: region.seenAt },
        ),
      },
    ];
  });
}
