import { v } from 'convex/values';
import { query } from './_generated/server';
import { heldRegions, seatInk } from '../src/domain/control';
import { OUTPOST_REACH_KM } from './constants';
import { pointOf } from './movement/forces';
import { allRegions, homeCountryOf } from './regions';
import { playerByToken } from './seasons';

/**
 * **La carte qui se colore** (ADR 0020 §1) — la promesse de l'ADR 0004, tenue quatre mois après
 * le point qu'elle justifiait. La règle est dans `src/domain/control.ts`, pure et testée sans
 * base ; ici il n'y a que le branchement.
 *
 * **Une query à part, jamais un champ de `PlayerView`.** La vue d'un joueur est déjà invalidée
 * par la moindre troupe qui bouge — c'est le risque connu du fan-out
 * (`technique/brouillard-et-fanout.md`) — alors que la couleur ne change qu'à la fondation ou à
 * la perte d'un avant-poste. Les coudre ensemble ferait recalculer les 4 589 régions à chaque
 * pas d'une colonne.
 *
 * ⚠️ **La signature est « ce que ce joueur connaît », et elle rend pour l'instant la vérité
 * entière.** C'est une étape assumée, pas un oubli : elle existe pour valider le rendu et le
 * coût avant qu'on y branche le relevé et sa péremption (ADR 0020 §5), qui ne changeront ni la
 * forme de l'API ni le client. Une query « publique » aurait été à démonter le jour suivant.
 *
 * Rien n'est stocké : la couleur se recalcule depuis les avant-postes debout, comme la capacité
 * militaire (`victory.ts`). Un état dénormalisé se désynchronise le jour où un avant-poste
 * tombe, et personne ne le voit.
 */
export const held = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    // Le jeton authentifie et cloisonne : c'est la saison du joueur qu'on lit, jamais la table.
    const { season } = await playerByToken(ctx, token);
    const seats = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
    const outposts = await ctx.db
      .query('outposts')
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

    const homeGrounds = ordered.flatMap((seat) => {
      const country = homeCountryOf(seat.nation);
      return country === null ? [] : [{ owner: seat._id as string, country }];
    });

    const map = heldRegions({
      regions: allRegions(),
      outposts: outposts.map((outpost) => ({
        owner: outpost.playerId as string,
        point: pointOf(outpost.point),
      })),
      homeGrounds,
      reachKm: OUTPOST_REACH_KM,
    });

    /** Par joueur, et les mains vides ne voyagent pas : un siège qui n'a ni nation ni avant-poste
     *  ne tient rien, et une ligne vide serait une couleur de plus dans la légende. */
    const byPlayer = new Map<string, Array<string>>();
    for (const [regionId, owner] of map) {
      const kept = byPlayer.get(owner) ?? [];
      kept.push(regionId);
      byPlayer.set(owner, kept);
    }

    return ordered.flatMap((seat) => {
      const regionIds = byPlayer.get(seat._id) ?? [];
      if (regionIds.length === 0) return [];
      return [
        {
          playerId: seat._id,
          nation: seat.nation,
          nickname: seat.nickname,
          ink: inkOf.get(seat._id)!,
          regionIds,
        },
      ];
    });
  },
});
