/**
 * **L'édition — le seul rendez-vous collectif du jeu** (`propositions/classement-bareme.md` §3,
 * décision 80 du 06/09). Toutes les `PRESS_EDITION_HOURS`, une ligne par joueur est écrite dans
 * `editions`, une dépêche est déposée chez chacun, et le travail se replanifie lui-même.
 *
 * **Le calcul n'est pas ici.** Le barème est pur et testé sans base (`src/domain/standings.ts`) ;
 * ce module lit, écrit et replanifie, rien de plus — le même partage que le combat
 * (`src/domain/combat.ts` / `convex/combat.ts`) et pour la même raison.
 *
 * **Il se replanifie lui-même**, sur le modèle de `troops.resumeQueues` : il n'existe aucune
 * horloge dans ce jeu et on n'en invente pas une ici. Ce qui l'arrête est ce qui arrête tout
 * travail planifié — `seasonStillPlays`, lu sur un siège de la saison : une saison conclue ou
 * détruite ne publie plus, et la chaîne s'interrompt d'elle-même sans que rien ait à annuler un
 * travail en attente.
 *
 * **La chaîne et l'édition sont deux mutations** (13/09) : `publish` prend le rendez-vous suivant
 * et confie l'édition à `writeEditionJob`. Une édition qui déborde de la seconde d'une mutation
 * n'emporte plus la replanification avec elle — c'est ce qui a fait taire la presse le 12/09.
 * `dev:relaunchPress` est la sortie de secours si une chaîne s'arrête quand même.
 *
 * **La vérité entre ici, et c'est légitime.** Contrairement à `control.held` — une query par
 * joueur, qui ne doit dépendre que de ses propres lignes (`technique/brouillard-et-fanout.md`) —
 * ceci est un travail serveur, exécuté une fois toutes les trois heures pour toute la table : il
 * a le droit de lire qui tient quoi. Ce qu'il en sort est déjà public par décision (ADR 0020 §4).
 */

import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { rankedByTerritory, scoresOf, type AlloyPrices } from '../src/domain/standings';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import { buildingCostKey, seasonBuildings } from './buildingReads';
import { COST_BY_ROLE, PRESS_EDITION_HOURS, TIER_2_FACTOR, buildCost } from './constants';
import { heldOver } from './holding';
import { seasonOutposts, seasonTroops } from './movement/forces';
import { allRegions } from './regions';
import { isAtWar, playingSeason, seatsOf } from './seats';

/**
 * **Les prix, lus dans les tables du jeu et jamais recopiés.** C'est le garde-fou du barème : une
 * seconde grille de points dériverait de celle-ci et s'en désaccorderait au premier réglage
 * d'équilibrage, et l'écran mentirait alors sur des chiffres que le jeu ne joue plus.
 */
const ALLOY: AlloyPrices = {
  /**
   * **Le niveau 1 d'un avant-poste ne coûte pas d'alliage** (précision du 15/09) : on le fonde
   * en y marchant, et seule l'élévation se paie. Compter son prix de barème ici créditerait le
   * joueur d'une facture que personne n'a réglée — la ligne rouvrira le jour où
   * `fondation-en-chantier` la fera payer.
   */
  ofLevel: (key, level) =>
    key === 'outpost' && level <= 1 ? 0 : (buildCost(key as BuildingKey, level).alloy ?? 0),
  ofTroop: (role, tier) => COST_BY_ROLE[role as UnitRole].alloy * (tier === 2 ? TIER_2_FACTOR : 1),
};

/**
 * **Une édition.** Elle lit tout, écrit une ligne par joueur — **défaits compris**, parce qu'un
 * observateur reste au classement à son rang (contrat de vue 07) — dépose une dépêche chez
 * chacun, puis se redonne rendez-vous.
 *
 * `playerId` est le manche que tout travail planifié tient (`seasonStillPlays` en prend un) :
 * n'importe quel siège de la saison fait l'affaire, il ne sert qu'à retrouver la saison et à
 * vérifier qu'elle se joue encore.
 */
export const publish = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const season = await playingSeason(ctx, playerId);
    if (season === null) return;

    /**
     * **La chaîne se tient elle-même**, et deux choses seulement l'arrêtent : la saison qui ne
     * se joue plus (ci-dessus), et **son horloge** — passé la durée annoncée, la partie attend
     * d'être close et une édition de plus n'aurait rien à raconter. Une saison sans horloge n'a
     * pas de fin à connaître : elle publie jusqu'à sa conclusion, qui écrit la dernière.
     *
     * **Le maillon se pose avant l'édition, et dans une autre mutation qu'elle** (13/09). Les
     * deux tenaient dans celle-ci : le 12/09 à 23 h 55, le dépouillement des 4 589 régions a
     * dépassé la seconde d'une mutation, la transaction a été annulée **avec sa replanification**,
     * et la chaîne s'est arrêtée en silence — aucune édition depuis, sans rien pour le dire.
     * Dorénavant une édition ratée reste ratée et la suivante paraît : c'est le rendez-vous qui
     * est la chaîne, pas ce qu'on y publie. Ce lien-ci ne lit qu'une saison et ne peut pas être
     * l'appel qui déborde.
     */
    const now = Date.now();
    const next = now + PRESS_EDITION_HOURS * 3_600_000;
    const ends = endsAt(season);
    if (ends === null || next <= ends) {
      await ctx.scheduler.runAfter(PRESS_EDITION_HOURS * 3_600_000, internal.press.publish, {
        playerId,
      });
    }
    await ctx.scheduler.runAfter(0, internal.press.writeEditionJob, { seasonId: season._id });
  },
});

/**
 * **L'édition elle-même, dans sa propre transaction.** Elle lit toute la table — les régions
 * tenues, les bâtiments, les troupes, les engagements — et c'est le seul endroit de la chaîne qui
 * puisse coûter une seconde. Qu'elle échoue ne regarde qu'elle : le rendez-vous suivant est déjà
 * pris quand elle commence.
 */
export const writeEditionJob = internalMutation({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }) => {
    await writeEdition(ctx, seasonId, Date.now(), false);
  },
});

/** L'heure où la saison arrive au bout de l'horloge qu'elle s'est donnée, `null` quand elle n'en
 *  a pas (révision du 27/08 de l'ADR 0017 : elle se clôt alors à la main). */
const endsAt = (season: Doc<'seasons'>): number | null =>
  season.durationHours === null || season.launchedAt === null
    ? null
    : season.launchedAt + season.durationHours * 3_600_000;

/**
 * **L'édition finale, hors cadence** (§5) : écrite immédiatement à la conclusion, avant que la
 * saison passe en `concluded` — après, `seasonStillPlays` la refuserait, et c'est exactement ce
 * qui doit arrêter toutes les suivantes. C'est le classement que la page de presse tamponne, et
 * il n'y en a pas d'autre : aucun écran de fin ne le double.
 */
export async function publishFinalEdition(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  at: number,
): Promise<void> {
  await writeEdition(ctx, seasonId, at, true);
}

async function writeEdition(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  at: number,
  final: boolean,
): Promise<void> {
  const season = await ctx.db.get(seasonId);
  if (season === null) return;
  const seats = await seatsOf(ctx, seasonId);
  /** Les belligérants, jamais les sièges : quelqu'un qui n'a pas encore choisi son drapeau ne
   *  tient rien, ne bâtit rien, et sa ligne à zéro serait une nation de plus au classement. */
  const players = seats.filter((seat) => isAtWar(seat, season));
  if (players.length === 0) return;

  const held = await heldCounts(ctx, seasonId, at);
  const heldByAnyone = [...held.values()].reduce((sum, count) => sum + count, 0);

  const buildings = await seasonBuildings(ctx, seasonId);
  const disabled = await disabledOutposts(ctx, seasonId, at);
  const outposts = await seasonOutposts(ctx, seasonId);
  const troops = await seasonTroops(ctx, seasonId);

  const lines = [];
  for (const player of players) {
    const scores = scoresOf({
      /**
       * **L'alliage d'une élévation tombe en industrie** (précision du 15/09). Le territoire est
       * une *part* — régions tenues sur régions tenues — et de l'alliage n'y a pas d'unité ; ce
       * qu'un point monté ajoute au théâtre, il l'ajoute déjà par les régions qu'il tient, et
       * cette part-là le compte. Reste ce qu'il a coûté, qui est de la construction, pesée
       * comme toute construction : la somme des niveaux gravis.
       */
      buildings: [
        ...outposts
          .filter((outpost) => outpost.playerId === player._id)
          .map((outpost) => ({
            key: 'outpost',
            level: outpost.level,
            disabled: disabled.has(outpost._id),
          })),
        ...buildings
          .filter((building) => building.playerId === player._id)
          .map((building) => ({
            key: buildingCostKey(building),
            level: building.level,
            /** **Le rattachement écrit à la pose, jamais redeviné** (ADR 0020 §10). Une ligne
             *  d'avant le champ n'en porte aucun et compte donc plein : elle est du sol national
             *  dans tous les cas qui existent, et le repli part au prochain wipe. */
            disabled:
              building.outpostId !== undefined &&
              building.outpostId !== null &&
              disabled.has(building.outpostId),
          })),
      ],
      troops: troops
        .filter((troop) => troop.playerId === player._id)
        .map((troop) => ({
          role: troop.role,
          tier: troop.tier,
          strength: troop.currentStrength,
          nominalStrength: troop.nominalStrength,
        })),
      engagements: await deedsOf(ctx, player._id),
      heldCount: held.get(player._id as string) ?? 0,
      heldByAnyone,
      alloy: ALLOY,
    });
    lines.push({ playerId: player._id, ...scores });
  }

  for (const line of rankedByTerritory(lines)) {
    await ctx.db.insert('editions', {
      seasonId,
      playerId: line.playerId,
      at,
      final,
      territory: line.territory,
      industry: line.industry,
      military: line.military,
      deeds: line.deeds,
      general: line.general,
    });
    /** **Son rang, et rien d'autre.** La dépêche est le rendez-vous, la page de presse est la
     *  lecture : chiffrer la table ici en ferait une seconde source. */
    await ctx.db.insert('notices', {
      playerId: line.playerId,
      at,
      kind: 'editionPublished',
      rank: line.rank,
    });
  }
}

/**
 * **Qui tient combien de régions, à cet instant** — la vérité, sur les 4 589 régions cuites.
 * C'est le même calcul que le relevé du sol (`convex/surveys.ts`), sur le monde entier plutôt
 * que sur ce qu'une portée couvre : ici il n'y a pas d'observateur, il y a un dépouillement.
 * Une seule fonction le rend (`heldOver`), et c'est elle qui colore la carte et relie la
 * production — un classement qui compterait autrement dirait autre chose que ce que le joueur
 * voit.
 *
 * Un avant-poste **hors service ne tient rien** le temps de sa désactivation (ADR 0020 §7) : le
 * raid ne le déracine pas (ADR 0004), il lui prend sa part. C'est précisément ce que
 * l'édition doit montrer.
 */
async function heldCounts(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
  at: number,
): Promise<ReadonlyMap<string, number>> {
  const truth = await heldOver(ctx, seasonId, allRegions(), at);
  const counts = new Map<string, number>();
  for (const owner of truth.values()) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  return counts;
}

/** Les points hors service à l'instant du relevé : ce qui pend à l'un d'eux compte à zéro
 *  (spécification §1), et repart entier quand il revient. */
async function disabledOutposts(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
  at: number,
): Promise<ReadonlySet<Id<'outposts'>>> {
  const outposts = await seasonOutposts(ctx, seasonId);
  return new Set(
    outposts
      .filter((outpost) => outpost.disabledUntil !== null && outpost.disabledUntil > at)
      .map((outpost) => outpost._id),
  );
}

/**
 * **Les faits d'armes : le compte entier, jamais la fenêtre du journal.** `engagementsOf` sert
 * les vingt derniers comptes rendus parce qu'un écran les lit ; ceci est un cumul, et un cumul
 * tronqué décroîtrait — ce que la spécification interdit nommément.
 */
async function deedsOf(ctx: QueryCtx, playerId: Id<'players'>): Promise<number> {
  const attacked = await ctx.db
    .query('engagements')
    .withIndex('byAttacker', (q) => q.eq('attackerId', playerId))
    .collect();
  const defended = await ctx.db
    .query('engagements')
    .withIndex('byDefender', (q) => q.eq('defenderId', playerId))
    .collect();
  return attacked.length + defended.length;
}
