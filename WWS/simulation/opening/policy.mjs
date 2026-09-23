/**
 * What a virtual player does when he sits down. **A rule, never a written-out queue** — a fixed
 * queue measures the player's stubbornness as much as the economy, and it shows up as
 * non-monotonic sweeps: a richer run buys the wrong thing earlier and finishes later.
 *
 * The rule is read top to bottom and re-read until nothing more is possible, which is exactly
 * what a player does at his screen. Each pass that fires counts as one action, and the count of
 * actions per session is the thing this whole instrument exists to measure.
 */

import {
  buildRefusal, startBuild, recruit, recruitRefusal, orderArsenalLot,
  hqLevel, siteById, totalLevelOf, queueOf, queuedCount, troopCapOf, caps, placedCount,
} from './engine.mjs';
import { buildCost, recruitmentCost, buildingCap, PROJECTION_BY_DOMAIN, DOMAIN_BY_ROLE } from './constants.mjs';

/**
 * @param {object} profile
 *  - plan:        ordered wish list of {key, site, deposit}. Intent, not a schedule.
 *  - alloyReserve: alloy kept back from recruitment, as a multiple of the next HQ's alloy cost.
 *                  0 means "spend everything on troops", which is a real way to play and a
 *                  real way to stall.
 *  - mix:         the roles recruited, in cycle.
 *  - ammoTarget:  ammunition kept in reserve; below it, an arsenal lot is ordered.
 */
/** Why the recruiting rule gave up, tallied. The wall has a name or the sweep is guesswork. */
function note(s, reason) {
  if (!s.recruitBlocked) s.recruitBlocked = {};
  s.recruitBlocked[reason] = (s.recruitBlocked[reason] ?? 0) + 1;
}

export function makePolicy(profile) {
  let mixCursor = 0;

  return function act(s) {
    for (let guard = 0; guard < 64; guard += 1) {
      if (step(s)) continue;
      return;
    }
  };

  function step(s) {
    return placeFoundation(s) || raiseHeadquarters(s) || buildFirstPort(s) || buildFromPlan(s)
      || orderAmmunition(s) || recruitFirstHull(s) || recruitOne(s);
  }

  /**
   * What the season owes comes first, and it comes from the **scenario**, never from the wish
   * list: the foundation carries its own sites and deposits, and a plan entry that names the
   * same key without a deposit would put up a mine over nothing — silently, since a mute
   * building is still a building.
   */
  function placeFoundation(s) {
    for (const order of s.scenario.foundation ?? []) {
      if (siteById(s, order.site)) continue;
      if (startBuild(s, order)) return true;
    }
    return false;
  }

  /**
   * The headquarters is raised when it is what stands in the way — the building ceiling is
   * full, or something the plan wants is capped by it. Never "because it is affordable": that
   * turns every scenario into a headquarters race and hides what the rest costs.
   *
   * **A key the tier has not opened does not count as in the way**, and that is a measured
   * decision: a plan always carries an aerodrome and a port at its tail, so reading
   * `BUILDING_LOCKED` here would turn every profile into a headquarters race from the first
   * minute — the occasional campaign player then reached level 3 twelve hours earlier and
   * finished a level *lower*, having spent on the climb what he owed his economy.
   */
  function raiseHeadquarters(s) {
    const hq = hqLevel(s);
    if (hq === 0 || hq >= s.tuning.maxHqLevel) return false;
    const capReached = placedCount(s) >= buildingCap(hq, s.tuning);
    const blocked = profile.plan.some((o) => buildRefusal(s, o) === 'CAPPED_BY_HQ');
    if (!capReached && !blocked) return false;
    return startBuild(s, { key: 'hq', site: 'hq' });
  }

  /**
   * **La file est illimitée et prépayée** (25/08) : le joueur enfile tant qu'une clé de ses
   * envies est légale et payable, et rien ici ne le retient. Si le régime produit des files
   * absurdes — une saison entière commandée à la première visite — c'est une mesure, pas un
   * défaut à masquer : la profondeur de file au départ de chaque connexion la porte au rapport.
   */
  function buildFromPlan(s) {
    for (const order of profile.plan) {
      if (buildRefusal(s, order) === null) return startBuild(s, order);
    }
    return false;
  }

  /** Ammunition has one source and it only runs on command. Forgetting the lot is the most
   *  common way a queue of troops silently stops. */
  function orderAmmunition(s) {
    if (totalLevelOf(s, 'arsenal') === 0) return false;
    const target = profile.ammoTarget ?? 0;
    if (s.stocks.ammunition + s.arsenalOrder >= target) return false;
    const room = caps(s).ammunition - s.stocks.ammunition;
    const wanted = Math.min(room, target - s.stocks.ammunition - s.arsenalOrder);
    return orderArsenalLot(s, Math.floor(wanted));
  }

  /**
   * **Vouloir la mer, c'est bâtir le port avant d'attendre la coque.** Le port est en queue des
   * deux listes d'envies, et la règle de la liste prend la *première* entrée légale et payable :
   * une élévation de fonderie gagne toujours, si bien qu'aucune saison mesurée n'avait jamais vu
   * d'eau. L'heure du premier cargo aurait alors mesuré l'ordre de la liste, pas la date à
   * laquelle la saison s'ouvre sur l'eau. Une fois le port debout ou en file, cette règle ne dit
   * plus rien et la liste reprend la main.
   */
  function buildFirstPort(s) {
    if (!profile.firstCargo) return false;
    const key = PROJECTION_BY_DOMAIN.sea;
    if (s.sites.some((x) => x.key === key)) return false;
    if (s.constructions.some((entry) => entry.key === key)) return false;
    const order = profile.plan.find((entry) => entry.key === key);
    if (!order || buildRefusal(s, order) !== null) return false;
    return startBuild(s, order);
  }

  /**
   * **La première coque est un objectif, pas une case du cycle.** Le mélange recrute de
   * l'infanterie et des chars ; une coque n'y entrerait qu'en déplaçant ce que le mélange
   * mesure, et l'heure du premier cargo serait alors le tour de rôle plutôt que la date où la
   * saison s'ouvre sur l'eau. Elle ignore la réserve d'alliage : un joueur qui veut la mer la
   * paie, il n'attend pas d'avoir de quoi monter son quartier général en plus.
   */
  function recruitFirstHull(s) {
    if (!profile.firstCargo) return false;
    if (s.troops.some((troop) => troop.role === 'cargo')) return false;
    if ([...s.queues.values()].some((queue) => queue.some((x) => x.role === 'cargo'))) return false;
    const port = s.sites.find((x) => x.key === PROJECTION_BY_DOMAIN.sea);
    if (!port) return false;
    const refusal = recruitRefusal(s, 'cargo', 1, port.id);
    if (refusal !== null) { note(s, refusal); return false; }
    return recruit(s, 'cargo', 1, port.id);
  }

  function recruitOne(s) {
    const hq = hqLevel(s);
    const nextHq = hq < s.tuning.maxHqLevel ? buildCost('hq', hq + 1, s.tuning).alloy : 0;
    const reserve = nextHq * (profile.alloyReserve ?? 0);
    if (s.troops.length + queuedCount(s) >= troopCapOf(s)) { note(s, 'TROOP_CAP_REACHED'); return false; }

    for (let tried = 0; tried < profile.mix.length; tried += 1) {
      const role = profile.mix[(mixCursor + tried) % profile.mix.length];
      const key = PROJECTION_BY_DOMAIN[DOMAIN_BY_ROLE[role]];
      const site = s.sites.find((x) => x.key === key);
      if (!site) continue;
      const cost = recruitmentCost(role, 1, hq);
      if (s.stocks.alloy - cost.alloy < reserve) { note(s, 'ALLOY_RESERVED'); continue; }
      const refusal = recruitRefusal(s, role, 1, site.id);
      if (refusal !== null) { note(s, refusal); continue; }
      mixCursor = (mixCursor + tried + 1) % profile.mix.length;
      return recruit(s, role, 1, site.id);
    }
    return false;
  }
}
