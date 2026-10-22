import { build } from './compass-works';
import { boardingAt, towardsMyPile, withDelivery } from './compass-logistics';
import { bombardFan, captureBranch, collectFan, plunderFan } from './compass-strike';
import { fanOf, posted } from './compass-fan';
import { fr } from '@/i18n/fr';
import { bombardsWith } from './indirect-fire';
import { routeModeOf, type Column, type MovementAim, type PlunderAim } from './movement-orders';
import { onTourRefusalOf } from './logistics';
import { carriesSurveyedInstallation } from './objectives';
import { stationKeyOf } from './troops';
import { type LonLat } from './geo';
import type { Ground } from './routing';
import type { BuildingKey, MovementType, ResourceKey, Specialization } from './ids';
import { type Cost, type PlayerView, type TroopStation } from './player-view';

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
      /**
       * Le sol et la côte sous le relevé, lus sur la grille de routage au moment du clic — comme
       * pour une caisse, et pour la même raison : le relevé n'en porte rien. Absents, le camp est
       * jugé à terre ferme — c'est le cas du dézoom, où la carte n'a pas de cellule à
       * interroger. Ils sont arrivés avec le large (18/09) : un camp mouillé en mer n'était
       * visable par aucune flotte.
       */
      readonly ground?: Ground;
      readonly coastal?: boolean;
      /** Une route à pied y aboutit-elle (`isWalkableCell`) ? Absent, oui (#224). */
      readonly walkable?: boolean;
      readonly name: string;
    }
  /**
   * **Une colonne adverse en vue, visée en Blitz** (B18) : le relevé de son fil, et le point où
   * on l'a désignée — le serveur relit sa position vraie. Ailleurs qu'en Blitz, `refusalOf` dit
   * qu'il n'y a rien à poursuivre.
   */
  | {
      readonly kind: 'track';
      readonly id: string;
      readonly point: LonLat;
      readonly country: string | null;
      readonly ground: Ground;
      readonly coastal: boolean;
      /** Une route à pied y aboutit-elle (`isWalkableCell`) ? Absent, oui (#224). */
      readonly walkable?: boolean;
      readonly name: string;
    }
  | {
      /**
       * **Un objectif neutre** (17/09/2026) : la seule cible du jeu qu'on vise **sans l'avoir
       * relevée**, parce qu'elle est publique par nature — annoncée à tous, dessinée chez tous,
       * son dépôt restant lisible. Une seule branche y mène, « attaquer », et le motif tient la
       * place quand aucune colonne n'est armée : ce qui manque est une colonne, pas un droit.
       */
      readonly kind: 'objective';
      readonly id: string;
      readonly point: LonLat;
      readonly country: string | null;
      readonly name: string;
      /** Le palier en toutes lettres, pour le motif — jamais la composition de la garnison. */
      readonly tier: string;
    }
  | {
      /**
       * **Un point stratégique** (P1-P12) : public comme un objectif, il se vise sans relevé. La
       * rose y offre la marche et la capture ; à son teneur, la marche seule.
       */
      readonly kind: 'strategic';
      readonly id: string;
      readonly point: LonLat;
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
      readonly ground?: Ground;
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
      readonly ground: Ground;
      readonly country: string | null;
      readonly name: string;
      /** Idem : une coque y accoste-t-elle (`isLandingShore`) ? C'est ce qui sépare une plage
       *  d'un point intérieur pour une colonne embarquée (`LANDING_NEEDS_A_COAST`). */
      readonly coastal: boolean;
      /** L'eau ouverte de la grille avant l'arrivée de `coast.json` : la terre de Malte n'y est
       *  pas encore lue, et un ordre de coque attend la côte plutôt que de se faire refuser. */
      readonly coastPending?: boolean;
      /** Une route à pied y aboutit-elle (`isWalkableCell`) ? Absent, oui (#224). */
      readonly walkable?: boolean;
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
      readonly ground: Ground;
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
  | 'anchor'
  | 'helmet'
  | 'propeller'
  | 'rifles'
  | 'pennant'
  | 'post'
  /** L'élévation : le chevron sur ses deux assises — « un étage de plus », lisible à quinze
   *  pixels (tranché le 01/09). */
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
   *  on n'incendie pas chez soi, on démonte */
  | 'rubble'
  /** Le métier de relais : le mât et son onde qui part. C'est ce que le point *fait* — il
   *  relaie — et non ce qu'il est, que la hutte dit déjà. */
  | 'aerial'
  /** Le métier d'écoute : le pavillon tendu, l'oreille du point. Même famille que l'antenne,
   *  et ce qui les sépare est le sens de l'onde : l'une part, l'autre arrive. */
  | 'ear'
  /** « Bombarder » (B20) : l'obus debout sur son culot — un tir qui part, rien de la colonne. */
  | 'shell';

/** One resource of a bill: its sentence, its picto's resource, and whether it is the one short. */
export type BillLine = {
  readonly resource: ResourceKey;
  readonly text: string;
  readonly lacking: boolean;
};

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
      /** **The transport the column boards on arrival** (15/10), when the branch boards, and the
       *  seats it will take there. */
      readonly boardsOn?: string;
      readonly boardNeed?: number;
      /** **Joining one of my piles**: `formed` when it stood alone — the squad is born. */
      readonly join?: { readonly formed: boolean; readonly pieces: number };
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
      readonly figure: Cost;
      readonly bill: ReadonlyArray<BillLine>;
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
      /** Le point du bâtiment — ce qu'une élévation nomme (ADR 0029). */
      readonly point: LonLat;
      /** Le coût à plat, dans la rose : « 54 », multi-matières « 108 · 72 ». */
      readonly figure: Cost;
      /** Une ligne par matière due, avec le stock en regard — celle qui manque se marque. */
      readonly bill: ReadonlyArray<BillLine>;
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
   * **Capturer** (décision du 14/10) : un bâtiment ou un avant-poste adverse, par l'infanterie.
   * La branche ne paraît que si `captureOrderRefusalOf` la laisse passer — la fonction même que
   * `movements.capture` relit — et elle annonce la durée à la force de la pile.
   */
  | {
      readonly key: 'capture';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly target: { readonly kind: 'building' | 'outpost' | 'point'; readonly id: string };
      readonly aim: MovementAim;
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
      readonly figure: Cost;
      readonly bill: ReadonlyArray<BillLine>;
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
   * **Embarquer au point du transport** (révision de l'ADR 0025, 15/10) : sur-le-champ, sans
   * slot, et seulement là où `boardingRefusalOf` — la règle même de `movements.board` — laisse
   * passer. Ce n'est pas un ordre de la feuille : rien ne part, on monte à bord.
   */
  | {
      readonly key: 'board';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly carrierId: string;
      /** The seats the hand takes in it: its tag shows them, ghosted (POC). */
      readonly need: number;
    }
  /**
   * **Bombarder** (B20, lot 6b) : sur-le-champ, comme embarquer — aucune colonne ne part, la pièce
   * tire de sa batterie. Elle ne paraît que si `bombardRefusalOf`, la règle de
   * `movements.bombard`, la laisse passer.
   */
  | {
      readonly key: 'bombard';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly troopId: string;
      readonly target:
        | { readonly kind: 'camp'; readonly campId: string }
        | { readonly kind: 'track'; readonly movementId: string };
    }
  /**
   * **Livrer** (ADR 0028 §4) : le transport chargé, lâché sur un de mes avant-postes, y décharge
   * dans la limite du dépôt et rentre seul. Un mouvement, avec son slot ; la règle est
   * `deliverRefusalOf`, celle que `logistics.deliver` relit.
   */
  | {
      readonly key: 'deliver';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly outpostId: string;
      /** Le nom du point, pour le cartouche « transmis ». */
      readonly destination: string;
      /** La visée de la marche : l'aperçu de route en tire l'heure et le plein. */
      readonly aim: MovementAim;
    }
  /**
   * **Larguer** (ADR 0028 §4) : l'avion chargé ne se pose pas, il lâche son paquet sur un de mes
   * avant-postes — escale ou non — ou sur une de mes escouades isolées, et rentre seul. Un
   * mouvement, avec son slot ; la règle est `airdropRefusalOf`, celle que `logistics.airdrop` relit.
   */
  | {
      readonly key: 'airdrop';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly target:
        | { readonly kind: 'outpost'; readonly outpostId: string }
        | { readonly kind: 'squad'; readonly point: LonLat };
      /** La visée de la marche : l'aperçu de route en tire le plein de l'aller-retour. */
      readonly aim: MovementAim;
      /** Le nom du lieu, pour le cartouche « transmis ». */
      readonly destination: string;
    }
  /**
   * **Tracer une tournée** (ADR 0028, précision du 18/10) : le premier dépôt d'une boucle qui
   * part du point de chargement où le transport se tient ; les suivants s'ajoutent (`tourStop`),
   * et l'étiquette du transport la lance. Rien ne part avant.
   */
  | {
      readonly key: 'tour';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly outpostId: string;
      readonly carrierId: string;
      /** La visée de la marche : l'aperçu en tire l'heure et le plein du premier pas. */
      readonly aim: MovementAim;
    }
  | {
      readonly key: 'tourStop';
      readonly pictogram: CompassPictogram;
      readonly label: string;
      readonly cost: string | null;
      readonly consequence: string;
      readonly outpostId: string;
      readonly carrierId: string;
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

/** **Les branches qui font partir une colonne** : une marche, une expédition, un ramassage. Ce
 *  sont elles qui font d'une étiquette une destination, et elles seules que la feuille d'ordre du
 *  téléphone offre en onglets (refonte mobile, 1c). */
export type OrderAction = Extract<
  CompassAction,
  { readonly key: 'aim' | 'plunder' | 'capture' | 'collect' | 'airdrop' | 'deliver' | 'tour' }
>;

export const isOrder = (action: CompassAction): action is OrderAction =>
  action.key === 'aim' ||
  action.key === 'plunder' ||
  action.key === 'capture' ||
  action.key === 'collect' ||
  action.key === 'airdrop' ||
  action.key === 'deliver' ||
  action.key === 'tour';

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
  /** The refusal is only a wait: the coast has not reached the board yet (#224). */
  readonly pending?: boolean;
};

export type Compass = Fan;

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
  /** La composition tenue en main : c'est elle qui fonderait, pas toute la pile posée là. */
  heldTroopIds: ReadonlyArray<string> | null = null,
  /** L'heure du clic : batterie et rechargement s'égrènent entre deux vues servies. */
  now: number = view.loadedAt,
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
    if (station !== null && stationKeyOf(station) !== stationKeyOf(origin))
      return towardsMyPile(target, station, view, column, heldTroopIds ?? []);
  }
  if (column !== null && target.kind !== 'force') {
    const fan = aim(target, view, column, freeCapacity, origin, heldTroopIds, now);
    /** **En tournée, rien d'autre** (ADR 0028) : la rose le dit, la marche le relit. */
    const touring = onTourRefusalOf(
      view.me.troops.filter((troop) => heldTroopIds?.includes(troop.id) === true),
    );
    return fan === null || touring === null
      ? fan
      : { ...fan, actions: [], refusal: fr.errors[touring.code]() };
  }
  const here =
    origin !== null &&
    target.kind === 'force' &&
    posted(target) !== null &&
    stationKeyOf(posted(target)!) === stationKeyOf(origin);
  const fan = build(target, view, here ? heldTroopIds : null);
  /**
   * **La pile qu'on tient monte dans un transport de sa propre pile** (15/10) : la rose n'est plus
   * offerte pièce en main (#229) — fonder passe par la fiche de la main (`heldCompass`), embarquer
   * par le glisser sur le transport. Cette branche sert la pastille du survol.
   */
  const aboard =
    column !== null && here
      ? boardingAt(origin, null, target.name, view, column, heldTroopIds ?? [])
      : null;
  const all =
    aboard === null || aboard.actions.length === 0
      ? fan
      : { ...fan, actions: [...aboard.actions, ...fan.actions], refusal: null };
  /** Un motif sans branche reste une rose : c'est ce qui sépare « rien à faire ici » — le clic
   *  droit inerte — de « pas maintenant, et voilà pourquoi ». */
  return all.actions.length === 0 && all.refusal === null ? null : all;
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
  origin: TroopStation | null,
  heldTroopIds: ReadonlyArray<string> | null,
  now: number,
): Compass | null {
  if (target.kind === 'installation') return plunderFan(target, view, column);
  if ((target.kind === 'camp' || target.kind === 'track') && bombardsWith(column.roles, view.mode))
    return bombardFan(target, view, column, origin, heldTroopIds, now);
  if (target.kind === 'loot') return collectFan(target, column, freeCapacity);
  if (target.kind === 'outpost') {
    const aimed: MovementAim = {
      kind: 'outpost',
      outpostId: target.id,
      hostCountry: target.hostCountry,
      coastal: target.coastal,
    };
    const fan = fanOf(target.name, view, column, [aimed]);
    const isMine = view.me.outposts.some((outpost) => outpost.id === target.id);
    if (isMine) return withDelivery(fan, target.id, view, heldTroopIds ?? []);
    const capture = captureBranch(
      { kind: 'outpost' },
      { kind: 'outpost', id: target.id },
      aimed,
      view,
      column,
      false,
    );
    if (capture.action === null) return fan;
    return { ...fan, actions: [...fan.actions, capture.action], refusal: null };
  }
  if (target.kind === 'strategic') {
    const aimed: MovementAim = {
      kind: 'strategic',
      pointId: target.id,
      lon: target.point[0],
      lat: target.point[1],
      hostCountry: target.country ?? '',
    };
    const fan = fanOf(target.name, view, column, [aimed]);
    const held = view.strategicPoints.find((point) => point.id === target.id);
    if (held?.mine === true) return fan;
    const capture = captureBranch(
      { kind: 'point' },
      { kind: 'point', id: target.id },
      aimed,
      view,
      column,
      false,
    );
    if (capture.action === null) {
      return fan.actions.length > 0 ? fan : { ...fan, refusal: capture.refusal ?? fan.refusal };
    }
    return { ...fan, actions: [...fan.actions, capture.action], refusal: null };
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
        ground: target.ground ?? 'land',
        coastal: target.coastal ?? false,
        ...(target.walkable === undefined ? {} : { walkable: target.walkable }),
      },
    ]);
  }
  if (target.kind === 'track') {
    return fanOf(target.name, view, column, [
      {
        kind: 'track',
        movementId: target.id,
        lon: target.point[0],
        lat: target.point[1],
        hostCountry: target.country ?? '',
        ground: target.ground,
        coastal: target.coastal,
        ...(target.walkable === undefined ? {} : { walkable: target.walkable }),
      },
    ]);
  }
  /**
   * **Un objectif neutre est une cible, et une seule branche y mène** : « attaquer ». Le refus
   * vient de `refusalOf`, la fonction que la mutation relit — une colonne sans infanterie s'y
   * voit dire pourquoi, jamais une branche grisée (ADR 0015).
   */
  if (target.kind === 'objective') {
    return fanOf(target.name, view, column, [
      {
        kind: 'objective',
        objectiveId: target.id,
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
    const here: TroopStation = { kind: 'building', buildingId: standing.id };
    /** **Son propre mât n'est pas une garnison où entrer** : la colonne s'y tient déjà. Il ne
     *  sert qu'à monter dans un transport de la même garnison. */
    const same = origin !== null && stationKeyOf(origin) === stationKeyOf(here);
    const aimed: MovementAim = { kind: 'building', buildingId: standing.id, key: standing.key };
    const onto =
      origin === null
        ? null
        : boardingAt(here, same ? null : aimed, standing.name, view, column, heldTroopIds ?? []);
    if (same)
      return onto === null || (onto.actions.length === 0 && onto.refusal === null)
        ? null
        : {
            kicker: fr.compass.aiming(column.roles.length),
            name: standing.name,
            actions: onto.actions,
            refusal: onto.refusal,
          };
    const fan = fanOf(standing.name, view, column, [aimed]);
    if (onto === null) return fan;
    const actions = [...onto.actions, ...fan.actions];
    return { ...fan, actions, refusal: actions.length === 0 ? onto.refusal : null };
  }
  if (target.kind !== 'point') return null;
  const mode = routeModeOf(column.roles);
  if (target.coastPending === true && mode !== 'air')
    return {
      kicker: fr.compass.aiming(column.roles.length),
      name: target.name,
      actions: [],
      refusal: fr.placing.coastPending,
      pending: true,
    };
  /**
   * The arrival reads what stands within `contactKm(theatre)` of where the column stopped
   * (`defenceNear`, `convex/movements.ts`), so the destination is the place the player pointed
   * at and nothing rounds it to a centroid.
   */
  return fanOf(target.name, view, column, [
    {
      kind: 'point',
      lon: target.lon,
      lat: target.lat,
      coastal: target.coastal,
      ground: target.ground,
      ...(target.walkable === undefined ? {} : { walkable: target.walkable }),
      /** **Ce que le joueur a relevé sous ce sol**, et la seule chose qui ouvre « attaquer »
       *  (ADR 0024 §4). Lu dans sa vue et nulle part ailleurs : demander au plateau dirait qu'il
       *  y a quelque chose là où il croyait viser du vide. */
      surveyed: carriesSurveyedInstallation(target.regionId, view.surveyedInstallations),
    },
  ]);
}
