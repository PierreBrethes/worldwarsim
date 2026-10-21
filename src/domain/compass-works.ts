import { pileAt, posted } from './compass-fan';
import { countryLabel, fr, noBuilding, raiseHoldText, upgradeHoldText } from '@/i18n/fr';
import {
  availabilityOf,
  buildOptionsAt,
  demolitionRefusalOf,
  foundationHold,
  outpostDismantleRefusalOf,
  outpostRaiseHold,
  pledgedOutposts,
  upgradeHold,
  type OutpostRaiseHold,
  type UpgradeHold,
} from './construction';
import { asDuration } from './duration';
import { notInBlitz } from './blitz';
import { PRODUCER_OF } from './economy';
import { DEPOSITS, RESOURCES, SPECIALIZATIONS } from './ids';
import { foundingRefusal, type OrderRefusal } from './movement-orders';
import { NATION_BY_ADM0 } from './nations';
import type { ResourceKey } from './ids';
import {
  currentStock,
  type Building,
  type Cost,
  type OutpostView,
  type PlayerView,
  type TroopView,
} from './player-view';
import type { BillLine, Compass, CompassAction, CompassTarget } from './compass-rose';

type Allegiance = 'mine' | 'enemy' | 'neutral';

function countryAllegiance(country: string, view: PlayerView): Allegiance {
  const nation = NATION_BY_ADM0.get(country);
  if (nation === undefined) return 'neutral';
  if (nation === view.me.nation) return 'mine';
  return view.opponents.some((opponent) => opponent.nation === nation) ? 'enemy' : 'neutral';
}

/**
 * The crane, and the crane only where something can actually go up. **Nothing greyed out,
 * ever**: on enemy ground or out of reach it is simply not in the fan — what a player cannot
 * do teaches him nothing, and that is the fog's rule as much as the menu's.
 *
 * A ceiling reached does not withdraw it: that block is a circumstance, the panel keeps the
 * lines and names the remedy. A crane vanishing five minutes after it was there reads as a
 * bug, not as a rule.
 */
/**
 * **La branche qui efface.** Elle ne porte ni prix ni facture : il n'y a rien à payer, et ce
 * qu'elle coûte — le niveau, le chantier, l'écrêtage — ne tient pas dans une bulle. C'est la
 * confirmation qui le dit, et c'est pour ça qu'il y en a une.
 */
const demolishOf = (buildingId: string): CompassAction => ({
  key: 'demolish',
  pictogram: 'rubble',
  label: fr.compass.demolish,
  cost: null,
  consequence: fr.compass.demolishConsequence,
  buildingId,
});

/**
 * **La branche qui démantèle.** Comme « raser », elle ne porte ni prix ni facture : rien n'est
 * rendu, et ce qu'elle emporte — la couleur, les bâtiments ancrés, la garnison qui passe au sol —
 * ne tient pas dans une bulle. C'est la confirmation qui l'énumère.
 */
const dismantleOf = (outpostId: string): CompassAction => ({
  key: 'dismantle',
  pictogram: 'rubble',
  label: fr.compass.dismantle,
  cost: null,
  consequence: fr.compass.dismantleConsequence,
  outpostId,
});

/**
 * **Les deux métiers, toujours les deux** (décision du 16/09). Le point en exerce un ; la plate
 * les montre tous les deux et marque celui-là. Une seule branche « changer de métier » aurait
 * caché l'état derrière le geste, et c'est l'état qui décide du geste.
 */
const specializationBranches = (outpost: OutpostView): ReadonlyArray<CompassAction> =>
  SPECIALIZATIONS.map((specialization) => ({
    key: 'specialize' as const,
    pictogram: specialization === 'relay' ? ('aerial' as const) : ('ear' as const),
    label: fr.specializations[specialization],
    cost: null,
    consequence:
      outpost.specialization === specialization
        ? fr.compass.specializationHeld
        : fr.compass.specializeConsequence(fr.specializations[specialization]),
    outpostId: outpost.id,
    specialization,
    current: outpost.specialization === specialization,
    sealed: outpost.specializationLocked ? fr.errors.SPECIALIZATION_SEALED() : null,
  }));

/** La facture d'une dépense, une ligne par matière due ; `lacking` nomme celle qui manque. */
const billOf = (cost: Cost, view: PlayerView, lacking?: ResourceKey): ReadonlyArray<BillLine> =>
  RESOURCES.filter((resource) => (cost[resource] ?? 0) > 0).map((resource) => ({
    resource,
    text: fr.compass.upgradeBill(
      fr.resources[resource],
      cost[resource] ?? 0,
      currentStock(view.me.resources[resource], view.loadedAt, view.loadedAt),
    ),
    lacking: lacking === resource,
  }));

/**
 * **La branche « élever » d'un point, ou le motif qui la remplace** — mot pour mot le contrat
 * d'`upgradeBranch` sur un bâtiment, et pour la même raison : `outpostRaiseHold` est l'arbitre
 * que la mutation relit, jamais une seconde table (ADR 0015).
 *
 * Le plafond ne se lit pas dans une constante : la vue sert `atMaxLevel`, donc le maximum passé
 * à la règle est « ce niveau-ci » quand il n'y a plus de marche et « le suivant » sinon. Un
 * chiffre d'équilibrage de moins à faire voyager jusqu'au domaine.
 */
function outpostRaiseBranch(
  outpost: OutpostView,
  view: PlayerView,
): { readonly action: CompassAction | null; readonly refusal: string | null } {
  const hold = outpostRaiseHold(
    {
      level: outpost.level,
      disabled: outpost.disabledMinutesLeft !== null,
      queued: pledgedOutposts(view).has(outpost.id),
      stocks: Object.fromEntries(
        RESOURCES.map((resource) => [
          resource,
          currentStock(view.me.resources[resource], view.loadedAt, view.loadedAt),
        ]),
      ) as Record<ResourceKey, number>,
    },
    outpost.nextLevelCost,
    outpost.atMaxLevel ? outpost.level : outpost.level + 1,
  );
  if (hold !== null && hold.kind !== 'materials')
    return { action: null, refusal: raiseHoldText(hold) };

  return {
    action: {
      key: 'raiseOutpost',
      pictogram: 'chevron',
      label: fr.garrison.raiseAction,
      cost: null,
      consequence: fr.compass.raiseConsequence(outpost.level + 1),
      outpostId: outpost.id,
      figure: outpost.nextLevelCost,
      bill: billOf(outpost.nextLevelCost, view, hold?.resource),
      duration: asDuration(outpost.nextLevelMinutes),
      hold:
        hold === null
          ? null
          : { reason: raiseHoldText(hold), availability: whenAffordable(hold, view) },
    },
    refusal: null,
  };
}

const buildOn = (regionId: string, regionName: string): CompassAction => ({
  key: 'build',
  pictogram: 'crane',
  label: fr.compass.build,
  cost: null,
  consequence: fr.compass.buildConsequence(regionName),
  regionId,
  regionName,
});

export function build(
  target: CompassTarget,
  view: PlayerView,
  /** La composition en main si la cible est la pile tenue, sinon `null`. */
  composition: ReadonlyArray<string> | null,
): Compass {
  /** **En Blitz on ne bâtit, n'élève, ne fonde ni ne rase rien** (`notInBlitz`) : au repos, ses
   *  mâts, ses points et ses piles n'ont aucune branche — le clic droit y reste inerte. */
  if (
    notInBlitz(view.mode) !== null &&
    (target.kind === 'region' ||
      target.kind === 'building' ||
      target.kind === 'outpost' ||
      target.kind === 'force')
  ) {
    return { kicker: '', name: '', actions: [], refusal: null };
  }
  switch (target.kind) {
    case 'region': {
      // The country's fan, plus one branch. A region is the same land seen closer: taking
      // away what the country offered would make zooming in cost the player actions.
      const country = build({ kind: 'country', country: target.country }, view, null);
      const buildable = buildOptionsAt(view, target.id, view.loadedAt).length > 0;
      return {
        kicker: fr.compass.region(country.name),
        name: target.name,
        actions: [...(buildable ? [buildOn(target.id, target.name)] : []), ...country.actions],
        refusal: null,
      };
    }
    /**
     * **Un pays ne se fait rien.** « Voir le pays » doublait le clic gauche, qui sélectionne déjà
     * ce qu'il touche (retrait demandé par Pierre, 31/08) — et une rose à une seule branche qui
     * refait le geste d'à côté est un menu qu'on ouvre pour rien. Le pays garde son nom et sa
     * qualification parce que la région les lui emprunte ; sans action, `compassOf` renvoie null
     * et le clic droit reste inerte, comme il l'est déjà en haute mer.
     */
    case 'country': {
      const allegiance = countryAllegiance(target.country, view);
      const held = view.me.outposts.some((outpost) => outpost.hostCountry === target.country);
      return {
        kicker:
          allegiance === 'neutral'
            ? held
              ? fr.compass.neutralHeld
              : fr.compass.neutralFree
            : allegiance === 'mine'
              ? fr.compass.myTerritory
              : fr.compass.enemyNation,
        name: countryLabel(target.country),
        actions: [],
        refusal: null,
      };
    }
    /**
     * **Un point à soi se commande comme un mât** (décision de Pierre, 16/09, Registre 27). Le
     * clic droit y était inerte : l'élévation et le métier vivaient dans le seul panneau de
     * garnison, c'est-à-dire derrière un clic gauche que rien n'annonçait. Quatre branches, du
     * nord dans le sens des aiguilles — élever, les deux métiers, démanteler — et le panneau
     * garde les siennes : la rose ajoute une porte, elle n'en ferme aucune.
     *
     * **Un point adverse ne change pas.** Il n'est pas à nous, il n'y a rien à y faire au repos,
     * et le clic droit y reste inerte comme sur un pays (décision du 31/08).
     *
     * **Un chantier n'a ni niveau à monter ni métier à régler** : il a une heure à attendre, et
     * le panneau la porte. Il se démantèle pourtant — ce qu'on retire alors est une promesse.
     */
    case 'outpost': {
      const mine = view.me.outposts.find((candidate) => candidate.id === target.id) ?? null;
      if (mine === null) {
        return {
          kicker: fr.compass.outpostAt(countryLabel(target.hostCountry)),
          name: target.name,
          actions: [],
          refusal: null,
        };
      }
      const standing = mine.standsAt === null;
      const raise = standing ? outpostRaiseBranch(mine, view) : { action: null, refusal: null };
      const dismantles = outpostDismantleRefusalOf({
        mine: true,
        serving: mine.specializationLocked,
      });
      return {
        kicker: fr.compass.myOutpost(mine.level),
        name: target.name,
        actions: [
          ...(raise.action === null ? [] : [raise.action]),
          ...(standing ? specializationBranches(mine) : []),
          ...(dismantles === null ? [dismantleOf(mine.id)] : []),
        ],
        /** Le motif de l'élévation d'abord : c'est la seule branche que le joueur cherche et ne
         *  trouve pas. Le démantèlement retenu se lit sur le point lui-même — une colonne y
         *  marche — et la branche du métier le dit déjà en toutes lettres. */
        refusal: raise.refusal ?? (dismantles === null ? null : fr.errors[dismantles]()),
      };
    }
    /**
     * **Le bâtiment porte l'élévation, et le sol sous lui garde la sienne** (décisions 54a et
     * 56a). Deux branches au plus : monter ce mât-ci, et bâtir dans la région qu'il occupe —
     * la seconde est celle de la région, mot pour mot, parce qu'un mât ne cache pas son sol.
     *
     * L'instance se relit dans la vue au lieu de voyager sur la cible : le coût, la durée et le
     * plafond du niveau suivant sont servis (`me.buildings`), et une rose qui les recopierait au
     * picking les afficherait périmés dès la première livraison.
     */
    case 'building': {
      const standing = view.me.buildings.find((candidate) => candidate.id === target.id) ?? null;
      const raise = standing === null ? null : upgradeBranch(standing, view);
      const region = view.me.regions.find((candidate) => candidate.id === target.regionId) ?? null;
      const buildable =
        region !== null && buildOptionsAt(view, target.regionId, view.loadedAt).length > 0;
      /**
       * **Raser vient en dernier** (demande du 15/09) : la plate se lit du nord dans le sens des
       * aiguilles, et ce qu'on efface n'est jamais ce qu'on cherche en ouvrant un menu. Le
       * quartier général n'a pas la branche — `demolitionRefusalOf` est la fonction que la
       * mutation refuse avec, et un mât que la vue ne porte pas n'est pas à nous.
       */
      const razes =
        standing !== null && demolitionRefusalOf({ key: standing.key, mine: true }) === null;
      return {
        kicker: fr.compass.building(target.level),
        name: standing?.name ?? fr.buildings[target.key],
        actions: [
          ...(raise?.action == null ? [] : [raise.action]),
          ...(buildable && region !== null ? [buildOn(region.id, region.name)] : []),
          ...(razes && standing !== null ? [demolishOf(standing.id)] : []),
        ],
        refusal: raise?.refusal ?? null,
      };
    }
    /**
     * **La rose d'une troupe ne dit que ce qui se fait sur place** (décision Pierre, 31/08). Il
     * n'y a pas de branche « envoyer » : désigner une troupe l'arme, et la destination se nomme
     * au clic droit **ailleurs**, où la rose propose déjà les marches que le serveur accepte.
     * Reste ce qu'on ne peut faire que là où l'on se tient — fonder — et rien la plupart du
     * temps : le cartouche s'ouvre alors seul, sans menu par-dessus.
     *
     * A column on the map is a movement in flight, and **a movement in flight takes no order**:
     * the fan says where it is, never what to do with it. The irreversibility is the game's
     * thesis, not an interface limitation (decision 13a).
     */
    case 'force': {
      const found = foundHere(target, view, composition);
      return {
        kicker: fr.compass.myForce(target.headcount),
        name: target.name,
        actions: found.action === null ? [] : [found.action],
        refusal: found.refusal,
      };
    }
    /**
     * **Au repos, ce qui appartient à l'autre ne se fait rien.** Une installation relevée et une
     * caisse relevée sont des cibles de la visée et d'elle seule : sans colonne armée il n'y a
     * pas d'ordre à donner là, et le clic droit reste inerte comme sur un pays (décision du
     * 31/08). La lecture, elle, se fait au clic gauche — la popin lit, la carte agit.
     */
    case 'installation':
    case 'loot':
    case 'camp':
    case 'track':
      return { kicker: '', name: '', actions: [], refusal: null };
    /**
     * **L'objectif est la seule cible qui parle au repos**, et c'est la conséquence de sa
     * publicité : il n'y a rien à cacher, donc le silence ne protégerait rien — il laisserait
     * seulement le joueur devant une réserve annoncée sans rien qui dise comment on la prend.
     * Pas de branche pour autant : ce qui manque est une colonne, et le motif le dit.
     */
    case 'objective':
      return {
        kicker: `${fr.objectives.markerKicker} · ${target.tier}`,
        name: target.name,
        actions: [],
        refusal: fr.objectives.needsAColumn,
      };
    case 'strategic':
      return {
        kicker: fr.points.kicker,
        name: target.name,
        actions: [],
        refusal: fr.points.needsAColumn,
      };
    /**
     * Unarmed, a point is just the land under it: one builds on a region and looks at a country,
     * and a coordinate is neither. Over water there is nothing to offer and the fan stays shut,
     * exactly as the open sea does today.
     */
    case 'point':
      return target.country === null
        ? {
            kicker: target.ground === 'lake' ? fr.compass.lake : fr.compass.openWater,
            name: target.name,
            actions: [],
            refusal: null,
          }
        : build({ kind: 'country', country: target.country }, view, null);
  }
}

/**
 * La phrase d'un refus de fondation, nourrie de ce que la rose a sous les yeux : le premier rôle
 * qui n'est pas de l'infanterie, et le nom de la région déjà bâtie. `fr.errors` reste la seule
 * table de phrases — il n'y a pas de seconde formulation ici, seulement des détails en plus.
 */
function foundingMotive(
  refusal: OrderRefusal,
  held: ReadonlyArray<TroopView>,
  target: Extract<CompassTarget, { kind: 'force' }>,
  view: PlayerView,
): string {
  if (refusal === 'INFANTRY_ONLY') {
    const role = held.find((troop) => troop.role !== 'infantry')?.role;
    return fr.errors.INFANTRY_ONLY(role === undefined ? {} : { role });
  }
  if (refusal === 'FRIENDLY_TARGET') {
    const region = view.me.regions.find((candidate) => candidate.id === target.regionId) ?? null;
    return fr.errors.FRIENDLY_TARGET(region === null ? {} : { region: region.name });
  }
  return fr.errors[refusal]({});
}

/**
 * **On fonde où l'on se tient** (ADR 0019 §1), donc la branche vit sur la pile elle-même et sur
 * rien d'autre : c'est son adresse qui devient le point, et sa composition entière qui décide.
 * `foundingRefusal` est la fonction dont le serveur refuse (`foundOutpostHere`) — la rose ne tient
 * pas une seconde table de ce qui plante un point.
 *
 * Le sol se lit sur la région dessinée sous la pile ; au-dessus du seuil de fondu il n'y en a
 * aucune et la branche paraît quand même — le refus du serveur reste alors possible, et c'est le
 * seul endroit où la rose ne peut pas savoir avant de demander.
 */
function foundHere(
  target: Extract<CompassTarget, { kind: 'force' }>,
  view: PlayerView,
  /** La composition en main, ou `null` : toute la pile posée là. */
  composition: ReadonlyArray<string> | null,
): { readonly action: CompassAction | null; readonly refusal: string | null } {
  const station = posted(target);
  if (station === null) return { action: null, refusal: null };
  const held = pileAt(station, view).filter(
    (troop) => composition === null || composition.includes(troop.id),
  );
  const onMyGround =
    target.regionId !== null &&
    view.me.buildings.some((building) => building.regionId === target.regionId);
  /**
   * **Un refus se lit, il ne se tait pas** (ADR 0015) : la rose retire la branche *et* dit
   * pourquoi, comme pour la matière qui manque juste en dessous. Le silence laissait le joueur
   * devant une pile posée sans « fonder » et sans rien à lire — le seul cas du jeu où un ordre
   * manquait sans motif.
   *
   * Les détails sont ce que la rose sait et que le serveur ne met pas dans sa charge utile : le
   * rôle qui bloque, et la région déjà bâtie. Sans eux la phrase reste celle du serveur.
   */
  /** **Le sol sous la pile, tel que la carte l'a lu** (règle 5 du 18/09) : c'est la cellule de
   *  la grille de routage, la même que la visée, et le serveur relit la sienne du même mot. */
  const refusal = foundingRefusal(
    held.map((troop) => troop.role),
    onMyGround,
    target.onLand,
  );
  if (refusal !== null) {
    return { action: null, refusal: foundingMotive(refusal, held, target, view) };
  }

  /**
   * **La matière qui manque retire la branche et dit pourquoi** (ADR 0015, règle générale) : la
   * facture sort de `foundationHold`, la fonction dont `debit` refuse côté serveur, et la phrase
   * est celle du serveur plutôt qu'une paraphrase.
   */
  const hold = foundationHold(view, view.loadedAt);
  if (hold !== null) {
    return {
      action: null,
      refusal: fr.errors.INSUFFICIENT_RESOURCE({
        resource: hold.resource,
        needed: hold.needed,
        available: Math.floor(hold.available),
      }),
    };
  }

  const cost = view.outpostFoundation.cost;
  return {
    action: {
      key: 'found',
      pictogram: 'post',
      label: fr.compass.found,
      cost: null,
      consequence: fr.compass.foundConsequence,
      point: station.lonLat,
      regionId: target.regionId,
      troopIds: held.map((troop) => troop.id),
      figure: cost,
      bill: billOf(cost, view),
      duration: asDuration(view.outpostFoundation.minutes),
    },
    refusal: null,
  };
}

/**
 * **La branche « améliorer », ou le motif qui la remplace** — et `upgradeHold` est l'arbitre,
 * jamais une seconde table (même principe que `legalMovementTypes`, ADR 0015). Trois retenues,
 * une seule dite à la fois, dans l'ordre du contrat 04 :
 *
 * - un chantier déjà en file sur cette région, ou le plafond du quartier général : la branche
 *   **n'existe pas** et la rose s'ouvre sur son motif — règle générale, rien de grisé ;
 * - une matière qui manque : la branche **reste, grisée, avec sa raison** et son échéance.
 *   C'est l'exception assumée de la décision 54a, et la seule du jeu : un manque de matière est
 *   transitoire, se chiffre et se date, quand un ordre illégal ne se rattrape jamais.
 *
 * Les phrases sont celles du serveur (`upgradeHoldText`), jamais des paraphrases : le joueur ne
 * doit pas lire une chose avant le clic et une autre après.
 */
function upgradeBranch(
  building: Building,
  view: PlayerView,
): { readonly action: CompassAction | null; readonly refusal: string | null } {
  const hold = upgradeHold(building, view, view.loadedAt);
  if (hold !== null && hold.kind !== 'materials')
    return { action: null, refusal: upgradeHoldText(hold) };

  return {
    action: {
      key: 'upgrade',
      pictogram: 'chevron',
      label: fr.upgrade.action,
      cost: null,
      consequence: fr.upgrade.title(building.name, building.level + 1),
      buildingKey: building.key,
      regionId: building.regionId,
      point: building.point,
      figure: building.nextLevelCost,
      bill: billOf(building.nextLevelCost, view, hold?.resource),
      duration: asDuration(building.nextLevelMinutes),
      hold:
        hold === null
          ? null
          : { reason: upgradeHoldText(hold), availability: whenAffordable(hold, view) },
    },
    refusal: null,
  };
}

/**
 * **Un refus qui compte est un mur, un refus qui se date est un plan** — la même phrase que la
 * ligne d'élévation des fenêtres (`UpgradeControl`), et pour la même raison. `never` nomme le
 * bâtiment à monter plutôt que de promettre une attente : rien ne produit la matière, donc
 * aucun compte à rebours n'est vrai.
 */
function whenAffordable(
  hold: Extract<UpgradeHold | OutpostRaiseHold, { kind: 'materials' }>,
  view: PlayerView,
): string | null {
  const held = view.me.resources[hold.resource];
  const when = availabilityOf(hold.needed, held, currentStock(held, view.loadedAt, view.loadedAt));
  if (when.kind === 'now') return null;
  if (when.kind === 'inMinutes') return fr.upgrade.availableIn(asDuration(when.minutes));
  const none = noBuilding(PRODUCER_OF[hold.resource]);
  const deposit = DEPOSITS.find((key) => key === hold.resource);
  return deposit === undefined
    ? fr.upgrade.never(none)
    : fr.upgrade.neverOnDeposit(none, fr.deposits[deposit]);
}
