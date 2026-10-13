import {
  BUILDABLE_BUILDINGS,
  canonicalBuildingKey,
  RESOURCES,
  type BuildCostKey,
  type BuildingKey,
  type DepositKey,
  type ResourceKey,
} from './ids';
import {
  EXPLOITED_DEPOSITS,
  placementRefusal,
  settlesDebt,
  type FoundationDebt,
  type PlacementRefusal,
} from './economy';
import {
  currentStock,
  sameSite,
  type Building,
  type BuildSpec,
  type Cost,
  type PlayerView,
  type RegionView,
  type Resource,
  type SiteRef,
} from './player-view';

/**
 * Why a building is offered here rather than elsewhere. It is the sentence that teaches the
 * map: a player who reads "coal deposit" under a mine has understood the region, not the menu.
 */
export type BuildReason =
  { readonly kind: 'deposit'; readonly deposit: DepositKey } | { readonly kind: 'coastal' };

/**
 * What holds a line back **for now** — as opposed to what this ground can never carry, which
 * is `BlockedReason` below. The two are drawn apart and must stay apart: a hold is a deadline
 * or a remedy ("come back in twenty minutes"), a block is a fact about the region.
 *
 * A running site is no longer one of them: the queue is unbounded and paid at the enqueue
 * (25/08), so a chantier holds back nothing but its own turn.
 */
export type BuildHold = 'siteSlots' | 'materials';

export type BuildOption = {
  readonly key: BuildingKey;
  readonly cost: Cost;
  readonly minutes: number;
  readonly reason: BuildReason | null;
  readonly hold: BuildHold | null;
  /** Owed by the format's foundation: placed for nothing, standing at once. */
  readonly free: boolean;
};

/** The region as placement reads it, plus what the player is: the two halves of the rule. */
export type Site = {
  readonly deposit: DepositKey | null;
  readonly coastal: boolean;
  /** The building already standing on this very region — one per region (ADR 0015). */
  readonly standing: BuildingKey | null;
  /**
   * **The site this region hangs from** (ADR 0020 §10) — `null` is ground no living site of the
   * player reaches any more, and nothing goes up there.
   */
  readonly site: SiteRef | null;
  /** What stands on that site **plus what the queue has pledged there**: an entry has paid for
   *  its placement, and leaving it out would make the queue where a nation keeps what it may
   *  not hold. Never a national total — a full home ground holds nothing back at an outpost. */
  readonly taken: number;
  readonly slots: number;
  readonly hqLevel: number;
  readonly stocks: Readonly<Record<ResourceKey, number>>;
  /** A construction aimed at **this very region**, running or queued: nothing stands yet, but
   *  the ground is taken — the server refuses a second entry on it (`constructions.ts`). */
  readonly constructionHere: boolean;
  /** What the season still owes (`me.foundation`), served — never re-derived here. Une dette
   *  est un couple : elle ne s'acquitte que sur le gisement qu'elle nomme, sauf celle du
   *  quartier général, que le sol ne nomme pas (`settlesDebt`). */
  readonly foundation: ReadonlyArray<FoundationDebt>;
};

/**
 * What may be built on a region, and what merely holds it back. The rule is
 * `placementRefusal` — the one the server refuses with — read **twice**: once with the
 * circumstances lifted, which says what this ground can ever carry, and once as things
 * actually stand, which says what is blocked today. Two readings of one rule rather than a
 * second copy of it: a copy would offer what the server refuses, or hide what it accepts.
 *
 * Raising a building is deliberately absent. Upgrading belongs to the nation sheet — one verb
 * per surface — so the key already standing here never comes back in the list.
 */
export function buildableOn(
  site: Site,
  catalog: Readonly<Record<BuildingKey, BuildSpec>>,
): ReadonlyArray<BuildOption> {
  if (site.constructionHere || site.site === null) return [];

  const region = { deposit: site.deposit, coastal: site.coastal };
  return BUILDABLE_BUILDINGS.flatMap((key) => {
    if (key === site.standing) return [];
    // Nothing rises above the headquarters, and a level-1 building needs one standing.
    if (key === 'hq' ? site.hqLevel > 0 : site.hqLevel === 0) return [];

    const spec = catalog[key];
    /**
     * The tier is **not** lifted with the circumstances: a key the headquarters does not open
     * yet is not *offered*. It is not lost either — `blockedOn` picks it up for the shelf, and
     * says which tier it waits on. What holds a line back today the offer says; what the ground
     * or the season refuses outright belongs under it.
     */
    const byNature = placementRefusal(
      key,
      region,
      {
        onRegion: site.standing,
        taken: 0,
        slots: Number.POSITIVE_INFINITY,
        hqLevel: site.hqLevel,
      },
      spec.unlockedAtHqLevel,
    );
    if (byNature !== null) return [];

    const asThingsStand = placementRefusal(
      key,
      region,
      {
        onRegion: site.standing,
        taken: site.taken,
        slots: site.slots,
        hqLevel: site.hqLevel,
      },
      spec.unlockedAtHqLevel,
    );

    /**
     * A key the foundation still owes is placed for nothing and stands at once — so it carries
     * no bill and no delay, and **nothing at all holds it back**: neither matter, nor a running
     * site, nor the ceiling since 25/08. The debt of the format outranks the ambition of the
     * player, and the ambition is what waits for the headquarters.
     */
    const free = site.foundation.some((due) => settlesDebt(due, { key, deposit: site.deposit }));
    const cost = free ? {} : spec.cost;
    const siteFull = !free && asThingsStand === 'SITE_SLOTS_FULL';

    return [
      {
        key,
        cost,
        minutes: free ? 0 : spec.minutes,
        reason: reasonFor(key, site.deposit),
        free,
        hold: holdOn(site, free, cost, siteFull),
      } satisfies BuildOption,
    ];
  });
}

/**
 * Why this ground can never carry a building — the *catalogue* half of the panel, under the
 * offer. It says which single requirement the region fails, and it is only ever asked about a
 * key `buildableOn` has already left out: the decision of what is offered stays in one place,
 * and this names the cause rather than re-taking the decision.
 *
 * That ordering is what makes the fall-through sound. A key excluded with the region free and
 * the tier open has nothing left to fail but its own nature — its deposit, or a coast.
 */
export type BlockedReason =
  | { readonly kind: 'constructionHere' }
  /** No living site of the player reaches this ground any more — a destroyed outpost leaves its
   *  buildings standing and its anchor dead (ADR 0020 §10). */
  | { readonly kind: 'outOfReach' }
  | { readonly kind: 'standing' }
  | { readonly kind: 'regionTaken'; readonly by: BuildingKey }
  | { readonly kind: 'unique' }
  | { readonly kind: 'locked'; readonly hqLevel: number }
  | { readonly kind: 'deposit'; readonly deposits: ReadonlyArray<DepositKey> }
  | { readonly kind: 'coastal' }
  | { readonly kind: 'here' };

/** A catalogue line: the bill and the wait are served too, because they are what a player
 *  plans against — the reason says *not here*, the price says *what it will take*. */
export type BlockedOption = {
  readonly key: BuildingKey;
  readonly cost: Cost;
  readonly minutes: number;
  readonly reason: BlockedReason;
};

/**
 * **The rest of the catalogue**, in the order of `BUILDABLE_BUILDINGS` — every key the offer left out,
 * each carrying the requirement it fails. Together with `buildableOn` it partitions the
 * fifteen exactly once, by construction: the complement of a list, never a second reading of
 * the placement rule.
 *
 * ADR 0015 wanted the panel contextual and grey-free, and this walks that back on purpose: a
 * player cannot learn a catalogue he has never seen, and "no crane here" taught him nothing
 * about where the crane *would* work. The grey is a **reference shelf, kept below the offer**
 * and never mixed into it — the top of the panel is still only what the click can order.
 */
export function blockedOn(
  site: Site,
  catalog: Readonly<Record<BuildingKey, BuildSpec>>,
): ReadonlyArray<BlockedOption> {
  const offered = new Set(buildableOn(site, catalog).map((option) => option.key));
  return BUILDABLE_BUILDINGS.filter((key) => !offered.has(key)).map((key) => ({
    key,
    cost: catalog[key].cost,
    minutes: catalog[key].minutes,
    reason: blockedBecause(site, key, catalog[key]),
  }));
}

function blockedBecause(site: Site, key: BuildingKey, spec: BuildSpec): BlockedReason {
  if (site.constructionHere) return { kind: 'constructionHere' };
  if (site.site === null) return { kind: 'outOfReach' };
  if (key === site.standing) return { kind: 'standing' };
  if (site.standing !== null) return { kind: 'regionTaken', by: site.standing };
  if (key === 'hq') return { kind: 'unique' };

  // Un quartier général à zéro refuse toute autre clé, puisque `UNLOCKED_AT` les demande toutes
  // à 1 — et depuis la décision 1b du 13/09 c'est l'état d'une saison qui vient de s'ouvrir. La
  // phrase reste celle des paliers : le seul geste qui la lève est la pose du QG, que l'offre
  // au-dessus est en train de proposer.
  const needed = Math.max(1, spec.unlockedAtHqLevel);
  if (site.hqLevel < needed) return { kind: 'locked', hqLevel: needed };

  const deposits = EXPLOITED_DEPOSITS[key];
  if (deposits !== undefined) return { kind: 'deposit', deposits };
  if (key === 'port') return { kind: 'coastal' };
  return { kind: 'here' };
}

/**
 * What stands between a line and the click, most immediate first. **A running site holds
 * nothing back any more** (the queue is unbounded and paid at the enqueue), and **neither do
 * the placements on a key the season owes** (25/08): a debt of the format is not refused by a
 * rule of the format, and the server places it the same way (`constructions.start`). What is
 * left on a free line is nothing at all, and on a paid one the site and the bill.
 */
function holdOn(site: Site, free: boolean, cost: Cost, siteFull: boolean): BuildHold | null {
  if (free) return null;
  if (siteFull) return 'siteSlots';
  return affordable(cost, site.stocks) ? null : 'materials';
}

const affordable = (cost: Cost, stocks: Readonly<Record<ResourceKey, number>>): boolean =>
  Object.entries(cost).every(([key, amount]) => stocks[key as ResourceKey] >= (amount ?? 0));

function reasonFor(key: BuildingKey, deposit: DepositKey | null): BuildReason | null {
  if (deposit !== null && EXPLOITED_DEPOSITS[key]?.includes(deposit)) {
    return { kind: 'deposit', deposit };
  }
  return key === 'port' ? { kind: 'coastal' } : null;
}

/**
 * **The whole construction queue as one list**, head first — the running site and everything
 * paid for behind it. Every rule that used to ask "is a construction running" asks this
 * instead: the queue is unbounded now, and what matters is no longer *whether* one runs but
 * *what ground and how many slots* the queue has already claimed.
 */
export const pledgedWork = (
  view: PlayerView,
): ReadonlyArray<{
  readonly key: BuildCostKey;
  readonly regionId: string;
  readonly outpostId: string | null;
}> =>
  view.me.construction === null
    ? view.me.constructionQueue
    : [view.me.construction, ...view.me.constructionQueue];

/** Ce que la file bâtit, l'élévation d'un avant-poste retirée : elle ne pose rien sur un sol,
 *  donc elle ne prend ni région ni emplacement (précision du 15/09). */
const pledgedBuildings = (view: PlayerView) =>
  pledgedWork(view).filter((work) => work.outpostId === null);

/** The regions a construction is aimed at. One entry per region, so this is also the set of
 *  regions no further entry may take (`convex/constructions.ts`). */
export const pledgedRegions = (view: PlayerView): ReadonlySet<string> =>
  new Set(pledgedBuildings(view).map((work) => work.regionId));

/**
 * How many placements of **one site** the queue has already claimed. A pledge on a bare region
 * is a building coming; a pledge on a region that already carries one is a raise, and a raise
 * moves neither the count nor the site's budget — the server counts it exactly this way.
 *
 * Per site and never nationally (ADR 0020 §10): a queue filling an outpost holds nothing back
 * at home, which is the whole point of a local budget.
 */
export const pledgedOn = (view: PlayerView, site: SiteRef | null): number =>
  site === null
    ? 0
    : pledgedBuildings(view).filter((work) => {
        if (view.me.buildings.some((building) => building.regionId === work.regionId)) return false;
        const aimed = view.me.regions.find((region) => region.id === work.regionId)?.site ?? null;
        return aimed !== null && sameSite(aimed, site);
      }).length;

/** What a site carries and what stands on it, straight from the view — zeroes for a region no
 *  site of the player's reaches, which is a region nothing goes up on. */
export const slotsOn = (
  view: PlayerView,
  site: SiteRef | null,
): { readonly taken: number; readonly total: number } => {
  const budget =
    site === null ? undefined : view.me.siteSlots.find((held) => sameSite(held.site, site));
  return {
    taken: (budget?.taken ?? 0) + pledgedOn(view, site),
    total: budget?.total ?? 0,
  };
};

/**
 * The site a player's view describes for one region, or `null` when that region is none of
 * his business — the view only carries his own ground, so absence *is* the answer to "may I
 * build there".
 */
export function siteOf(view: PlayerView, regionId: string, now: number): Site | null {
  const region: RegionView | undefined = view.me.regions.find(
    (candidate) => candidate.id === regionId,
  );
  if (region === undefined) return null;
  const stocks = Object.fromEntries(
    Object.entries(view.me.resources).map(([key, resource]) => [
      key,
      currentStock(resource, view.loadedAt, now),
    ]),
  ) as Record<ResourceKey, number>;

  const slots = slotsOn(view, region.site);
  return {
    deposit: region.deposit,
    coastal: region.coastal,
    standing: region.buildings[0]?.key ?? null,
    site: region.site,
    taken: slots.taken,
    slots: slots.total,
    hqLevel: view.me.hqLevel,
    stocks,
    constructionHere: pledgedRegions(view).has(regionId),
    foundation: view.me.foundation,
  };
}

/** The panel's list, straight from a view. Empty means the region can carry nothing, ever. */
export function buildOptionsAt(
  view: PlayerView,
  regionId: string,
  now: number,
): ReadonlyArray<BuildOption> {
  const site = siteOf(view, regionId, now);
  return site === null ? [] : buildableOn(site, view.buildCatalog);
}

/**
 * What holds a **raise** back, `null` when nothing does. Raising is not placing: the region is
 * already held and already counted, so neither the one-per-region rule nor the building ceiling
 * has anything to say — which is why this reads the three refusals `constructions.start` can
 * still raise, and not `placementRefusal`.
 *
 * None of them is re-decided here. The queue and the headquarters ceiling arrive cooked in the
 * view (`me.construction`, `me.constructionQueue`, `building.cappedByHq`); the bill is the
 * served cost against the served stock. A fourth rule appearing in this function would mean the
 * view is short of a field — the answer is to serve it, never to guess it.
 */
export type UpgradeHold =
  /** An order already stands on this region — one entry per region, running or queued. */
  | { readonly kind: 'alreadyQueued' }
  | { readonly kind: 'cappedByHq' }
  | {
      readonly kind: 'materials';
      readonly resource: ResourceKey;
      readonly needed: number;
      readonly available: number;
    };

/**
 * When the missing matter will be there. **A refusal that counts is a wall; a refusal that
 * dates itself is a plan** — "il faut 72 de charbon (0 disponibles)" tells a player he has
 * lost, "disponible dans 4 h 20" tells him to come back.
 *
 * `never` is the one that earns its place. When nothing produces the matter — no mine, so no
 * coal, ever — a countdown would be a lie, and the honest sentence names the building to
 * raise. The ceiling counts as never too: a bill above what the warehouses can hold is not
 * waiting on time, it is waiting on a warehouse.
 */
export type Availability =
  | { readonly kind: 'now' }
  | { readonly kind: 'inMinutes'; readonly minutes: number }
  | { readonly kind: 'never' };

export function availabilityOf(needed: number, held: Resource, stock: number): Availability {
  if (stock >= needed) return { kind: 'now' };
  if (needed > held.cap || held.ratePerHour <= 0) return { kind: 'never' };
  return { kind: 'inMinutes', minutes: ((needed - stock) / held.ratePerHour) * 60 };
}

export function upgradeHold(building: Building, view: PlayerView, now: number): UpgradeHold | null {
  // A raise already queued on this very region is the one thing that still blocks a second
  // order there: the server allows one entry per region, standing or not.
  if (pledgedRegions(view).has(building.regionId)) return { kind: 'alreadyQueued' };
  if (building.cappedByHq) return { kind: 'cappedByHq' };

  // The first shortfall in resource order, never a list: a bill is paid whole or not at all
  // (`debit` checks every cost before debiting any), so naming one is naming the blockage.
  for (const resource of RESOURCES) {
    const needed = building.nextLevelCost[resource] ?? 0;
    if (needed === 0) continue;
    const available = currentStock(view.me.resources[resource], view.loadedAt, now);
    if (available < needed) return { kind: 'materials', resource, needed, available };
  }
  return null;
}

/**
 * **Ce qui empêche de monter un avant-poste**, `null` quand rien ne l'empêche — la règle de la
 * précision du 15/09 (ADR 0020 §10), lue par les deux bouts : le bouton du panneau de garnison
 * et la mutation qui met en file. Deux copies auraient divergé, et la divergence aurait été un
 * bouton qui offre ce que le serveur refuse (ADR 0015 : rien n'est grisé, la phrase dit
 * pourquoi).
 *
 * Quatre, et pas une de plus : le niveau maximal, la désactivation — *on ne rénove pas sous le
 * feu* —, une élévation déjà en file sur ce point, et la facture. Aucune garnison n'est exigée
 * et aucun palier de quartier général : l'avant-poste est déjà debout, monter n'est pas poser.
 */
export type OutpostRaiseHold =
  | { readonly kind: 'maxLevel'; readonly maximum: number }
  | { readonly kind: 'disabled' }
  | { readonly kind: 'alreadyQueued' }
  | {
      readonly kind: 'materials';
      readonly resource: ResourceKey;
      readonly needed: number;
      readonly available: number;
    };

/** L'avant-poste tel que la règle le lit — jamais un document, jamais une vue : les deux bouts
 *  n'ont pas les mêmes en main, et ils doivent poser la même question. */
export type OutpostRaise = {
  readonly level: number;
  readonly disabled: boolean;
  /** Une élévation de **ce** point déjà payée et en file. Une seconde attendrait un niveau que
   *  la première n'a pas encore atteint, donc tarifé faux. */
  readonly queued: boolean;
  readonly stocks: Readonly<Record<ResourceKey, number>>;
};

export function outpostRaiseHold(
  outpost: OutpostRaise,
  cost: Cost,
  maximum: number,
): OutpostRaiseHold | null {
  if (outpost.level >= maximum) return { kind: 'maxLevel', maximum };
  if (outpost.disabled) return { kind: 'disabled' };
  if (outpost.queued) return { kind: 'alreadyQueued' };

  // Le premier manque dans l'ordre des ressources, jamais une liste : une facture se paie
  // entière ou pas du tout (`debit`), donc en nommer une est nommer le blocage.
  for (const resource of RESOURCES) {
    const needed = cost[resource] ?? 0;
    if (needed === 0) continue;
    const available = outpost.stocks[resource];
    if (available < needed) return { kind: 'materials', resource, needed, available };
  }
  return null;
}

/**
 * **Ce qui empêche de fonder**, `null` quand rien ne l'empêche (révision du 15/09 de l'ADR 0020
 * §10 : fonder se paie). La seule retenue qui vive ici est la facture — la composition de la
 * colonne et le sol sont l'affaire de `foundingRefusal`, que le serveur refuse avec —, et elle
 * est lue par les deux bouts : la rose n'offre pas la branche que `debit` refuserait.
 *
 * Même forme et même ordre que `outpostRaiseHold` : la première matière qui manque, jamais une
 * liste, parce qu'une facture se paie entière ou pas du tout.
 */
export function foundationHold(
  view: PlayerView,
  now: number,
): Extract<OutpostRaiseHold, { kind: 'materials' }> | null {
  for (const resource of RESOURCES) {
    const needed = view.outpostFoundation.cost[resource] ?? 0;
    if (needed === 0) continue;
    const available = currentStock(view.me.resources[resource], view.loadedAt, now);
    if (available < needed) return { kind: 'materials', resource, needed, available };
  }
  return null;
}

/** Les avant-postes qu'une élévation en file vise déjà — la lecture cliente de `queued`. */
export const pledgedOutposts = (view: PlayerView): ReadonlySet<string> =>
  new Set(pledgedWork(view).flatMap((work) => (work.outpostId === null ? [] : [work.outpostId])));

/**
 * **Ce qui empêche de raser**, `null` quand rien ne l'empêche (demande de Pierre, 15/09). Deux
 * empêchements et pas un de plus, lus par la rose et par la mutation — une seconde table aurait
 * offert une branche que le serveur refuse (ADR 0015).
 *
 * Le quartier général est le seul bâtiment qu'on ne rase pas : sa destruction serait une
 * révision de « jamais éliminé » (question 39), et elle n'est pas tranchée. Tout le reste part,
 * debout ou en cours d'élévation.
 *
 * **Rien ici ne parle d'une file de démolition** : raser est immédiat — il n'y a pas de chantier
 * à attendre, donc pas d'état « déjà en cours » à lire. Le jour où la démolition prendrait du
 * temps, c'est ici que la retenue viendrait.
 */
export type DemolitionRefusal = 'NOT_YOURS' | 'HQ_NEVER_DEMOLISHED';

/** Le bâtiment tel que la règle le lit — jamais un document, jamais une vue : les deux bouts
 *  n'ont pas les mêmes en main, et ils doivent poser la même question. */
export type Demolition = {
  readonly key: BuildingKey;
  /** Trouvé parmi les siens : un mât adverse relevé n'est pas un bâtiment qu'on rase. */
  readonly mine: boolean;
};

export const demolitionRefusalOf = (building: Demolition): DemolitionRefusal | null =>
  !building.mine ? 'NOT_YOURS' : building.key === 'hq' ? 'HQ_NEVER_DEMOLISHED' : null;

/**
 * **Ce qui empêche de démanteler son propre avant-poste** (décision de Pierre, 16/09), `null`
 * quand rien ne l'empêche. Deux empêchements, lus par la rose et par la mutation — une seconde
 * table aurait offert une branche que le serveur refuse (ADR 0015).
 *
 * **Un chantier n'en est pas un** : un point qui n'est pas encore debout se démantèle comme les
 * autres, et ce qui est en file s'annule selon la règle de la file. Ce qu'on retire là est une
 * promesse, pas une bâtisse.
 *
 * **Servir un mouvement retient, en revanche.** Un relais dans la portée duquel une colonne
 * marche a déjà payé son allure : le retirer sous ses pieds ferait bouger un horaire déjà
 * annoncé. C'est exactement la lecture qui scelle le métier du point (`specializationsServed`,
 * servie au client par `specializationLocked`), et il n'y en a pas deux.
 */
export type OutpostDismantleRefusal = 'NOT_YOURS' | 'OUTPOST_SERVING';

/** L'avant-poste tel que la règle le lit — jamais un document, jamais une vue : les deux bouts
 *  n'ont pas les mêmes en main, et ils doivent poser la même question. */
export type OutpostDismantle = {
  readonly mine: boolean;
  readonly serving: boolean;
};

export const outpostDismantleRefusalOf = (
  outpost: OutpostDismantle,
): OutpostDismantleRefusal | null =>
  !outpost.mine ? 'NOT_YOURS' : outpost.serving ? 'OUTPOST_SERVING' : null;

/**
 * **Ce que l'entrepôt rasé fait perdre, matière par matière** (5a : rien n'est rendu, et le
 * stock au-dessus du nouveau plafond est écrêté). Vide pour tout ce qui ne stocke pas — et
 * `depot` historique compte comme un entrepôt, comme partout ailleurs depuis le 09/09.
 *
 * La popin de confirmation le dit en chiffres avant le clic, et le serveur l'applique après
 * (`clipToStorage`) : c'est la même soustraction, jamais deux.
 */
export function demolitionClipping(
  building: Building,
  view: PlayerView,
  now: number,
): ReadonlyArray<{ readonly resource: ResourceKey; readonly lost: number }> {
  if (canonicalBuildingKey(building.key) !== 'warehouse') return [];
  return RESOURCES.flatMap((resource) => {
    const held = view.me.resources[resource];
    const stock = currentStock(held, view.loadedAt, now);
    const lost = stock - (held.cap - view.storageCapPerLevel * building.level);
    return lost > 0 ? [{ resource, lost }] : [];
  });
}

/**
 * Why **no region at all** takes a key — `null` when at least one does. Where `BlockedReason`
 * above answers "not here", this answers "nowhere yet", which is the only question the
 * mobilisation order and the supply chart ever ask: they name a building, never a ground.
 */
export type PlacementCondition =
  | { readonly kind: 'locked'; readonly hqLevel: number }
  | { readonly kind: 'deposit'; readonly deposits: ReadonlyArray<DepositKey> }
  | { readonly kind: 'coastal' }
  /** Every site of his is full — the headquarters or an outpost has to rise (ADR 0020 §10). */
  | { readonly kind: 'siteFull' }
  | { readonly kind: 'regionsTaken' };

export type Placement = {
  readonly key: BuildingKey;
  /** The player's own regions that accept it right now, in the order the view serves them. */
  readonly regionIds: ReadonlyArray<string>;
  /** `null` as soon as `regionIds` holds one. */
  readonly condition: PlacementCondition | null;
  /** Owed by the season's foundation: placed for nothing and standing at once. */
  readonly free: boolean;
};

/**
 * **Where a key may go down, over the whole of the player's ground.** `buildableOn` answers
 * "what can stand here"; this answers the opposite question — "where does this go" — which is
 * the one the mobilisation order asks when a clé is clicked, and the one the supply chart asks
 * of a missing link.
 *
 * Same rule, same two readings as `buildableOn` and for the same reason: once with the
 * circumstances lifted, which says what the ground can *ever* carry, and once as things stand.
 * A key nothing can ever take names its nature — a deposit, a coast, a headquarters level; a
 * key every region merely happens to refuse today names the circumstance. Neither sentence is
 * written here twice over: `placementRefusal` is the server's own refusal.
 */
export function placementOf(view: PlayerView, key: BuildingKey): Placement {
  const unlockedAtHqLevel = view.buildCatalog[key].unlockedAtHqLevel;
  const free = view.me.foundation.some((due) => due.key === key);
  const hqLevel = view.me.hqLevel;
  // Nothing rises above the headquarters, and a level-1 building needs one standing — the same
  // pair of guards `buildableOn` opens on, because it is the same catalogue.
  const impossible = key === 'hq' ? hqLevel > 0 : hqLevel === 0;

  const regionIds: string[] = [];
  const natures = new Set<PlacementRefusal>();
  const pledged = pledgedRegions(view);
  let carriable = false;

  for (const region of impossible ? [] : view.me.regions) {
    const byNature = placementRefusal(
      key,
      region,
      { onRegion: null, taken: 0, slots: Number.POSITIVE_INFINITY, hqLevel },
      unlockedAtHqLevel,
    );
    if (byNature !== null) {
      natures.add(byNature);
      continue;
    }
    carriable = true;

    // A region an entry of the queue aims at is taken, though nothing stands on it yet — the
    // `finish` will fill it, and the server refuses a second entry there (`start`).
    if (pledged.has(region.id)) continue;
    // Ground no living site reaches carries nothing at all, whatever its deposit.
    if (region.site === null) continue;
    const slots = slotsOn(view, region.site);
    const asThingsStand = placementRefusal(
      key,
      region,
      {
        onRegion: region.buildings[0]?.key ?? null,
        taken: slots.taken,
        // A key the season owes escapes the budget, exactly as the server places it (25/08).
        slots: free ? Number.POSITIVE_INFINITY : slots.total,
        hqLevel,
      },
      unlockedAtHqLevel,
    );
    if (asThingsStand === null) regionIds.push(region.id);
  }

  if (regionIds.length > 0) return { key, regionIds, condition: null, free };
  return { key, regionIds, condition: conditionOf(view, key, carriable, natures), free };
}

/**
 * The single sentence that would open a key. Nature before circumstance: a player told his
 * sites are full will raise his headquarters, and find the well still refused for want of a
 * deposit — the ground is the fact, a full site is only today.
 */
function conditionOf(
  view: PlayerView,
  key: BuildingKey,
  carriable: boolean,
  natures: ReadonlySet<PlacementRefusal>,
): PlacementCondition {
  if (!carriable) {
    if (natures.has('BUILDING_LOCKED')) {
      return { kind: 'locked', hqLevel: Math.max(1, view.buildCatalog[key].unlockedAtHqLevel) };
    }
    const deposits = EXPLOITED_DEPOSITS[key];
    if (deposits !== undefined) return { kind: 'deposit', deposits };
    if (key === 'port') return { kind: 'coastal' };
    // Nothing left for a key the headquarters opens and the ground never refuses: a level-0
    // headquarters, or the second headquarters that never exists.
    return { kind: 'locked', hqLevel: Math.max(1, view.buildCatalog[key].unlockedAtHqLevel) };
  }
  // A key the season owes is never held by a full site, so its only remaining excuse is ground.
  return !view.me.foundation.some((due) => due.key === key) &&
    view.me.siteSlots.every((held) => slotsOn(view, held.site).taken >= held.total)
    ? { kind: 'siteFull' }
    : { kind: 'regionsTaken' };
}

/**
 * **How far a site has risen, 0 to 1** — the share of its duration already spent. The view
 * serves only the minutes left; the duration is the scale's (`buildMinutes`), the same the
 * server dated the site by, so the share is read and not invented. Clamped: a site dated
 * under an older scale, or a clock a little ahead, never overflows.
 */
export const riseOf = (minutesLeft: number, totalMinutes: number): number =>
  totalMinutes <= 0 ? 1 : Math.min(1, Math.max(0, 1 - minutesLeft / totalMinutes));
