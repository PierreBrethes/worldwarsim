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
import { PRODUCER_OF } from './economy';
import { canonicalBuildingKey, DEPOSITS, RESOURCES, SPECIALIZATIONS } from './ids';
import {
  foundingRefusal,
  legalMovementTypes,
  lootCollectionOrderRefusalOf,
  ORDERABLE_TYPES,
  plunderOrderRefusalOf,
  refusalDetails,
  refusalOf,
  type Column,
  type MovementAim,
  type OrderRefusal,
  type PlunderAim,
} from './movement-orders';
import { NATION_BY_ADM0 } from './nations';
import { carriesSurveyedInstallation } from './objectives';
import {
  LAND_SEATS_PER_TRANSPORT,
  LIFT_CAPACITY,
  LIFT_COST,
  marchingTroopIds,
  stackRows,
  stationKeyOf,
  troopsAt,
} from './troops';
import type { LonLat } from './geo';
import type { BuildingKey, MovementType, ResourceKey, Specialization } from './ids';
import {
  currentStock,
  type Building,
  type OutpostView,
  type PlayerView,
  type TroopStation,
} from './player-view';

/**
 * What the right click touched. A discriminated union rather than an object with optional
 * fields: a force has no declared host country — picking says which land it stands on — and
 * an outpost always has one.
 *
 * Every `country` here is a Natural Earth `adm0_a3`, the key the server, the regions and the
 * outposts share: a target and an outpost's host compare directly, and a label goes through
 * `countryLabel` and nowhere else.
 */
export type CompassTarget =
  | { readonly kind: 'country'; readonly country: string }
  /**
   * The same land, aimed at up close: below the regions' fade-in threshold the right click
   * lands on an admin-1 region rather than on the country. The id is the Natural Earth
   * `adm1_code` — admin-1 names repeat from one country to the next, ids do not — and
   * `country` stays the map country the region belongs to, so the country's own actions keep
   * working underneath.
   */
  | {
      readonly kind: 'region';
      readonly id: string;
      readonly name: string;
      readonly country: string;
    }
  | {
      readonly kind: 'outpost';
      readonly id: string;
      readonly hostCountry: string;
      readonly name: string;
      /** Le point de l'avant-poste est-il une côte ? Lu sur la grille de routage du moteur de
       *  carte, la même que le serveur refuse avec — voir `MovementAim`. */
      readonly coastal: boolean;
    }
  /**
   * **Un bâtiment à soi, désigné par son mât** (décisions 54a et 56a). C'est la seule cible qui
   * soit une *instance* et non un lieu : trois casernes font trois cibles, et l'élévation
   * s'adresse à celle-ci. L'identité voyage entière — clé, niveau, région — parce que la rose
   * facture une marche d'escalier, pas un endroit ; le reste (coût, durée, plafond) se relit
   * dans la vue, jamais recopié ici.
   */
  | {
      readonly kind: 'building';
      readonly id: string;
      readonly key: BuildingKey;
      readonly level: number;
      readonly regionId: string;
    }
  | {
      /** A private survey snapshot, never the live enemy building row. */
      readonly kind: 'installation';
      readonly id: string;
      readonly key: BuildingKey;
      readonly regionId: string;
      readonly name: string;
    }
  | {
      /**
       * **Un camp adverse relevé** (ADR 0024 §1) : le relevé possédé, jamais la pile vraie — elle
       * peut avoir levé le camp, et c'est le sujet. On attaque une **position**, celle qu'on a
       * vue ; ce qui s'y tient encore est l'affaire de l'arrivée.
       */
      readonly kind: 'camp';
      readonly id: string;
      readonly point: LonLat;
      /** Le pays sous le relevé, lu au picking — le serveur le relit de son côté. */
      readonly country: string | null;
      readonly name: string;
    }
  | {
      /**
       * The exact private crate sighting selected under the pointer. **Son âge n'est pas ici** :
       * la rose ne marche pas vers une caisse, elle marche vers un relevé — la date se lit sur
       * le marqueur et sur son cartouche, et aucune branche n'en dépend.
       */
      readonly kind: 'loot';
      readonly id: string;
      readonly point: LonLat;
      /** Ce que le mât dit de lui-même : couvert à l'instant, ou dernier relevé. */
      readonly current: boolean;
      /**
       * Le sol et la côte sous le relevé, lus sur la grille de routage au moment du clic — le
       * relevé n'en porte rien. Absents, la marche est jugée sur terre ferme : c'est le cas du
       * dézoom, où la carte n'a pas de cellule à interroger.
       */
      readonly onLand?: boolean;
      readonly coastal?: boolean;
      readonly name?: string;
    }
  /**
   * The map itself, wherever it carries nothing clickable — the open sea, and every scale above
   * the regions' fade-in threshold, where no region is drawn to be picked. `regionId` travels
   * with it because a **foundation** still goes on a region: an outpost is placed on ground that
   * produces, not on a coordinate. `name` is what the fan writes at its centre, which the click
   * knows and the point does not.
   */
  | {
      readonly kind: 'point';
      readonly lon: number;
      readonly lat: number;
      readonly regionId: string | null;
      readonly onLand: boolean;
      readonly country: string | null;
      readonly name: string;
      /** Idem : la cellule visée est-elle une côte ? C'est ce qui sépare une plage d'un point
       *  intérieur pour une colonne embarquée (`LANDING_NEEDS_A_COAST`). */
      readonly coastal: boolean;
    }
  | {
      /**
       * Une pile posée sur la carte, désignée par sa propre étiquette. Elle porte son adresse —
       * c'est là qu'un avant-poste se planterait, puisqu'on fonde où l'on se tient (ADR 0019 §1)
       * — et la région dessinée sous elle, la seule chose qui dise si ce sol est déjà le sien.
       */
      readonly kind: 'force';
      readonly id: string;
      readonly country: string | null;
      readonly name: string;
      readonly headcount: number;
      readonly onLand: boolean;
      readonly station: TroopStation | null;
      readonly regionId: string | null;
    };

/**
 * The pictograms of the radial menu plate. Two mark nothing yet — the helmet awaits the agent,
 * the propeller the day something flies — and are declared here so that when the day comes there
 * is only wiring to write, never a drawing to find.
 *
 * `post` est la fondation : la hutte **avec son mât**. Elle ne pouvait pas reprendre `cabin` —
 * une pile posée offre « fonder » et « voir le pays » dans la même rose, et deux branches sous
 * le même dessin sont deux branches qu'on ne distingue qu'en survolant.
 *
 * La hutte évidée est partie avec le leurre (révision du 29/08/2026) : c'était le seul dessin
 * creux de la plate, et il ne désignait plus rien.
 */
export type CompassPictogram =
  | 'cabin'
  | 'crane'
  | 'anchor'
  | 'helmet'
  | 'propeller'
  | 'rifles'
  | 'pennant'
  | 'post'
  /** L'élévation : le chevron sur ses deux assises — « un étage de plus », lisible à quinze
   *  pixels (tranché le 01/09). Le mât de la grue reste à « Bâtir ici » : poser et monter sont
   *  deux verbes, et deux dessins. */
  | 'chevron'
  /** « Entrer en garnison » (64b, 69a) : la hutte de la marche, **porte ouverte** — la même
   *  famille que `cabin`, et ce qui les sépare est exactement ce qui sépare les deux ordres :
   *  une marche s'arrête devant, celle-ci entre. */
  | 'doorway'
  /** Le ramassage : la caisse cerclée, ce que la carte pose déjà sur un butin abandonné. */
  | 'crate'
  /** La prise et le sabotage sous un seul dessin — la pince coupante : c'est le même ordre, seul
   *  le libellé change avec la nature du bâtiment visé. */
  | 'sabotage'
  /** « Raser » : le mur qui s'écroule, ses moellons en l'air. Rien de la torche du sabotage —
   *  on n'incendie pas chez soi, on démonte — et rien de la grue, qui bâtit. */
  | 'rubble'
  /** Le métier de relais : le mât et son onde qui part. C'est ce que le point *fait* — il
   *  relaie — et non ce qu'il est, que la hutte dit déjà. */
  | 'aerial'
  /** Le métier d'écoute : le pavillon tendu, l'oreille du point. Même famille que l'antenne,
   *  et ce qui les sépare est le sens de l'onde : l'une part, l'autre arrive. */
  | 'ear';

/**
 * Only actions with a real destination exist — nothing greyed out, ever. The pictogram stays
 * mute: label, cost and consequence only appear on hover, in the tooltip. The array order is
 * the fan order, due north then clockwise.
 */
export type CompassAction =
  /**
   * The aimed march. It only exists while a column is armed, and the fan then holds **exactly**
   * the types the server will accept for this target — `legalMovementTypes` is the same
   * function the mutations refuse with, not a copy of its table (ADR 0015).
   */
  | {
      readonly key: 'aim';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly aim: MovementAim;
      readonly type: MovementType;
    }
  | {
      readonly key: 'build';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly regionId: string;
      readonly regionName: string;
    }
  /**
   * **Fonder, au clic droit sur la pile qui fonde** (décision Pierre, 29/08). Le geste a quitté la
   * fenêtre de garnison : la fondation est un ordre donné à une troupe sur la carte, pas une ligne
   * d'un formulaire. Elle ne paraît que si `foundingRefusal` la laisse passer là — rien de grisé,
   * jamais (ADR 0015).
   */
  | {
      readonly key: 'found';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly point: LonLat;
      /** Le sol dessiné sous la pile, `null` au-dessus du seuil de fondu : c'est ce que le
       *  serveur inscrit sur le point, faute de polygone à lui (précision du 04/09). */
      readonly regionId: string | null;
      readonly troopIds: ReadonlyArray<string>;
      /**
       * **Le prix et la durée, sur la plate** (révision du 15/09 de l'ADR 0020 §10). Fonder se
       * paie et prend du temps ; les deux chiffres décident du clic, et les faire attendre le
       * survol ferait ouvrir la rose pour lire un tarif. Même forme que la branche « monter ».
       */
      readonly figure: string;
      readonly bill: ReadonlyArray<{ readonly text: string; readonly lacking: boolean }>;
      readonly duration: string;
    }
  /**
   * **Monter d'un niveau, depuis la carte** (décision 54a). La seule branche qui porte un chiffre
   * à même la plate : le coût est ce qui décide du clic, et le faire attendre le survol ferait
   * ouvrir la rose pour lire un prix.
   *
   * Elle est aussi **la seule branche que le jeu grise** (exception assumée, 54a). Une matière
   * qui manque est transitoire et le remède se chiffre : une branche qui disparaît cinq minutes
   * se lit comme un bug. Les deux autres retenues d'`upgradeHold` — file, plafond — retirent la
   * branche et parlent par le motif de la rose, règle générale de l'ADR 0015.
   */
  | {
      readonly key: 'upgrade';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      /** `null` : la facture est détaillée matière par matière, `bill` la porte. */
      readonly cost: string | null;
      readonly consequence: string;
      readonly buildingKey: BuildingKey;
      readonly regionId: string;
      /** Le coût à plat, dans la rose : « 54 », multi-matières « 108 · 72 ». */
      readonly figure: string;
      /** Une ligne par matière due, avec le stock en regard — celle qui manque se marque. */
      readonly bill: ReadonlyArray<{ readonly text: string; readonly lacking: boolean }>;
      readonly duration: string;
      /** Grisée quand elle est là : la raison du serveur, et l'échéance quand elle se date. */
      readonly hold: {
        readonly reason: string;
        readonly availability: string | null;
      } | null;
    }
  /**
   * **Piller, saboter — un seul ordre sous deux mots** (S8). Ce que le verbe change est ce que
   * l'expédition rapporte : un entrepôt rend du butin, un producteur ne rend que son arrêt. La
   * branche ne paraît que si `plunderOrderRefusalOf` la laisse passer, la même fonction que la
   * mutation refuse avec (ADR 0015) — et elle ne dit jamais un stock adverse, que le relevé n'a
   * pas.
   */
  | {
      readonly key: 'plunder';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly buildingId: string;
      readonly aim: PlunderAim;
    }
  /**
   * **Raser un bâtiment à soi** (demande du 15/09). Dernière branche de la plate et seule encre
   * rouge du jeu sur un médaillon : rien de ce qu'elle efface ne revient. Elle ne porte aucun
   * chiffre — ce qui est perdu se lit sur la confirmation, qui a la place de le dire en clair.
   */
  | {
      readonly key: 'demolish';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly buildingId: string;
    }
  /**
   * **Monter l'avant-poste, depuis la carte** (décision de Pierre, 16/09). Exactement la branche
   * « améliorer » d'un mât, sur l'autre sorte de site : même arbitre (`outpostRaiseHold`), même
   * chiffre à plat sur le rayon, même exception de grisé pour la seule matière qui manque. Ce
   * qu'elle appelle est la mutation du panneau de garnison et pas une autre — la rose ajoute une
   * porte, elle n'en ouvre pas une seconde.
   */
  | {
      readonly key: 'raiseOutpost';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly outpostId: string;
      readonly figure: string;
      readonly bill: ReadonlyArray<{ readonly text: string; readonly lacking: boolean }>;
      readonly duration: string;
      readonly hold: {
        readonly reason: string;
        readonly availability: string | null;
      } | null;
    }
  /**
   * **Le métier du point, sur la plate** (décision de Pierre, 16/09). Deux branches et pas une
   * bascule : la rose se lit au pictogramme, et un interrupteur qui change de sens au clic ne se
   * lit pas. Celle en cours est **marquée** — le même état que l'`aria-pressed` du panneau — et
   * elle ne se grise pas : le joueur doit voir ce que le point fait avant de voir ce qu'il
   * pourrait faire.
   *
   * **Scellée, la branche reste et dit pourquoi.** Un relais qu'une colonne utilise ne change
   * plus de métier (`SPECIALIZATION_SEALED`) ; retirer la branche laisserait le joueur chercher
   * une porte qui existe, et la griser serait une seconde exception à l'ADR 0015.
   */
  | {
      readonly key: 'specialize';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly outpostId: string;
      readonly specialization: Specialization;
      /** Le métier que le point exerce déjà : la branche est marquée et le clic ne fait rien —
       *  il n'y a rien à changer. */
      readonly current: boolean;
      /** La phrase du serveur quand le métier est scellé, `null` sinon. Elle remplace la
       *  conséquence dans la bulle, et le clic reste sans effet. */
      readonly sealed: string | null;
    }
  /**
   * **Démanteler son propre avant-poste** (décision de Pierre, 16/09). Jumelle de « raser » et
   * même encre : dernière branche, rouge, confirmation au bout. Elle emporte plus qu'un mât —
   * la couleur du sol et les bâtiments que ce point ancre — et c'est la carte de confirmation
   * qui le dit en clair, parce qu'aucune bulle n'en aurait la place.
   */
  | {
      readonly key: 'dismantle';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly outpostId: string;
    }
  /**
   * **Ramasser une caisse relevée.** La cible est le relevé possédé et jamais la caisse vraie —
   * elle peut avoir disparu, et c'est le sujet : on marche vers ce qu'on a vu.
   */
  | {
      readonly key: 'collect';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly sightingId: string;
      readonly point: LonLat;
    };

type Fan = {
  /** The tooltip's context line: the target's nature and qualification. */
  readonly kicker: string;
  readonly name: string;
  readonly actions: ReadonlyArray<CompassAction>;
  /**
   * Why the fan is empty, when it is. A column whose domain door is shut has no legal type, and
   * returning nothing there would give back, one notch further, the very silence ADR 0019 was
   * written against. A building whose raise is queued or capped is the same case on land: the
   * branch goes, the reason stays.
   *
   * ADR 0015 forbids **offering a dead choice**, not **explaining an absence**: the rose in
   * refusal draws no branch one could click. Elsewhere — a plain country, open water — an empty
   * fan is not a refusal at all: there is nothing to do there, and the right click stays inert.
   */
  readonly refusal: string | null;
};

export type Compass = Fan;

type Allegiance = 'mine' | 'enemy' | 'neutral';

function countryAllegiance(country: string, view: PlayerView): Allegiance {
  const nation = NATION_BY_ADM0.get(country);
  if (nation === undefined) return 'neutral';
  if (nation === view.me.nation) return 'mine';
  return view.opponents.some((opponent) => opponent.nation === nation) ? 'enemy' : 'neutral';
}

/**
 * The only cost the game can quantify today. The steel and duration of a founding exist
 * nowhere — displaying them would mean inventing them.
 */
function slotCost(view: PlayerView): string {
  const free = view.me.slots.total - view.me.slots.used;
  return fr.compass.slotsCost(free);
}

/**
 * The pictogram plate of the aiming fan, taken from the mockup: the crossed rifles for the
 * assault, the pennant for the raid, the cabin for a point planted. The three the game cannot
 * order yet are here so the day they land there is a branch to fill, never a drawing to find.
 */
const AIM_PICTOGRAM: Readonly<Record<MovementType, CompassPictogram>> = {
  /** The hut for the march, because a march ends in a camp (ADR 0019 §7). It is the cabin the
   *  foundation used to wear, free since founding stopped being a march — and the fan that
   *  offers "voir le pays" under the same drawing is the unarmed one, never this one. */
  march: 'cabin',
  attack: 'rifles',
  raid: 'pennant',
  outpost: 'cabin',
  recall: 'anchor',
  agent: 'helmet',
  return: 'anchor',
};

/**
 * One branch per march. **The march aimed at a building of one's own is « entrer en garnison »**
 * (decisions 64b, 69a): the same type on the wire — `march`, go there and stay — but the branch
 * says where the column ends, because « marche » on a mast would read as a walk to the doorstep.
 */
const march = (type: MovementType, aim: MovementAim, view: PlayerView): CompassAction => {
  /** **Un point à soi s'entre comme un mât** (décision du 16/09) : la marche y finit en
   *  garnison, et la seule marche légale sur un avant-poste est celle-là (`refusalOf`). */
  const garrison = type === 'march' && (aim.kind === 'building' || aim.kind === 'outpost');
  const label = garrison ? fr.compass.garrison : fr.movementTypes[type];
  return {
    key: 'aim',
    pictogram: garrison ? 'doorway' : AIM_PICTOGRAM[type],
    label,
    cost: slotCost(view),
    /** **The forfait is not quantified here, and that is deliberate**: the figure lives in
     *  `convex/constants.ts` with every other balance number, and the domain does not read it
     *  (ADR 0016, the layering of `CLAUDE.md`). The aiming card says it, one gesture later, at the
     *  moment it is a price rather than a warning. */
    consequence: fr.compass.marchConsequence(label),
    aim,
    type,
  };
};

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

  const due = RESOURCES.filter((resource) => (outpost.nextLevelCost[resource] ?? 0) > 0);
  return {
    action: {
      key: 'raiseOutpost',
      pictogram: 'chevron',
      label: fr.garrison.raiseAction,
      cost: null,
      consequence: fr.compass.raiseConsequence(outpost.level + 1),
      outpostId: outpost.id,
      figure: due.map((resource) => String(outpost.nextLevelCost[resource])).join(' · '),
      bill: due.map((resource) => ({
        text: fr.compass.upgradeBill(
          fr.resources[resource],
          outpost.nextLevelCost[resource] ?? 0,
          currentStock(view.me.resources[resource], view.loadedAt, view.loadedAt),
        ),
        lacking: hold?.resource === resource,
      })),
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

/**
 * **L'expédition sur une installation relevée** (S8). Le libellé seul sépare la prise du sabotage
 * — un entrepôt rend du butin, un producteur ne rend que son arrêt — et c'est le même ordre sur
 * le fil (`movements.plunder`). Le refus vient de `plunderOrderRefusalOf`, la fonction que la
 * mutation relit : sans branche, la rose s'ouvre en motif et dit la phrase du serveur (ADR 0015).
 *
 * Rien ici ne lit un stock adverse : le relevé n'en porte aucun, et c'est le sujet.
 */
function plunderFan(
  target: Extract<CompassTarget, { kind: 'installation' }>,
  view: PlayerView,
  column: Column,
): Compass {
  const aimed: PlunderAim = { kind: 'building', buildingId: target.id, key: target.key };
  const isMine = view.me.buildings.some((standing) => standing.id === target.id);
  const refused = plunderOrderRefusalOf(aimed, column, isMine);
  const label =
    canonicalBuildingKey(target.key) === 'warehouse' ? fr.compass.plunder : fr.compass.sabotage;
  return {
    kicker: fr.compass.installation,
    name: target.name,
    actions:
      refused === null
        ? [
            {
              key: 'plunder',
              pictogram: 'sabotage',
              label,
              cost: slotCost(view),
              consequence: fr.compass.plunderConsequence(label),
              buildingId: target.id,
              aim: aimed,
            },
          ]
        : [],
    refusal: refused === null ? null : fr.errors[refused](refusalDetails(aimed, column)),
  };
}

/**
 * **Ramasser ce qu'on a relevé**, et jamais ce qui est là : la cible est le relevé possédé, même
 * périmé. La capacité libre est la seule condition propre à cet ordre — une pile pleine ne
 * rapporte rien — et elle passe par `lootCollectionOrderRefusalOf`, comme le serveur.
 */
function collectFan(
  target: Extract<CompassTarget, { kind: 'loot' }>,
  column: Column,
  freeCapacity: number,
): Compass {
  const aimed = {
    kind: 'point',
    lon: target.point[0],
    lat: target.point[1],
    onLand: target.onLand ?? true,
    coastal: target.coastal ?? false,
    /** Un ramassage est une marche : ce qu'on a relevé du sol n'entre pas dans son refus. */
    surveyed: false,
  } as const;
  const refused = lootCollectionOrderRefusalOf(aimed, column, freeCapacity);
  return {
    kicker: target.current ? fr.loot.markerCurrent : fr.loot.markerStale,
    name: target.name ?? fr.loot.cardKicker,
    actions:
      refused === null
        ? [
            {
              key: 'collect',
              pictogram: 'crate',
              label: fr.compass.collect,
              cost: null,
              consequence: fr.compass.collectConsequence,
              sightingId: target.id,
              point: target.point,
            },
          ]
        : [],
    refusal: refused === null ? null : fr.errors[refused](refusalDetails(aimed, column)),
  };
}

/**
 * A target's compass, or `null` when there is nothing to say — the right click then stays inert
 * rather than opening an empty fan.
 *
 * `column` is what the player has armed from a garrison. Given, the board is **in aim** and the
 * fan holds nothing but marches; the ordinary actions step aside, because a right click while
 * aiming means "this one, and how" and nothing else. Aiming, `null` is reserved for the targets
 * one does not march at — a whole country, a column in flight; everywhere a march could have
 * been asked for, the rose opens, branches or motive.
 */
export function compassOf(
  target: CompassTarget,
  view: PlayerView,
  column: Column | null = null,
  origin: TroopStation | null = null,
  /** Ce que la pile armée peut encore charger, une fois sa charge en cours déduite : le seul
   *  chiffre qui décide si « ramasser » existe (`carryCapacityOf`, lu par l'appelant). */
  freeCapacity = 0,
): Compass | null {
  /**
   * **Un observateur regarde, il ne vise plus** (décision de Pierre, 31/08) : le clic droit ne
   * lui rend plus rien du tout. Le serveur refuse déjà tout (`requirePlayable`), et une rose qui
   * proposerait « bâtir » ou « attaquer » à un défait promettrait ce qu'il ne peut plus obtenir.
   * Le retrait est ici, en un seul endroit, parce que la rose est la seule porte de la carte —
   * elle est aussi la même fonction que le serveur relit (ADR 0015).
   */
  if (view.me.defeated) return null;
  /**
   * **La pile qu'on tient n'est pas une destination.** Viser, c'est nommer un ailleurs ; la pile
   * armée, elle, garde son éventail ordinaire jusque sous la visée — sinon désigner une troupe
   * lui retirerait « fonder », qui est précisément l'ordre qu'on donne là où l'on se tient
   * (ADR 0019 §1). Le clic droit sur elle répond donc toujours la même chose, armée ou non.
   */
  if (column !== null && target.kind === 'force' && origin !== null) {
    const station = posted(target);
    if (station !== null && stationKeyOf(station) !== stationKeyOf(origin)) {
      return joinTransport(target, station, view, column);
    }
  }
  if (column !== null && target.kind !== 'force') {
    return aim(target, view, column, freeCapacity);
  }
  const fan = build(target, view);
  /** Un motif sans branche reste une rose : c'est ce qui sépare « rien à faire ici » — le clic
   *  droit inerte — de « pas maintenant, et voilà pourquoi ». */
  return fan.actions.length === 0 && fan.refusal === null ? null : fan;
}

/**
 * The aiming fan. A **country** carries none — a whole country is not a place one walks to — and
 * it no longer needs to: above the fade-in threshold the right click lands on a point, which is
 * a place at every scale. The state "I am aiming and nothing answers" is what that removes.
 *
 * **A march is aimed at a point or at an outpost, and at nothing else.** The region stopped
 * being an aim of its own the day founding stopped being a march: one no longer walks *at*
 * ground to plant a point there, one plants it where one already stands (`foundOutpostHere`).
 * What is left aims at places — which is what ADR 0019 §1 says a movement does. Aiming, the map
 * hands back a point at every scale, so no region target ever reaches here.
 */
function aim(
  target: CompassTarget,
  view: PlayerView,
  column: Column,
  freeCapacity: number,
): Compass | null {
  if (target.kind === 'installation') return plunderFan(target, view, column);
  if (target.kind === 'loot') return collectFan(target, column, freeCapacity);
  if (target.kind === 'outpost') {
    return fanOf(target.name, view, column, [
      {
        kind: 'outpost',
        outpostId: target.id,
        hostCountry: target.hostCountry,
        coastal: target.coastal,
      },
    ]);
  }
  /**
   * **Un camp relevé est une cible, et une seule branche y mène** (ADR 0024 §4) : « attaquer ».
   * Une marche n'y va pas — on ne marche pas *sur* une force — et `refusalOf` le dit du même mot
   * que le serveur ; la rose n'a pas de seconde table.
   */
  if (target.kind === 'camp') {
    return fanOf(target.name, view, column, [
      {
        kind: 'camp',
        campId: target.id,
        lon: target.point[0],
        lat: target.point[1],
        hostCountry: target.country ?? '',
      },
    ]);
  }
  /**
   * **A mast of one's own is a destination in aim** (decision 64b): the column comes to enter
   * the building, and the fan holds « entrer en garnison » or the motive that keeps it out —
   * « un blindé n'entre pas dans une mine » — never a grey branch. Only the player's buildings
   * are ever drawn, so a mast the view does not carry is one that no longer stands: the click
   * then falls through to nothing rather than to a building the server would refuse.
   */
  if (target.kind === 'building') {
    const standing = view.me.buildings.find((candidate) => candidate.id === target.id);
    if (standing === undefined) return null;
    return fanOf(standing.name, view, column, [
      { kind: 'building', buildingId: standing.id, key: standing.key },
    ]);
  }
  if (target.kind !== 'point') return null;
  /**
   * The arrival reads what stands within `ARRIVAL_RADIUS_KM` of where the column stopped
   * (`defenceNear`, `convex/movements.ts`), so the destination is the place the player pointed
   * at and nothing rounds it to a centroid.
   */
  return fanOf(target.name, view, column, [
    {
      kind: 'point',
      lon: target.lon,
      lat: target.lat,
      coastal: target.coastal,
      onLand: target.onLand,
      /** **Ce que le joueur a relevé sous ce sol**, et la seule chose qui ouvre « attaquer »
       *  (ADR 0024 §4). Lu dans sa vue et nulle part ailleurs : demander au plateau dirait qu'il
       *  y a quelque chose là où il croyait viser du vide. */
      surveyed: carriesSurveyedInstallation(target.regionId, view.surveyedInstallations),
    },
  ]);
}

/**
 * One branch per legal type, and never two for the same type: the first aim that legalises a type
 * is the one it marches with, so a point and the region under it cannot both offer an attack.
 *
 * No legal type at all is not a reason to keep quiet: the fan comes back empty and carrying the
 * motive, which is the whole of the refusal state.
 */
function fanOf(
  name: string,
  view: PlayerView,
  column: Column,
  aims: ReadonlyArray<MovementAim>,
): Compass {
  const taken = new Set<MovementType>();
  const actions = aims.flatMap((aimed) =>
    legalMovementTypes(aimed, column)
      .filter((type) => !taken.has(type) && taken.add(type) !== undefined)
      .map((type) => march(type, aimed, view)),
  );
  /**
   * **Le motif ne sort que lorsque la plate est vide de marches.** Tant qu'il reste un ordre à
   * donner là, il n'y a rien à expliquer ; le motif est pour le cas qu'aucune carte ne peut dire
   — une porte de domaine fermée, une pile trop lourde — et c'est le seul que l'ADR 0019 voulait
   * sortir du silence.
   */
  const marches = actions.filter((action) => action.key === 'aim');
  return {
    kicker: fr.compass.aiming(column.roles.length),
    name,
    actions,
    refusal: marches.length === 0 ? refusalIn(aims, column) : null,
  };
}

/**
 * **One motive on screen, and it is the one the map cannot show.** Several types refuse for
 * several reasons; the order runs from what the column carries to what the target is. A player
 * reads on the map that this ground is his own, or that no outpost stands where he pointed —
 * he cannot read there that the pile under his feet has no port to embark from, or too few
 * berths for what it loads. The rose earns its place by saying what the map does not.
 */
const REFUSAL_PRIORITY: ReadonlyArray<OrderRefusal> = [
  'EMPTY_MOVEMENT',
  'NO_AIRFIELD_AT_DEPARTURE',
  'NO_PORT_AT_DEPARTURE',
  'NOT_ENOUGH_LIFT',
  /** Après les portes de départ et avant l'allégeance : la carte montre bien une côte, mais pas
   *  la cellule que la grille de routage tient pour telle — le joueur ne peut pas la lire. */
  'LANDING_NEEDS_A_COAST',
  'LAND_TARGET_REQUIRED',
  'SEA_TARGET_REQUIRED',
  'INFANTRY_ONLY',
  /** Before the allegiance: an attack on one's own mast is refused as friendly, and that is
   *  not what the player asked — he asked to enter, and the door is what he cannot see. */
  'NOT_A_GARRISON_FOR',
  'FRIENDLY_TARGET',
  'OUTPOST_TARGET_ONLY',
  'POINT_TARGET_ONLY',
  /** En dernier : la carte montre un sol vide, et c'est précisément ce que le joueur y lit. */
  'NOTHING_TO_ATTACK',
  'NOT_ORDERABLE',
];

/**
 * The refusal in the **same words the server would use**: the sentence is written once, in
 * `fr.errors`, and the rose borrows it rather than paraphrasing it — a player must not read one
 * thing before the click and another after it.
 */
function refusalIn(aims: ReadonlyArray<MovementAim>, column: Column): string | null {
  const met = new Set(
    aims.flatMap((aimed) => ORDERABLE_TYPES.map((type) => refusalOf(type, aimed, column))),
  );
  const code = REFUSAL_PRIORITY.find((candidate) => met.has(candidate));
  if (code === undefined) return null;
  return fr.errors[code](
    aims.reduce<Record<string, unknown>>(
      (details, aimed) => ({ ...details, ...refusalDetails(aimed, column) }),
      {},
    ),
  );
}

function build(target: CompassTarget, view: PlayerView): Fan {
  switch (target.kind) {
    case 'region': {
      // The country's fan, plus one branch. A region is the same land seen closer: taking
      // away what the country offered would make zooming in cost the player actions.
      const country = build({ kind: 'country', country: target.country }, view);
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
      const found = foundHere(target, view);
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
      return { kicker: '', name: '', actions: [], refusal: null };
    /**
     * Unarmed, a point is just the land under it: one builds on a region and looks at a country,
     * and a coordinate is neither. Over water there is nothing to offer and the fan stays shut,
     * exactly as the open sea does today.
     */
    case 'point':
      return target.country === null
        ? { kicker: fr.compass.openWater, name: target.name, actions: [], refusal: null }
        : build({ kind: 'country', country: target.country }, view);
  }
}

function joinTransport(
  target: Extract<CompassTarget, { kind: 'force' }>,
  station: Extract<TroopStation, { kind: 'point' }>,
  view: PlayerView,
  column: Column,
): Compass | null {
  const held = heldAt(station, view);
  const hasLift = held.some((troop) => (LIFT_CAPACITY[troop.role] ?? 0) > 0);
  const trucks = held.filter((troop) => troop.role === 'landTransport').length;
  if (!hasLift && trucks === 0) return null;

  const incoming = column.roles.map((role, rank) => ({ id: `incoming-${rank}`, role }));
  const together = [...held, ...incoming];
  const rows = stackRows(together, new Set(together.map((troop) => troop.id)));
  const fits =
    incoming.length > 0 &&
    (hasLift
      ? incoming.every(
          (troop) =>
            (LIFT_COST[troop.role] ?? 0) > 0 &&
            rows.some((row) => row.troop.id === troop.id && row.carrier !== null),
        )
      : incoming.every((troop) => troop.role === 'infantry') &&
        together.filter((troop) => troop.role === 'infantry').length <=
          trucks * LAND_SEATS_PER_TRANSPORT);
  if (!fits)
    return {
      kicker: fr.compass.aiming(column.roles.length),
      name: target.name,
      actions: [],
      refusal: fr.compass.transportFull,
    };

  // A transport is a rendezvous at its current address. Keeping the exact point lets the
  // arriving troops compose one pile with it; its later orders never redirect this march.
  const fan = fanOf(target.name, view, column, [
    {
      kind: 'point',
      lon: station.lonLat[0],
      lat: station.lonLat[1],
      coastal: station.coastal,
      onLand: target.onLand,
      /** Un rendez-vous est une marche, jamais un assaut : le relevé n'y décide de rien. */
      surveyed: false,
    },
  ]);
  return {
    ...fan,
    actions: fan.actions.map((action) =>
      action.key !== 'aim'
        ? action
        : {
            ...action,
            label: fr.compass.garrison,
            pictogram: 'doorway',
            consequence: fr.compass.joinTransport,
          },
    ),
  };
}

/** L'adresse d'une pile posée est un point, toujours : une garnison se lit sur le mât déjà
 *  dessiné, jamais sur une étiquette de pile (`postedStacks`). */
const posted = (
  target: Extract<CompassTarget, { kind: 'force' }>,
): Extract<TroopStation, { kind: 'point' }> | null =>
  target.station !== null && target.station.kind === 'point' ? target.station : null;

/** Ce qui se tient là, une seule lecture pour les deux branches de la pile : elles doivent
 *  parler de la même colonne, sinon « fonder » et « envoyer » n'emportent pas les mêmes troupes. */
const heldAt = (station: Extract<TroopStation, { kind: 'point' }>, view: PlayerView) =>
  troopsAt(view.me, stationKeyOf(station), marchingTroopIds(view.arcs));

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
): { readonly action: CompassAction | null; readonly refusal: string | null } {
  const station = posted(target);
  if (station === null) return { action: null, refusal: null };
  const held = heldAt(station, view);
  const onMyGround =
    target.regionId !== null &&
    view.me.buildings.some((building) => building.regionId === target.regionId);
  if (
    foundingRefusal(
      held.map((troop) => troop.role),
      onMyGround,
    ) !== null
  )
    return { action: null, refusal: null };

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
  const due = RESOURCES.filter((resource) => (cost[resource] ?? 0) > 0);
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
      figure: due.map((resource) => String(cost[resource])).join(' · '),
      bill: due.map((resource) => ({
        text: fr.compass.upgradeBill(
          fr.resources[resource],
          cost[resource] ?? 0,
          currentStock(view.me.resources[resource], view.loadedAt, view.loadedAt),
        ),
        lacking: false,
      })),
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

  const due = RESOURCES.filter((resource) => (building.nextLevelCost[resource] ?? 0) > 0);
  return {
    action: {
      key: 'upgrade',
      pictogram: 'chevron',
      label: fr.upgrade.action,
      cost: null,
      consequence: fr.upgrade.title(building.name, building.level + 1),
      buildingKey: building.key,
      regionId: building.regionId,
      figure: due.map((resource) => String(building.nextLevelCost[resource])).join(' · '),
      bill: due.map((resource) => ({
        text: fr.compass.upgradeBill(
          fr.resources[resource],
          building.nextLevelCost[resource] ?? 0,
          currentStock(view.me.resources[resource], view.loadedAt, view.loadedAt),
        ),
        lacking: hold?.resource === resource,
      })),
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
