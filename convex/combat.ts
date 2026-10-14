import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  drownedOf,
  resolveEngagement,
  winnerOf,
  type Combatant,
  type CombatantOutcome,
  type Engagement,
} from '../src/domain/combat';
import { landAtPoint } from './routes';
import { movementsOf } from './movement/forces';
import { outpostShelters } from '../src/domain/outposts';
import { modeOf } from '../src/domain/season-mode';
import { COMBAT_RULES } from './constants';
import { REPORTS_SERVED } from '../src/domain/player-view';
import { notifyPlayer } from './notifications';
import { push, journalUrl, reportUrl } from '../src/domain/push';
import { debit, economyOf } from './resources';
import { claimVictory, isPlayerReduced } from './victory';
import {
  combatCargoSnapshot,
  recoverDestroyedCombatCargo,
  settleCombatCargo,
  type HomewardCargo,
} from './cargo';

/**
 * **The pass of resolution, as the board records it.** The rules themselves are in
 * `src/domain/combat.ts` — pure, deterministic, testable without a database. This module is
 * only the wiring: who is standing where, what the account says afterwards.
 *
 * Nothing here decides *whether* two forces meet. That is `movements.ts`, at an arrival or at
 * an interception.
 */

export type Engaged = {
  readonly playerId: Id<'players'>;
  readonly troops: ReadonlyArray<Doc<'troops'>>;
};

export type Resolution = {
  readonly engagementId: Id<'engagements'>;
  readonly engagement: Engagement;
  /** The troops that broke contact, by side — each one owes a march home. */
  readonly routed: ReadonlyArray<Doc<'troops'>>;
  readonly routedCargo: ReadonlyArray<HomewardCargo>;
};

/**
 * A troop's hit points **are** its strength (ADR 0014), so the account is written in the same
 * unit the screen reads: 32 of 50 soldiers left.
 */
const combatantOf = (troop: Doc<'troops'>, sheltered = false): Combatant => ({
  id: troop._id,
  role: troop.role,
  tier: troop.tier,
  strength: troop.currentStrength,
  nominalStrength: troop.nominalStrength,
  formedAt: troop._creationTime,
  sheltered,
});

/**
 * **La défense n'a que ses murs** (grilling du 14/10, B16 et C1) : elle encaisse moins, une troupe en
 * garnison d'un bâtiment ou d'un avant-poste, ou la garnison d'un objectif — que le siège
 * irrégulier tient sur un point —, et jamais une pile posée en terrain libre ni en mer. Une
 * troupe garde son adresse quand elle marche, donc une troupe d'un mouvement n'est à l'abri de
 * rien, même si son adresse nomme encore un bâtiment. **Un point en chantier ou désactivé n'a
 * pas de murs** (décision du 14/10, C4, `outpostShelters`), et l'aperçu de l'ordre le lit aussi.
 */
async function shelteredOf(
  ctx: MutationCtx,
  defender: Engaged,
  at: number,
): Promise<(troop: Doc<'troops'>) => boolean> {
  const irregular = (await ctx.db.get(defender.playerId))?.irregular === true;
  const marching = new Set(
    (await movementsOf(ctx, defender.playerId)).flatMap((movement) => movement.troopIds),
  );
  const bare = new Set<string>();
  for (const address of new Set(defender.troops.map((troop) => troop.stationedAt))) {
    const outpostId = typeof address === 'string' ? ctx.db.normalizeId('outposts', address) : null;
    const outpost = outpostId === null ? null : await ctx.db.get(outpostId);
    if (outpost !== null && !outpostShelters(outpost, at)) bare.add(outpost._id);
  }
  return (troop) =>
    !marching.has(troop._id) &&
    (irregular || (typeof troop.stationedAt === 'string' && !bare.has(troop.stationedAt)));
}

export async function resolveContact(
  ctx: MutationCtx,
  {
    seasonId,
    attacker,
    defender,
    cause,
    point,
    hostCountry,
    outpostId,
    disabledUntil,
    at,
  }: {
    seasonId: Id<'seasons'>;
    attacker: Engaged;
    defender: Engaged;
    cause: 'arrival' | 'interception';
    point: { lon: number; lat: number };
    hostCountry: string;
    outpostId: Id<'outposts'> | null;
    disabledUntil: number | null;
    at: number;
  },
): Promise<Resolution> {
  /**
   * **The magazine is read before the pass and paid after it** (question 18, settled 25/08).
   * Ammunition is billed here and nowhere else — a troop costs nothing in rounds to raise, it
   * costs rounds every time it fires — so this is the only place a stock and a strike meet.
   *
   * The debit cannot refuse: `resolveEngagement` has already clamped it to what the nation
   * holds, and a camp that could not pay has already fired at `DRY_AMMUNITION_FACTOR`. An
   * engagement is never declined for want of matter.
   */
  const sheltered = await shelteredOf(ctx, defender, at);
  /** **La Blitz ne tient pas de magasin** : sa seule ressource est les fonds, et l'on y tire
   *  sans compter les coups. */
  const blitz = modeOf((await ctx.db.get(seasonId))?.mode) === 'blitz';
  const magazineOf = async (playerId: Id<'players'>) =>
    blitz ? Infinity : (await economyOf(ctx, playerId, at)).stocks.ammunition;
  const engagement = resolveEngagement({
    attackers: attacker.troops.map((troop) => combatantOf(troop)),
    defenders: defender.troops.map((troop) => combatantOf(troop, sheltered(troop))),
    ammunition: {
      attacker: await magazineOf(attacker.playerId),
      defender: await magazineOf(defender.playerId),
    },
    rules: COMBAT_RULES,
  });

  for (const side of ['attacker', 'defender'] as const) {
    const { spent, dry } = engagement.magazine[side];
    const who = side === 'attacker' ? attacker.playerId : defender.playerId;
    if (spent > 0 && !blitz) await debit(ctx, who, { ammunition: spent }, at);
    /**
     * **A side that could not pay struck at `DRY_AMMUNITION_FACTOR`**, and nothing else on the
     * board says it: the account of the pass shows losses, never the reason for them, so a
     * supply fault reads as a defeat. Dryness belongs to the side and not to a troop (design
     * sheet 09), so it is one line for the whole pass.
     */
    if (dry) {
      await ctx.db.insert('notices', {
        playerId: who,
        at,
        kind: 'firedDry',
        hostCountry,
        point,
      });
      await notifyPlayer(ctx, who, { type: 'dryFire', phrase: push.dryFire, url: journalUrl, at });
    }
  }

  /** Read **before** the outcomes land: "this pass is the one that crossed the bar" needs the
   *  state it crossed from, and one line later nothing on the board remembers it. */
  const wasReduced = await isPlayerReduced(ctx, defender.playerId);

  const byId = new Map<string, Doc<'troops'>>(
    [...attacker.troops, ...defender.troops].map((troop) => [troop._id, troop]),
  );
  const cargoBefore = await combatCargoSnapshot(ctx, seasonId, new Set(byId.keys()));

  for (const outcome of engagement.outcomes) {
    const troop = byId.get(outcome.id);
    if (!troop) continue;
    if (outcome.state === 'destroyed') await ctx.db.delete(troop._id);
    else await ctx.db.patch(troop._id, { currentStrength: outcome.strengthAfter });
  }

  /**
   * **Le large prend ce que plus aucune coque ne porte** (règle 4 du 18/09), et il le prend
   * **après** la passe : le tir n'a rien appris de la cargaison, c'est l'état d'après qui
   * répond. Les issues sont amendées ici et une seule fois — noyé devient `destroyed`, emporté
   * par un replié devient `routed` — et **c'est la liste amendée qui descend partout** : le
   * compte de l'engagement, le règlement des charges, la réduction, la liste des repliés. Une
   * seconde vérité à côté des issues aurait fait marcher un noyé jusqu'à son ancrage.
   *
   * Placé avant `reducedDefender` de propos délibéré : couler un transport chargé *est* une
   * réduction, et la domination doit la compter dans la passe qui l'a franchie.
   */
  const sunk = await drownAtSea(ctx, { point, outcomes: engagement.outcomes, byId, at });
  const outcomes: ReadonlyArray<CombatantOutcome> = engagement.outcomes.map((outcome) =>
    sunk.drowned.has(outcome.id)
      ? { ...outcome, state: 'destroyed' as const }
      : sunk.withdrawn.has(outcome.id)
        ? { ...outcome, state: 'routed' as const }
        : outcome,
  );
  /** **Le terrain se lit sur la liste amendée** : une cargaison noyée n'est plus debout, et la
   *  passe qui a coulé le dernier banc a dégagé le terrain. */
  const winner = winnerOf(outcomes);
  const routed = outcomes.flatMap((outcome) =>
    outcome.state === 'routed' ? [byId.get(outcome.id)!] : [],
  );

  const reducedDefender = !wasReduced && (await isPlayerReduced(ctx, defender.playerId));

  const engagementId = await ctx.db.insert('engagements', {
    seasonId,
    attackerId: attacker.playerId,
    defenderId: defender.playerId,
    cause,
    point,
    hostCountry,
    at,
    winner,
    outpostId,
    disabledUntil,
    reducedDefender,
    troops: outcomes.map((outcome) => {
      const troop = byId.get(outcome.id)!;
      return {
        troopId: troop._id,
        side: outcome.side,
        role: troop.role,
        tier: troop.tier,
        strengthBefore: outcome.strengthBefore,
        strengthAfter: outcome.strengthAfter,
        state: outcome.state,
      };
    }),
  });

  /** **Le défenseur, et lui seul** : l'attaquant a donné l'ordre, il n'a pas à être averti. */
  await notifyPlayer(ctx, defender.playerId, {
    type: 'attack',
    phrase: push.attack,
    url: reportUrl(engagementId),
    at,
  });

  const recoveringPlayerId = winner === 'attacker' ? attacker.playerId : defender.playerId;
  const dispossessedPlayerId = winner === 'attacker' ? defender.playerId : attacker.playerId;
  const cargoSettlement = await settleCombatCargo(
    ctx,
    cargoBefore,
    outcomes,
    dispossessedPlayerId,
    at,
  );
  await recoverDestroyedCombatCargo(ctx, {
    seasonId,
    engagementId,
    destroyed: cargoSettlement.destroyed,
    recoveringPlayerId,
    standingTroopIds: outcomes
      .filter((outcome) => outcome.side === winner && outcome.state === 'standing')
      .map((outcome) => outcome.id),
    point,
    at,
  });
  const routedCargo = cargoSettlement.homeward;

  /**
   * **The blow-by-blow hangs from the account, it is not part of it.** The report is read on
   * every load of the board to show two totals; the detail is read by nothing yet and by the
   * visual replay one day (surface 4.7), one engagement at a time. Kept inside the document it
   * made a season of passes unreadable in a single query.
   */
  let rank = 0;
  for (const strike of engagement.strikes) {
    const by = byId.get(strike.by)!;
    const target = byId.get(strike.target)!;
    await ctx.db.insert('strikes', {
      engagementId,
      rank,
      phase: strike.phase,
      by: by._id,
      byRole: by.role,
      byTier: by.tier,
      bySide: attacker.troops.some((troop) => troop._id === by._id)
        ? ('attacker' as const)
        : ('defender' as const),
      target: target._id,
      targetRole: target.role,
      targetTier: target.tier,
      losses: strike.losses,
    });
    rank += 1;
  }

  /**
   * The season is claimed here and only here, because this is the one place an engagement is
   * written: the condition of the test victory is "be the attacker of the pass that crosses the
   * threshold" (`convex/victory.ts`), and there is no other moment at which that is true.
   *
   * **The attacker is whoever's order aimed at the other** (ADR 0024 §3): nothing fights
   * without an order since 13/09, so a camp that answers an assault is its defender and never
   * advances a victory by riposting.
   */
  const season = await ctx.db.get(seasonId);
  if (season) await claimVictory(ctx, season, attacker.playerId, at);

  /** **Une seule liste d'issues sort d'ici** : l'appelant lit les survivants dessus pour les
   *  renvoyer chez eux (`engageAt`), et un noyé qui y serait encore `standing` marcherait. */
  return { engagementId, engagement: { ...engagement, outcomes, winner }, routed, routedCargo };
}

/**
 * **Ce que le large prend quand la coque tombe** (règle 4 du 18/09, révision de l'ADR 0019 §2).
 * La règle est pure et testée seule (`drownedOf`, `src/domain/combat.ts`) ; ceci est le câblage :
 * quel côté, quels survivants, et la dépêche.
 *
 * **Les deux côtés**, et ce n'est pas une symétrie de confort : l'assaillant est au même point
 * que sa cible une fois arrivé, donc son propre convoi coule si son escorte n'a pas tenu.
 *
 * Rien ne se noie à terre, et la lecture est celle de la grille de routage — la même cellule que
 * la visée et le départ (ADR 0023) : une passe sur une plage est une passe à terre.
 */
async function drownAtSea(
  ctx: MutationCtx,
  {
    point,
    outcomes,
    byId,
    at,
  }: {
    point: { lon: number; lat: number };
    outcomes: ReadonlyArray<CombatantOutcome>;
    byId: Map<string, Doc<'troops'>>;
    at: number;
  },
): Promise<{ readonly drowned: ReadonlySet<string>; readonly withdrawn: ReadonlySet<string> }> {
  const drowned = new Set<string>();
  const withdrawn = new Set<string>();
  if (landAtPoint([point.lon, point.lat])) return { drowned, withdrawn };

  for (const side of ['attacker', 'defender'] as const) {
    const survivors = outcomes.filter(
      (outcome) => outcome.side === side && outcome.state !== 'destroyed',
    );
    const unit = (outcome: CombatantOutcome) => ({
      id: outcome.id,
      role: byId.get(outcome.id)!.role,
    });
    const fate = drownedOf(
      survivors.filter((outcome) => outcome.state === 'standing').map(unit),
      survivors.filter((outcome) => outcome.state === 'routed').map(unit),
    );
    for (const id of fate.withdrawn) withdrawn.add(id);
    if (fate.drowned.length === 0) continue;

    /**
     * **Des hommes et des machines, jamais un nombre de troupes** (ADR 0014) : la perte se lit
     * dans l'unité où la passe se raconte, et l'effectif compté est celui d'**après** la passe —
     * ce qui a coulé est ce qui restait debout.
     */
    const lost = fate.drowned.map((id) => ({
      role: byId.get(id)!.role,
      strength: outcomes.find((outcome) => outcome.id === id)!.strengthAfter,
    }));
    const of = (role: 'infantry' | 'other') =>
      lost
        .filter((one) => (role === 'infantry' ? one.role === 'infantry' : one.role !== 'infantry'))
        .reduce((sum, one) => sum + one.strength, 0);
    for (const id of fate.drowned) drowned.add(id);
    await ctx.db.insert('notices', {
      playerId: byId.get(fate.drowned[0]!)!.playerId,
      at,
      kind: 'drownedAtSea',
      point,
      men: of('infantry'),
      machines: of('other'),
    });
  }

  for (const id of drowned) await ctx.db.delete(byId.get(id)!._id);
  return { drowned, withdrawn };
}

/**
 * **The last passes of a player, both sides of the field, and nothing older.** The window is the
 * journal's (`REPORTS_SERVED`) and it is a screen bound, not a rule: a season with three hundred
 * accounts in it read them all to show the last twenty, and the view grew with the season until
 * it went through Convex's read ceiling.
 *
 * Two indexes, so the depth is taken **on each** before the merge: an attacker who was never
 * attacked would otherwise serve half a window.
 */
export async function engagementsOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'engagements'>>> {
  const mine = await ctx.db
    .query('engagements')
    .withIndex('byAttacker', (q) => q.eq('attackerId', playerId))
    .order('desc')
    .take(REPORTS_SERVED);
  const against = await ctx.db
    .query('engagements')
    .withIndex('byDefender', (q) => q.eq('defenderId', playerId))
    .order('desc')
    .take(REPORTS_SERVED);
  return [...mine, ...against].sort((a, b) => b.at - a.at).slice(0, REPORTS_SERVED);
}
