/**
 * The opening engine: economy, construction, recruitment, arsenal lots and losses, advanced
 * one minute at a time over a season.
 *
 * **What it does not model, on purpose:** movement, combat resolution, outposts, fog. Losses
 * are a knob, not a battle — they stand in for what the fighting loops will take out of the
 * army, so the alloy sink and the rebuild action exist before the combat code does. Every
 * number they produce is a *shape*, never a balance figure.
 *
 * Determinism: one seeded generator, no wall clock, no `Math.random`. Two runs on one seed are
 * identical.
 */

import {
  RESOURCES, BASE_CAP, STORAGE_CAP_PER_LEVEL, COMMANDED_CHAINS, CHAINS,
  EXPLOITED_DEPOSITS, MAX_QUEUED_BATCHES, PROJECTION_BY_DOMAIN, DOMAIN_BY_ROLE,
  DEFAULT_TUNING, unlockLevel,
  buildCost, buildMinutes, buildingCap, troopCap, recruitmentCost, roleHqLevel,
  extractionPerHour, chainInputs, chainPerHourPerLevel, foundationOwed,
} from './constants.mjs';

/* ── seeded generator ───────────────────────────────────────────────────── */

export function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── state ──────────────────────────────────────────────────────────────── */

export function createState(scenario) {
  const tuning = { ...DEFAULT_TUNING, ...(scenario.tuning ?? {}) };
  const stocks = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  Object.assign(stocks, scenario.startingStock);
  return {
    minute: 0,
    tuning,
    scenario,
    stocks,
    /** A site is a (key, region) pair, as `buildingAt` reads it. */
    sites: scenario.startingSites.map((s) => ({ ...s })),
    construction: null,
    /** One queue per projection site, as `convex/troops.ts` holds it. */
    queues: new Map(),
    /**
     * The company the launch hands out (`seasons.endow`, 25/08), garrisoned at the headquarters.
     * It takes a place under `troopCap` from the first minute; what it *eats* is not modelled
     * here, because this engine models no upkeep at all — see the README's limits.
     */
    troops: (scenario.startingTroops ?? []).map((troop) => ({ ...troop })),
    /** Outstanding arsenal lot, in units of ammunition still owed. */
    arsenalOrder: 0,
    random: makeRandom(scenario.seed ?? 1),
    log: [],
    sessions: [],
    series: [],
    lostTroops: 0,
  };
}

export const hqLevel = (s) => s.sites.find((x) => x.key === 'hq')?.level ?? 0;
export const siteById = (s, id) => s.sites.find((x) => x.id === id);
export const totalLevelOf = (s, key) => s.sites.reduce((n, x) => (x.key === key ? n + x.level : n), 0);
export const queueOf = (s, siteId) => s.queues.get(siteId) ?? [];
export const queuedCount = (s) => [...s.queues.values()].reduce((n, q) => n + q.length, 0);
export const troopCapOf = (s) => troopCap(totalLevelOf(s, 'billets'), s.tuning.troopCapTarget);

/**
 * What the season still owes. A key owed is placed **for nothing and at once**: choosing the
 * region is the decision, the price and the wait on what is not one are what the format takes
 * back (`convex/constructions.ts`).
 */
export const owedByFoundation = (s) =>
  foundationOwed(
    s.scenario.foundation?.map((order) => ({ key: order.key, deposit: order.deposit ?? null })) ??
      [],
    s.sites.map((x) => ({ key: x.key, deposit: x.deposit ?? null })),
  );

/** A debt is settled by its deposit, never by its key alone (`convex/regions.ts`). */
const owesFirstPlacement = (s, order) =>
  !siteById(s, order.site) &&
  owedByFoundation(s).some(
    (due) => due.key === order.key && due.deposit === (order.deposit ?? null),
  );

export function caps(s) {
  const c = Object.fromEntries(RESOURCES.map((r) => [r, BASE_CAP]));
  const storageLevel = totalLevelOf(s, 'warehouse') + totalLevelOf(s, 'depot');
  const raised = STORAGE_CAP_PER_LEVEL * storageLevel;
  for (const resource of RESOURCES) c[resource] += raised;
  return c;
}

export function extractionRates(s) {
  const rates = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  for (const site of s.sites) {
    if (site.deposit && EXPLOITED_DEPOSITS[site.key]?.includes(site.deposit)) {
      rates[site.deposit] += extractionPerHour(site.deposit, s.tuning) * site.level;
    }
  }
  return rates;
}

/* ── one minute ─────────────────────────────────────────────────────────── */

function advanceEconomy(s, minutes) {
  const h = minutes / 60;
  const rates = extractionRates(s);
  const cap = caps(s);
  // A ceiling bounds what comes in, never what is already held (`settleStocks`): the kit of a
  // format opens above the ceiling of a nation that has not placed its warehouse yet, and
  // clipping it would confiscate the difference without a word.
  const held = (r) => Math.max(cap[r], s.stocks[r]);
  for (const r of RESOURCES) s.stocks[r] = Math.min(held(r), s.stocks[r] + rates[r] * h);

  for (const key of Object.keys(CHAINS)) {
    const level = totalLevelOf(s, key);
    if (level === 0) continue;
    const output = CHAINS[key].output;
    const inputs = chainInputs(key, s.tuning);
    let made = chainPerHourPerLevel(key, s.tuning) * level * h;
    if (COMMANDED_CHAINS.has(key)) made = Math.min(made, s.arsenalOrder);
    made = Math.min(made, Math.max(0, cap[output] - s.stocks[output]));
    for (const [r, q] of inputs) made = Math.min(made, s.stocks[r] / q);
    made = Math.max(0, made);
    if (made === 0) continue;
    for (const [r, q] of inputs) s.stocks[r] -= made * q;
    s.stocks[output] = Math.min(cap[output], s.stocks[output] + made);
    if (COMMANDED_CHAINS.has(key)) s.arsenalOrder = Math.max(0, s.arsenalOrder - made);
  }
}

function advanceConstruction(s) {
  const c = s.construction;
  if (!c || s.minute < c.finishesAt) return;
  const existing = siteById(s, c.site);
  if (existing) existing.level = c.level;
  else s.sites.push({ id: c.site, key: c.key, level: 1, deposit: c.deposit });
  s.log.push({ minute: s.minute, kind: 'built', key: c.key, level: c.level });
  s.construction = null;
}

function advanceQueues(s) {
  for (const [siteId, queue] of s.queues) {
    const head = queue[0];
    if (!head) continue;
    if (head.finishesAt === null) {
      head.finishesAt = s.minute + head.minutes;
      continue;
    }
    if (s.minute >= head.finishesAt) {
      queue.shift();
      s.troops.push({ role: head.role, tier: head.tier, from: siteId });
      s.log.push({ minute: s.minute, kind: 'troop', role: head.role, tier: head.tier });
    }
  }
}

/**
 * Losses stand in for the fighting loops. A rate per day, drawn once a minute, so the army
 * bleeds continuously rather than in a scripted event — what matters here is that rebuilding
 * is a recurring action and a recurring alloy sink, not when exactly it happens.
 */
function advanceLosses(s) {
  const perDay = s.scenario.lossesPerDay ?? 0;
  if (perDay <= 0 || s.troops.length === 0) return;
  if (s.random() < perDay / (24 * 60)) {
    const index = Math.floor(s.random() * s.troops.length);
    const gone = s.troops.splice(index, 1)[0];
    s.lostTroops += 1;
    s.log.push({ minute: s.minute, kind: 'lost', role: gone.role });
  }
}

/* ── actions the player can take ────────────────────────────────────────── */

export function buildRefusal(s, order) {
  const existing = order.site ? siteById(s, order.site) : null;
  const level = (existing?.level ?? 0) + 1;
  const hq = hqLevel(s);
  if (s.construction) return 'CONSTRUCTION_IN_PROGRESS';
  if (!existing && s.sites.length >= buildingCap(hq, s.tuning)) return 'BUILDING_CAP_REACHED';
  // The catalogue by tier, in the order `placementRefusal` reads it: after the ceiling, and
  // never against the headquarters itself — it gates the others, not its own raise.
  if (order.key !== 'hq' && hq < unlockLevel(order.key, s.scenario.format)) return 'BUILDING_LOCKED';
  if (order.key === 'hq' && level > s.tuning.maxHqLevel) return 'MAX_LEVEL_REACHED';
  if (order.key !== 'hq' && level - 1 >= hq) return 'CAPPED_BY_HQ';
  // The foundation buys the price and the wait, never a place on the map: every refusal above
  // still has its say, and only the bill below is waived.
  if (owesFirstPlacement(s, order)) return null;
  const cost = buildCost(order.key, level, s.tuning);
  for (const [r, a] of Object.entries(cost)) if (s.stocks[r] < a - 1e-9) return `INSUFFICIENT_${r}`;
  return null;
}

export function startBuild(s, order) {
  if (buildRefusal(s, order) !== null) return false;

  if (owesFirstPlacement(s, order)) {
    s.sites.push({ id: order.site, key: order.key, level: 1, deposit: order.deposit });
    s.log.push({ minute: s.minute, kind: 'build', key: order.key, level: 1, cost: {}, minutes: 0 });
    s.log.push({ minute: s.minute, kind: 'built', key: order.key, level: 1 });
    return true;
  }

  const existing = order.site ? siteById(s, order.site) : null;
  const level = (existing?.level ?? 0) + 1;
  const cost = buildCost(order.key, level, s.tuning);
  for (const [r, a] of Object.entries(cost)) s.stocks[r] -= a;
  const minutes = buildMinutes(order.key, level, s.tuning);
  s.construction = { ...order, level, finishesAt: s.minute + minutes, cost, minutes };
  s.log.push({ minute: s.minute, kind: 'build', key: order.key, level, cost, minutes });
  return true;
}

export function recruitRefusal(s, role, tier, siteId) {
  const site = siteById(s, siteId);
  if (!site || site.key !== PROJECTION_BY_DOMAIN[DOMAIN_BY_ROLE[role]]) return 'WRONG_BUILDING';
  if (tier === 2 && hqLevel(s) < s.tuning.tier2HqLevel) return 'TIER_LOCKED';
  // The tank arrives with its counter, at the mark-2 threshold and whatever tier is asked for.
  if (hqLevel(s) < roleHqLevel(role, s.tuning.tier2HqLevel)) return 'ROLE_LOCKED';
  // Standing and queued share one ceiling: the queue is not a way around it.
  if (s.troops.length + queuedCount(s) >= troopCapOf(s)) return 'TROOP_CAP_REACHED';
  if (queueOf(s, siteId).length >= MAX_QUEUED_BATCHES) return 'QUEUE_FULL';
  const cost = recruitmentCost(role, tier, hqLevel(s));
  if (s.stocks.alloy < cost.alloy - 1e-9) return 'INSUFFICIENT_alloy';
  return null;
}

export function recruit(s, role, tier, siteId) {
  if (recruitRefusal(s, role, tier, siteId) !== null) return false;
  const cost = recruitmentCost(role, tier, hqLevel(s));
  s.stocks.alloy -= cost.alloy;
  if (!s.queues.has(siteId)) s.queues.set(siteId, []);
  s.queues.get(siteId).push({ role, tier, minutes: cost.minutes, finishesAt: null });
  s.log.push({ minute: s.minute, kind: 'recruit', role, tier, cost });
  return true;
}

/** An arsenal lot: the only way ammunition comes into the world. Alloy is spent as it is cast,
 *  not at the order, so this queues intent rather than debiting. */
export function orderArsenalLot(s, units) {
  if (totalLevelOf(s, 'arsenal') === 0) return false;
  if (units <= 0) return false;
  s.arsenalOrder += units;
  s.log.push({ minute: s.minute, kind: 'lot', units });
  return true;
}

/* ── sessions ───────────────────────────────────────────────────────────── */

/**
 * When the player is at his screen. A session is an instant, not a stretch: he arrives, takes
 * every action he can, and leaves. Hours are given in the season's local clock; the rest
 * window is carved out of them by the scenario, not by this function.
 */
export function sessionMinutes(scenario) {
  const out = [];
  const total = scenario.seasonHours * 60;
  for (let day = 0; day * 1440 < total; day += 1) {
    for (const hour of scenario.checkInHours) {
      const minute = day * 1440 + Math.round(hour * 60);
      if (minute < total) out.push(minute);
    }
  }
  return out.sort((a, b) => a - b);
}

export function run(scenario, policy) {
  const s = createState(scenario);
  const total = scenario.seasonHours * 60;
  const sessions = new Set(sessionMinutes(scenario));
  let busyMinutes = 0;
  let gap = 0;
  let longestGap = 0;

  while (s.minute < total) {
    advanceConstruction(s);
    advanceQueues(s);
    advanceLosses(s);

    if (sessions.has(s.minute)) {
      const before = s.log.length;
      policy(s);
      const actions = s.log.filter(
        (e, i) => i >= before && ['build', 'recruit', 'lot'].includes(e.kind),
      ).length;
      s.sessions.push({ minute: s.minute, actions });
    }

    const active = s.construction !== null || queuedCount(s) > 0;
    if (active) { busyMinutes += 1; gap = 0; } else { gap += 1; longestGap = Math.max(longestGap, gap); }

    if (s.minute % 15 === 0) {
      s.series.push({
        h: s.minute / 60,
        alloy: Math.round(s.stocks.alloy),
        ammunition: Math.round(s.stocks.ammunition),
        troops: s.troops.length,
        queued: queuedCount(s),
        hq: hqLevel(s),
        sites: s.sites.length,
      });
    }
    advanceEconomy(s, 1);
    s.minute += 1;
  }

  return { state: s, busyPct: (busyMinutes / total) * 100, longestGap };
}
