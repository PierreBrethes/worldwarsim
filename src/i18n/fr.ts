/**
 * The single French translation table. Code speaks English (identifiers, ids, error codes);
 * every string a player reads comes from here. The game ships in French only for now — no
 * runtime language switch, so components import `fr` directly and stay fully typed.
 *
 * Pure constants and functions: the domain layer may import this module — it pulls no React,
 * no Convex, no DOM.
 */
import countryNames from '../../public/country-names.json';
import type { ErrorCode } from '../../convex/errors';
import { LISTENING_STATION_RADIUS_KM, OUTPOST_REACH_KM_BY_LEVEL } from '../../convex/constants';
import { NATION_BY_ADM0 } from '../domain/nations';
import { LIFT_CAPACITY, LIFT_COST, tierLabel } from '../domain/troops';
import type { OutpostRaiseHold, UpgradeHold } from '../domain/construction';
import type { DispatchKind, HomeSlotRelief } from '../domain/player-view';
import type { SeasonMode } from '../domain/season-mode';
import type { TheatreId } from '../domain/theatres';
import type { ReplayStep } from '../domain/replay';
import type { CombatProfile } from '../domain/combat';
import { PROFILE_UNITS } from '../domain/gunnery';
import type { MovementSheet } from '../domain/gunnery';
import { buttonOfRole, type MouseMapping } from '../domain/mouse-mapping';
import type { LandPace, RouteMedium } from '../domain/routing';
import type { ChainState } from '../domain/economy';
import type {
  BuildingKey,
  DepositKey,
  Detector,
  Medium,
  MovementType,
  Nation,
  PlayableRegion,
  RegionType,
  ResourceKey,
  Specialization,
  UnitRole,
} from '../domain/ids';

const plural = (count: number, one: string, many: string): string => (count > 1 ? many : one);

/** `1ᵉʳ`, puis `2ᵉ` — l'exposant est composé en caractères, jamais en balise : ces chaînes
 *  passent aussi par des attributs `title`, où un `<sup>` s'imprimerait tel quel. */
const ordinal = (rank: number): string => (rank === 1 ? '1ᵉʳ' : `${rank}ᵉ`);

/** Les chiffres de la presse à la française : virgule décimale, milliers séparés par une espace
 *  insécable étroite — `1 460`, `31,8`. Le composeur du navigateur plutôt qu'un découpage à la
 *  main, qui se trompe sur les négatifs et sur les nombres à cinq chiffres. */
const decimal = (value: number, decimals: number): string =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

/** Building names are capitalised as titles; mid-sentence they are common nouns again. */
const lowerFirst = (label: string): string => label.charAt(0).toLowerCase() + label.slice(1);

/** Et l'inverse, quand le nom désigné ouvre la phrase : `La mine y est debout`. */
const upperFirst = (label: string): string => label.charAt(0).toUpperCase() + label.slice(1);

/** L'élision devant une voyelle — `l’alliage` et jamais `le alliage`. */
const startsWithVowel = (word: string): boolean => 'aeiouyâàéèêîôû'.includes(word.charAt(0));

/** One decimal at most, and never a trailing `.0`: rates come out of a settlement, not a table. */
const tenths = (value: number): string => String(Math.round(value * 10) / 10);

/** A factor as the table prints it: ×1.15 is not ×1.2, and the bonus is read before it is paid. */
const factor = (value: number): string => String(Math.round(value * 100) / 100);

/** "a, b et c" — the French list, the last conjunction spelled rather than commaed. */
const andList = (items: ReadonlyArray<string>): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`;

/**
 * **La passe en deux temps** (B16) : la frappe de l'attaquant, puis la riposte de ce qui reste en
 * face. Les pertes d'un camp sont toutes de l'autre temps — c'est l'initiative —, donc le compte
 * rendu suffit à les répartir sans rien servir de plus.
 */
const combatBeats = (attacking: boolean, mineLost: number, theirsLost: number): string => {
  const [strike, riposte] = attacking ? [theirsLost, mineLost] : [mineLost, theirsLost];
  const answer =
    riposte > 0 ? `${attacking ? 'leur' : 'notre'} riposte en abat ${riposte}` : 'aucune riposte';
  return `${attacking ? 'notre' : 'leur'} frappe en abat ${strike}, ${answer}`;
};

export const fr = {
  nations: {
    france: 'France',
    uk: 'Royaume-Uni',
    usa: 'États-Unis',
    ussr: 'URSS',
    germany: 'Allemagne',
    japan: 'Japon',
    italy: 'Italie',
    china: 'Chine',
  } satisfies Record<Nation, string>,

  nationPowers: {
    france: 'Projection outre-mer — avant-postes à n’importe quelle distance, coût croissant',
    uk: 'Maîtrise des mers — voit tous les arcs maritimes, sans origine ni cargaison',
    usa: 'Arsenal — convertit ravitaillement → acier, un sens, avec cooldown',
    ussr: 'Profondeur stratégique — l’occupation ne réduit pas sa production',
    germany: 'Guerre éclair — enchaîne deux mouvements offensifs sans cooldown de slot',
    japan: 'Doctrine du porte-avions — réoriente un mouvement en vol, avant mi-parcours',
    italy: 'Reconnaissance aérienne — voit la composition des piles détectées',
    china: 'Masse — pas de plafond d’effectifs, entretien croissant en ravitaillement',
  } satisfies Record<Nation, string>,

  roles: {
    infantry: { one: 'infanterie', many: 'infanterie' },
    armor: { one: 'blindé', many: 'blindés' },
    landTransport: { one: 'transport terrestre', many: 'transports terrestres' },
    fighter: { one: 'chasseur', many: 'chasseurs' },
    bomber: { one: 'bombardier', many: 'bombardiers' },
    airTransport: { one: 'transport aérien', many: 'transports aériens' },
    escort: { one: 'escorte', many: 'escortes' },
    cargo: { one: 'cargo', many: 'cargos' },
    carrier: { one: 'porte-avions', many: 'porte-avions' },
  } satisfies Record<UnitRole, { one: string; many: string }>,

  /** The gender of each role name, for the one sentence that puts an article on a role — the
   *  garrison refusal, « un blindé n'entre pas dans une mine » (decision 70b). */
  roleGender: {
    infantry: 'f',
    armor: 'm',
    landTransport: 'm',
    fighter: 'm',
    bomber: 'm',
    airTransport: 'm',
    escort: 'f',
    cargo: 'm',
    carrier: 'm',
  } satisfies Record<UnitRole, 'm' | 'f'>,

  roleAbbreviations: {
    infantry: 'INF',
    armor: 'BLD',
    landTransport: 'TPT',
    fighter: 'CHS',
    bomber: 'BMB',
    airTransport: 'TPA',
    escort: 'ESC',
    cargo: 'CGO',
    carrier: 'PAV',
  } satisfies Record<UnitRole, string>,

  movementTypes: {
    march: 'marche',
    attack: 'attaque',
    raid: 'raid d’avant-poste',
    outpost: 'fondation d’avant-poste',
    recall: 'rappel de garnison',
    agent: 'agent',
    return: 'retour',
  } satisfies Record<MovementType, string>,

  movementTypesPlural: {
    march: 'marches',
    attack: 'attaques',
    raid: 'raids',
    outpost: 'avant-postes',
    recall: 'rappels',
    agent: 'agents',
    return: 'retours',
  } satisfies Record<MovementType, string>,

  resources: {
    food: 'nourriture',
    textile: 'tissus',
    coal: 'charbon',
    oil: 'pétrole',
    ore: 'minerais',
    alloy: 'alliage',
    ammunition: 'munitions',
    bandages: 'bandages',
  } satisfies Record<ResourceKey, string>,

  deposits: {
    food: 'nourriture',
    textile: 'tissus',
    coal: 'charbon',
    oil: 'pétrole',
    ore: 'minerais',
  } satisfies Record<DepositKey, string>,

  buildings: {
    hq: 'Quartier général',
    farm: 'Ferme',
    mill: 'Filature',
    mine: 'Mine',
    oilWell: 'Puits de pétrole',
    foundry: 'Fonderie',
    arsenal: 'Arsenal',
    quartermaster: 'Intendance',
    barracks: 'Caserne',
    airfield: 'Aérodrome',
    port: 'Port',
    listening: 'Station d’écoute',
    billets: 'Baraquements',
    warehouse: 'Entrepôt',
    depot: 'Entrepôt',
  } satisfies Record<BuildingKey, string>,

  /**
   * The gender of each building name. It exists because the interface has to say "aucune
   * caserne" and "aucun aérodrome" in the same sentence template — naming the single limiting
   * factor (brief §5) is the most frequent phrase of the game, and a wrong article in it reads
   * as a bug in a screen whose whole job is to be believed.
   */
  buildingGender: {
    hq: 'm',
    farm: 'f',
    mill: 'f',
    mine: 'f',
    oilWell: 'm',
    foundry: 'f',
    arsenal: 'm',
    quartermaster: 'f',
    barracks: 'f',
    airfield: 'm',
    port: 'm',
    listening: 'f',
    billets: 'm',
    warehouse: 'm',
    depot: 'm',
  } satisfies Record<BuildingKey, 'm' | 'f'>,

  buildingEffects: {
    hq: 'unique et chez soi — plafonne les autres, porte les slots de mouvement et la recherche',
    farm: 'exploite un gisement de nourriture',
    mill: 'exploite un gisement de tissus',
    mine: 'exploite un gisement de charbon ou de minerais, selon la région',
    oilWell: 'exploite un gisement de pétrole',
    foundry: 'minerais + charbon → alliage, en continu',
    arsenal: 'alliage → munitions, sur commande',
    quartermaster: 'tissus → bandages, en continu',
    barracks: 'ouvre le domaine terrestre et forme l’infanterie et les véhicules',
    airfield: 'ouvre le domaine aérien et assemble les avions',
    port: 'ouvre le domaine maritime et construit les navires — région côtière',
    listening: `relève les mouvements adverses qui passent à moins de ${LISTENING_STATION_RADIUS_KM} km`,
    billets: 'relève le nombre de troupes que l’armée peut aligner',
    warehouse: 'relève le plafond des huit ressources — se pille',
    depot: 'relève le plafond des huit ressources — se pille',
  } satisfies Record<BuildingKey, string>,

  playableRegions: {
    europe: 'Europe',
    'europe-med': 'Europe + Méditerranée + Moyen-Orient',
    world: 'Monde',
  } satisfies Record<PlayableRegion, string>,

  modes: {
    blitz: {
      name: 'Blitz',
      line: '2 h · 2 à 4 joueurs présents ensemble · un théâtre, on prend le QG adverse',
    },
    mondiale: {
      name: 'Mondiale',
      line: '7 jours · 2 à 8 joueurs, deux ou trois visites par jour · le monde entier',
    },
    modeLabel: 'mode',
    theatreLabel: 'théâtre',
    theatreNote: 'La carte s’ouvre cadrée sur ce théâtre.',
    theatres: {
      europe: 'Europe',
      mediterranean: 'Méditerranée',
      pacific: 'Pacifique',
      americas: 'Amériques',
    } satisfies Record<TheatreId, string>,
    seats: (players: number, maximum: number) => `${players} / ${maximum} joueurs`,
    summary: (mode: string, theatre: string | null) =>
      theatre === null ? mode : `${mode} · ${theatre}`,
  },

  regionTypes: {
    plain: 'plaine',
    forest: 'forêt',
    jungle: 'jungle',
    mountain: 'montagne',
    desert: 'désert',
    tundra: 'toundra',
  } satisfies Record<RegionType, string>,

  specializations: {
    relay: 'relais logistique',
    listening: 'écoute',
  } satisfies Record<Specialization, string>,

  /** **La capture** (décision du 14/10) — jamais « prise ». */
  capture: {
    buildingSite: (building: string, region: string) => `${building} de ${region}`,
    outpostSite: (level: number, country: string) =>
      `l’avant-poste de niveau ${level} — ${country}`,
    /** Le tampon sur le site, et la ligne sous l'anneau — « 14 h 20 » est l'heure de fin. */
    stamp: 'capture',
    endsAt: (percent: number, hour: string) => `${percent} % · fin vers ${hour}`,
    lostAt: (percent: number, hour: string) => `${percent} % · perdu vers ${hour}`,
    underCapture: 'en cours de capture',
    underCaptureWhy: (hour: string) =>
      `Une infanterie adverse tient le site : il change de main vers ${hour} si personne ne l’en chasse. Le combat ne remet rien à zéro — il faut tuer ou chasser toute l’infanterie qui capture.`,
  },

  loot: {
    markerCurrent: 'caisse relevée',
    markerStale: 'dernier relevé',
    openMarker: 'Ouvrir le relevé de caisse',
    cardKicker: 'caisse connue',
    current: 'à jour',
    stale: 'ancien relevé',
    seenAt: (date: string) => `relevée le ${date}`,
    seenAgo: (age: string) => `ancienneté : ${age}`,
    cargoCapacity: (carried: number, capacity: number) =>
      `charge ${num(carried)} / ${num(capacity)}`,
    freeCapacity: (free: number) => `capacité libre : ${num(free)}`,
    sharedCargo: (carriers: number) =>
      carriers > 1 ? `charge commune · ${carriers} porteurs` : 'charge embarquée',
    loading: (minutesLeft: number) => {
      const minutes = Math.floor(minutesLeft);
      return `chargement · reste ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
    },
    missions: {
      plunderOutbound: 'expédition vers le site',
      plunderPresence: (until: string) => `présence sur site · jusqu’à ${until}`,
      collection: 'vers le dernier relevé',
      cargoReturn: 'retour chargé',
    },
  },

  /**
   * **Un camp adverse relevé** (ADR 0024 §1). Rien de ce qu'il est ne se dit ici, parce que rien
   * ne le traverse : « inconnu » n'est pas une pudeur de rédaction, c'est la forme servie.
   */
  camps: {
    marker: 'camp inconnu',
    seenAt: (time: string) => `relevé ${time}`,
    lastKnown: (age: string) => `dernière position · il y a ${age}`,
    badgeKicker: 'camp relevé',
    /** Le milieu, c'est-à-dire la silhouette — tout le portrait qu'un relevé accorde. */
    medium: { land: 'au sol', sea: 'à flot', air: 'en vol' } as const,
    since: (time: string) => `vu depuis ${time}`,
    by: (detector: string) => `relevé par ${detector}`,
    byStation: (region: string) => `relevé par notre station d’écoute de ${region}`,
    /** Ce que le cartouche ne dira pas, dit une fois : c'est la règle, pas une lacune. */
    unknown: 'Ni sa composition, ni son effectif, ni sa nation ne sont connus.',
  },

  /**
   * **Les objectifs neutres** (objectifs neutres, 17/09/2026). Habillage 1940, et le vocabulaire
   * est imposé : *garnison locale*, *dépôt*, *forces irrégulières* — jamais « barbares », jamais
   * « camp de barbares » (contraintes de corpus de la proposition du 29/08).
   *
   * Les noms sont indexés par clé d'archétype parce que la palette est une **donnée** : ajouter
   * une entrée à `OBJECTIVE_ARCHETYPES` est une ligne ici, jamais une branche.
   */
  objectives: {
    names: {
      abandonedStores: 'réserves abandonnées',
      stalledConvoy: 'convoi immobilisé',
      fuelDump: 'dépôt de carburant',
      irregularArsenal: 'arsenal irrégulier',
    } as Readonly<Record<string, string | undefined>>,
    /** **Le palier se dit, la composition jamais** : c'est tout ce que le brouillard accorde. */
    tiers: {
      easy: 'forces irrégulières légères',
      medium: 'forces irrégulières organisées',
      hard: 'forces irrégulières retranchées',
    } as Readonly<Record<string, string | undefined>>,
    markerKicker: 'objectif',
    badgeKicker: 'objectif neutre',
    depot: 'dépôt restant',
    emptied: 'dépôt épuisé',
    /** Ce que la popin ne dira pas, dit une fois — jumeau de la phrase du camp. */
    unknownGarrison: 'Ce qui la tient ne se sait qu’en s’en approchant.',
    needsAColumn: 'une colonne doit y marcher',
  },

  /**
   * **Ce que fait une spécialisation, en une phrase et avec son rayon.** L'invité choisissait à
   * l'aveugle : deux mots sur une carte, aucun chiffre, aucun effet. Le rayon est écrit ici
   * plutôt que deviné parce que c'est le seul chiffre qui décide où l'on plante l'avant-poste.
   */
  specializationEffects: {
    relay: (reachKm: number, multiplier: number) =>
      `accélère de ×${multiplier} la part de vos routes qui passe à moins de ${num(reachKm)} km`,
    listening: (reachKm: number) =>
      `relève les mouvements adverses qui passent à moins de ${num(reachKm)} km`,
  } satisfies Record<Specialization, (...args: never[]) => string>,

  /**
   * **Qui a relevé le fil** (fiche 04). Le détecteur est un fait du plateau de l'observateur :
   * le nommer ne dit rien de la colonne, et c'est ce qui transforme un relevé en raison d'avoir
   * bâti la chose qui l'a fait.
   */
  detectors: {
    territory: 'notre sol',
    station: 'station d’écoute',
    outpost: 'avant-poste d’écoute',
    troop: 'nos guetteurs',
  } satisfies Record<Detector, string>,

  mediums: {
    land: 'terrestre',
    sea: 'maritime',
    air: 'aérien',
  } satisfies Record<Medium, string>,

  errors: {
    NICKNAME_INVALID: () => 'pseudo invalide — utilisez entre 3 et 16 caractères visibles',
    PASSWORD_TOO_SHORT: () => 'mot de passe trop court — 8 octets minimum',
    PASSWORD_TOO_LONG: () => 'mot de passe trop long — 72 octets maximum',
    NICKNAME_TAKEN: () => 'ce pseudo est déjà utilisé',
    BAD_CREDENTIALS: () => 'pseudo ou mot de passe incorrect',
    LOGIN_TOO_FAST: () => 'une tentative toutes les trois secondes — patientez un instant',
    ACCOUNT_NOT_FOUND: () => 'compte introuvable',
    SESSION_TOKEN_COLLISION: () => 'impossible de créer la session — réessayez',
    UNKNOWN_SESSION: () => 'session expirée — reconnectez-vous',
    NO_SEAT: () => 'vous n’avez pas de place dans cette partie',
    PUSH_ENDPOINT_INVALID: () => 'cet appareil ne peut pas recevoir de notifications',
    SEAT_TAKEN: () => 'vous avez déjà une place dans cette partie — elle est à l’accueil',
    SEASON_GONE: () => 'cette saison n’existe plus',
    SEASON_NOT_LAUNCHED: () => 'la saison n’est pas lancée',
    SEASON_ALREADY_LAUNCHED: () => 'la saison est déjà lancée',
    SEASON_CONCLUDED: () =>
      'la saison est conclue — on la relit, on n’y joue plus (le fondateur l’efface)',
    REGISTRATION_CLOSED: () =>
      'les nouvelles inscriptions sont closes — cette place n’a pas été créée',
    UNKNOWN_GAME_CODE: () => 'code inconnu — vérifiez les six caractères',
    NO_FREE_GAME_CODE: () => 'impossible de tirer un code de partie libre — réessayez',
    LOBBY_FULL: (d) => `salon complet (${num(d.maximum)} joueurs)`,
    BLITZ_FULL: (d) =>
      `cette Blitz est complète : elle se joue à ${num(d.maximum)} joueurs au plus`,
    THEATRE_REQUIRED: () => 'une Blitz demande un théâtre',
    UNKNOWN_THEATRE: () => 'théâtre inconnu',
    THEATRE_ONLY_IN_BLITZ: () => 'seule une Blitz se joue sur un théâtre',
    NO_FREE_NATION: () => 'plus aucune nation libre dans ce théâtre — la saison est complète',
    NOT_AT_WAR: () => 'vous n’êtes pas encore entré en guerre — choisissez votre nation au salon',
    UNKNOWN_NATION: () => 'nation inconnue',
    NATION_TAKEN: (d) => `${nationName(d.nation)} est déjà prise par ${str(d.nickname)}`,
    NATION_REQUIRED: () => 'être prêt exige une nation',
    CREATOR_ONLY: () => 'seul le fondateur lance la saison',
    FOUNDER_STILL_PRESENT: () =>
      'le fondateur est toujours là — lui seul peut clore la saison pour l’instant',
    PLAYER_DEFEATED: () =>
      'vous avez déposé les armes — vous observez la saison, vous ne l’ordonnez plus',
    NOT_ENOUGH_PLAYERS: (d) => `il faut au moins ${num(d.minimum)} joueurs`,
    PLAYERS_NOT_READY: (d) =>
      `pas prêts : ${(d.nicknames as string[] | undefined)?.join(', ') ?? '—'}`,
    INVALID_REST_WINDOW: () => 'plage invalide : minutes entre 0 et 1439',
    REST_WINDOW_FROZEN: () =>
      'la plage de repos se déclare au salon — elle est scellée pour toute la saison',
    MISSING_RESOURCE: (d) => `ressource absente : ${resourceName(d.resource)}`,
    INSUFFICIENT_RESOURCE: (d) =>
      `il faut ${num(d.needed)} de ${resourceName(d.resource)} (${num(d.available)} disponibles)`,
    UNKNOWN_CONSTRUCTION: () => 'chantier introuvable',
    CONSTRUCTION_ALREADY_STARTED: () => 'un chantier commencé ne s’annule plus',
    CAPPED_BY_HQ: () => 'plafonné par le QG — montez le quartier général d’abord',
    UNKNOWN_REGION: () => 'région inconnue',
    UNKNOWN_CAPITAL_REGION: (d) =>
      `capitale introuvable pour ${nationName(d.nation)} — la partie ne peut pas se lancer`,
    /** **Le rayon touche une région, il ne la centre pas** (révision du 17/09 de l'ADR 0020 §1) :
     *  la phrase dit ce qu'il faut amener — un cercle jusqu'ici — et non une distance, qui se
     *  mesurerait au centre de la région et annoncerait des centaines de kilomètres là où la
     *  frontière court à soixante. */
    OUT_OF_OUTPOST_REACH: (d) =>
      d.hasOutposts === true
        ? `aucun de vos avant-postes n’atteint cette région — le plus large porte à ${num(d.reachKm)} km`
        : `hors de chez soi, il faut un avant-poste dont le rayon (${num(d.reachKm)} km) touche cette région — vous n’en avez aucun`,
    DEPOSIT_REQUIRED: (d) =>
      `${buildingName(d.building)} exige un gisement de ${depositNames(d.expected)} dans la région`,
    NOT_COASTAL: () => 'un port se pose sur une région côtière',
    /**
     * **Les trois refus du point de côte** (ADR 0013, révision du 04/09). Les deux premiers
     * répondent à un client qui a inventé son geste — le joueur ne les voit jamais, et ils se
     * lisent quand même en français : un code nu dans un bandeau n'apprend rien à personne.
     * Le troisième est la course entre le fantôme et le sol, et lui se rejoue.
     */
    POINT_FOR_PORT_ONLY: (d) =>
      `${buildingName(d.building)} se pose sur une région, pas sur un point`,
    PORT_NEEDS_A_COAST_POINT: () => 'un port se pose sur un point de côte — cliquez le rivage',
    POINT_OUTSIDE_REGION: () => 'ce rivage n’est pas celui de la région désignée',
    REGION_TAKEN: (d) =>
      `la région porte déjà ${buildingName(d.standing)} — une seule bâtisse par région`,
    /**
     * **Le refus nomme le site plein, jamais un total national** (ADR 0020 §10) : « sol
     * national » et « avant-poste » appellent des gestes opposés — monter le QG, ou monter ce
     * point — et un seul chiffre ne pourrait nommer ni l'un ni l'autre.
     *
     * Le remède du sol national est **chiffré** : « montez le QG » est un conseil, « un quartier
     * général niveau 2 les porte à 4 » est un plan. Les deux nombres viennent de `homeSlots`,
     * servis par le serveur — jamais recopiés ici (ADR 0015, révision du 24/08).
     */
    SITE_SLOTS_FULL: (d) =>
      d.site === 'outpost'
        ? `avant-poste plein : ${num(d.taken)} emplacement${plural(Number(d.taken), '', 's')} sur ${num(d.slots)} — améliorez-le pour en ouvrir un de plus`
        : `sol national plein : ${num(d.taken)} emplacement${plural(Number(d.taken), '', 's')} sur ${num(d.slots)}${homeSlotRelief(d.nextHqLevel, d.nextSlots)}`,
    BUILDING_LOCKED: (d) =>
      `${buildingName(d.building)} demande un quartier général de niveau ${num(d.requiredLevel)} (vous en êtes au ${num(d.hqLevel)})`,
    ROLE_LOCKED: (d) => `ce rôle demande un quartier général de niveau ${num(d.requiredLevel)}`,
    SITE_LEVEL_LOCKED: (d) =>
      `ce rôle demande ${aBuildingName(d.building)} de niveau ${num(d.requiredLevel)}`,
    MAX_LEVEL_REACHED: (d) => `niveau maximal atteint (${num(d.maximum)})`,
    HQ_ALREADY_BUILT: () => 'le quartier général est unique',
    /** **Le QG d'abord** (décision 1b du 13/09) : rien ne se bâtit avant lui, et la phrase dit
     *  l'ordre plutôt qu'un palier — `BUILDING_LOCKED` nommait un niveau 1 que le joueur ne
     *  pouvait atteindre que par cette pose-là. */
    HQ_FIRST: () => 'posez d’abord votre quartier général — rien ne se bâtit avant lui',
    UNKNOWN_BUILDING: () => 'bâtiment inconnu',
    NOT_YOURS: () => 'ce bâtiment n’est pas à vous',
    /** **Le QG ne se rase pas** (question 39, 15/09) : sa destruction serait une révision de
     *  « jamais éliminé », et elle n'est pas tranchée. */
    HQ_NEVER_DEMOLISHED: () => 'le quartier général ne se rase pas',
    WRONG_PROJECTION_BUILDING: (d) =>
      `ce rôle se forme dans ${buildingName(d.expected)}, pas dans ${buildingName(d.found)}`,
    TROOP_CAP_REACHED: (d) =>
      `plafond atteint : ${num(d.cap)} troupes, file comprise — bâtissez ou montez des baraquements`,
    SINGLE_TIER_ROLE: () => 'ce rôle n’a qu’un seul palier',
    TIER_2_LOCKED: (d) => `palier 2 : quartier général niveau ${num(d.requiredLevel)} requis`,
    QUEUE_FULL: (d) => `file pleine (${num(d.maximum)} lots)`,
    UNKNOWN_BATCH: () => 'lot inconnu',
    SPECIALIZATION_SEALED: () =>
      'une passe s’est déjà servie de cet avant-poste — sa spécialisation ne change plus',
    BATCH_ALREADY_STARTED: () => 'ce lot a déjà commencé — il ne s’annule plus',
    CHAIN_NOT_COMMANDED: (d) => `${buildingName(d.chain)} tourne seule — elle ne se commande pas`,
    CHAIN_NOT_STANDING: (d) => `aucun ${buildingName(d.building)} debout`,
    /** **Coupé, pas absent** (ADR 0020 §6). Le refus nomme la carte parce que c'est là que le
     *  remède se joue : rien ne se répare sur le site, la région se reprend. */
    SITE_UNLINKED: (d) =>
      `${buildingName(d.building)} est hors réseau : sa région ne porte plus vos couleurs`,
    EMPTY_ORDER: () => 'un lot d’au moins une unité',
    ORDER_ABOVE_RESERVE: (d) => `la réserve d’entrée ne permet que ${num(d.maximum)}`,
    ORDER_RUNNING: (d) =>
      `un lot court déjà : ${num(d.produced)} sur ${num(d.ordered)} — annulez-le d’abord`,
    NO_ORDER: () => 'aucun lot en cours',
    /** Même règle que le plafond de bâtiments : le refus dit son remède **chiffré**. Les deux
     *  nombres viennent de `movementSlots`, servis par le serveur — jamais recopiés ici. */
    MOVEMENT_IN_FLIGHT: (d) =>
      `slots de mouvement tous engagés (${num(d.maximum)})${slotRelief(d.nextHqLevel, d.nextSlots)}`,
    NO_LAND_ROUTE: (d) => `aucune route terrestre de ${str(d.from)} à ${str(d.to)}`,
    UNKNOWN_TROOP: () => 'troupe inconnue',
    DUPLICATE_TROOP: () => 'une troupe ne se nomme qu’une fois dans un mouvement',
    TROOP_NOT_AT_ORIGIN: () => 'la troupe ne stationne pas à cette adresse',
    /** **Le rôle fautif est nommé quand l'appelant le connaît** : la rose lit la colonne sous ses
     *  yeux et peut dire *quoi* bloque, le serveur refuse une charge utile qui ne le porte pas. */
    INFANTRY_ONLY: (d) =>
      d.role === undefined
        ? 'seule l’infanterie fonde un avant-poste'
        : `${aRoleName(d.role)} ne fonde pas — seule l’infanterie plante un point`,
    INFANTRY_REQUIRED: () => 'il faut au moins une troupe d’infanterie pour rapporter la charge',
    WAREHOUSE_TARGET_ONLY: () => 'seuls un entrepôt ou un site producteur se pillent',
    CAPTURE_NEEDS_INFANTRY: () => 'seule l’infanterie capture : il en faut au moins une troupe',
    HQ_NOT_CAPTURABLE: () => 'un quartier général ne se capture pas encore',
    NO_PORT_AT_DEPARTURE: () => 'aucun port là d’où part la colonne — on n’embarque pas sans quai',
    NO_AIRFIELD_AT_DEPARTURE: () =>
      'aucun aérodrome là d’où part la colonne — on ne décolle pas d’un champ',
    /** Le débarquement en deux temps (72a) : la phrase dit la plage, pas la règle — marcher vers
     *  l'intérieur est l'ordre d'après, et le joueur le donnera lui-même. **Depuis le 18/09 le
     *  large est permis** (règle 1) : la phrase ne sort donc plus que sur l'intérieur des terres,
     *  et c'est exactement ce qu'elle nomme. */
    LANDING_NEEDS_A_COAST: () => 'une colonne embarquée ne débarque que sur une côte',
    /** **Le large ne se quitte qu'à bord** (règle 3 du 18/09). La phrase dit ce qu'il faudrait —
     *  une coque — parce que c'est la seule chose que le joueur peut encore faire venir. */
    NO_HULL_AT_SEA: () => 'plus rien ne flotte sous cette pile — une coque, ou elle reste au large',
    /** **On ne fonde pas en mer** (règle 5 du 18/09) : un avant-poste ouvre du terrain, et le
     *  large n'en est pas. */
    NO_FOUNDING_AT_SEA: () => 'on ne fonde pas en mer — il n’y a pas de sol à ouvrir',
    LAND_TARGET_REQUIRED: () =>
      'une troupe terrestre doit viser la terre — embarquez-la pour traverser la mer',
    SEA_TARGET_REQUIRED: () => 'un navire doit viser la mer, une côte ou un port',
    /** The stack's footer prints this **before** the aim, not after the refusal: it says how
     *  many berths are short, because "il manque du transport" leaves the player counting — or,
     *  berths enough but scattered, that a troop sits in one transport only (ADR 0025 §2). */
    NOT_ENOUGH_LIFT: (d) =>
      `${num(d.needed)} place${plural(Number(d.needed), '', 's')} à embarquer pour ${num(
        d.offered,
      )} à bord — ${
        Number(d.needed) > Number(d.offered)
          ? `il en manque ${num(Number(d.needed) - Number(d.offered))}`
          : 'une troupe ne tient dans aucun transport'
      }`,
    AIRFIELD_TARGET_REQUIRED: () =>
      'un avion chargé de troupes ne descend que dans un de vos aérodromes',
    LAND_TROOPS_ONLY: () => 'seules les troupes terrestres embarquent',
    NO_TRANSPORT_HERE: () => 'aucun cargo ni porte-avions ici pour vous prendre à bord',
    AIRFIELD_BOARDING_ONLY: () => 'un avion n’embarque personne hors d’un aérodrome',
    TOO_FAR_TO_BOARD: (d) =>
      `trop loin pour embarquer : ${num(d.km)} km, ${num(d.maximum)} au plus — approchez-vous`,
    NO_CARGO_CAPACITY: () => 'aucune capacité libre pour ramener ce butin',
    UNKNOWN_OUTPOST: () => 'avant-poste inconnu',
    UNKNOWN_OBJECTIVE: () => 'objectif inconnu',
    /** **La même lecture que le métier scellé** : une colonne s'appuie sur ce relais, son allure
     *  est déjà comptée, et le point ne peut ni changer de métier ni disparaître sous elle. */
    OUTPOST_SERVING: () =>
      'une colonne marche dans la portée de ce point — il ne se démantèle pas sous elle',
    /** **On ne rénove pas sous le feu** (décision 3a du 15/09). Le refus dit l'état, pas une
     *  perte : le point revient, et un chantier déjà en file l'attend sans s'annuler. */
    OUTPOST_DISABLED: () => 'avant-poste hors service — il ne se monte pas tant qu’il l’est',
    OUTPOST_RAISE_QUEUED: () => 'une élévation de cet avant-poste est déjà en file',
    /** **Deux refus sous un même code** : marcher sur les siens, et fonder là où l'on bâtit déjà.
     *  La région nommée est ce qui sépare les deux — sans elle, « on ne marche pas sur les siens »
     *  répondrait à côté d'un geste qui n'est pas une marche. */
    FRIENDLY_TARGET: (d) =>
      d.region === undefined
        ? 'on ne marche pas sur les siens'
        : `${str(d.region)} porte déjà un de vos bâtiments`,
    EMPTY_MOVEMENT: () => 'un mouvement part avec au moins une troupe',
    OUTPOST_TARGET_ONLY: () => 'un raid marche sur un avant-poste et sur rien d’autre',
    POINT_TARGET_ONLY: () => 'une marche va sur un point de la carte et sur rien d’autre',
    POINT_OFF_MAP: () => 'ce point n’est pas sur la carte',
    /** ADR 0024 §4 : on attaque un relevé, pas un endroit. La phrase dit ce qu'il faut avoir
     *  fait avant — regarder — plutôt que de laisser croire à une portée qui manque. */
    NOTHING_TO_ATTACK: () =>
      'rien de relevé à cet endroit : un assaut vise un camp, une installation ou un avant-poste',
    /** Decision 70b, said of the first role the door is shut to: the rose borrows this very
     *  sentence before the click, the server answers it after. */
    NOT_A_GARRISON_FOR: (d) => `${aRoleName(d.role)} n’entre pas dans ${aBuildingName(d.building)}`,
    NOT_ORDERABLE: () => 'ce mouvement ne s’ordonne pas — le retour naît de la résolution',
    EMPTY_MESSAGE: () => 'un message vide ne part pas',
    MESSAGE_TOO_LONG: (d) => `${num(d.maximum)} caractères au plus — la ligne est courte`,
    UNKNOWN_RECIPIENT: () => 'ce destinataire n’est pas à la table',
    TELEGRAPH_TOO_FAST: () => 'un message par seconde — laissez la ligne respirer',
    UNKNOWN_COMBAT: () => 'ce combat n’a plus de compte rendu à rejouer',
    NOT_A_PARTY: () => 'on ne rejoue que ses propres combats',
  } satisfies Record<ErrorCode, (details: Record<string, unknown>) => string>,

  unexpectedError: 'une erreur imprévue est survenue — réessayez',

  notifications: {
    kicker: 'dépêche — incident',
    /** Un avis n'est pas un incident : il dit qu'une action a pris, ailleurs. Un mot, comme le
     *  kicker d'une brève de journal. */
    noticeKicker: 'avis',
    close: 'fermer',
  },

  errorScreen: {
    kicker: 'liaison interrompue',
    title: 'le bureau ne répond plus',
    retry: 'réessayer',
    backHome: 'retour à l’accueil',
  },

  notFoundScreen: {
    kicker: 'adresse inconnue',
    title: 'page introuvable',
    message: 'cette adresse ne mène à aucune page du journal.',
  },

  common: {
    close: 'fermer',
    noNation: 'sans nation',
    players: (count: number) => `${count} joueur${plural(count, '', 's')}`,
    slot: '1 slot',
    dash: '—',
    /** Le niveau d'un bâtiment en abrégé, là où une ligne n'a pas la place du mot entier. */
    levelShort: (level: number) => `niv ${level}`,
    /** Le « ? » qui déplie une phrase d'aide : la phrase se lit une fois, le chiffre tous les jours. */
    help: 'aide',
  },

  /**
   * **La manchette : le titre du journal, et le journal est le jeu.** « WW » est un pavé
   * d'imprimeur, « SIM » la suite en didone — un logo au trait, jamais une image : il doit vivre
   * à toutes les tailles et prendre l'encre du support sans qu'on repasse par un fichier.
   */
  masthead: {
    article: 'la',
    word: 'Manchette',
    dateline: 'le monde en jeu — édition de guerre',
    title: 'La Manchette',
  },

  /** **Les crédits** (`/credits`) : chaque ligne est justifiée par un fichier du dépôt — les
   *  générateurs de `scripts/`, `index.html`, `package.json`. Les liens de licence et de source
   *  sont ceux que les licences exigent quand elles en exigent. */
  credits: {
    title: 'Crédits',
    tagline: 'sources et licences',
    open: 'crédits',
    sources: [
      {
        name: 'Natural Earth',
        use: 'Littoraux (via le paquet world-atlas, ISC), frontières et régions admin-1 de la carte.',
        licence: 'Domaine public.',
        attribution:
          'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.',
      },
      {
        name: 'GeoBasis-DE / BKG',
        use: 'Découpage de la Bavière, du Bade-Wurtemberg et de la Hesse en Regierungsbezirke (VG2500).',
        licence: 'Licence de données Allemagne – attribution – version 2.0 (dl-de/by-2-0).',
        attribution: '© GeoBasis-DE / BKG (2025), données modifiées',
        licenceUrl: 'https://www.govdata.de/dl-de/by-2-0',
        sourceUrl: 'https://daten.gdz.bkg.bund.de/produkte/vg/vg2500/',
      },
      {
        name: 'NOAA NCEI — ETOPO 2022',
        use: 'Classement des régions par relief, climat, forêt (relief).',
        licence: 'Domaine public (États-Unis).',
        attribution: 'NOAA NCEI (2022), ETOPO 2022 Global Relief Model, doi:10.25921/fd45-gt74',
      },
      {
        name: 'Köppen-Geiger (Beck et al. 2023)',
        use: 'Classement des régions par relief, climat, forêt (climat).',
        licence: 'CC BY 4.0.',
        attribution:
          'Beck, H. E. et al., High-resolution (1 km) Köppen-Geiger maps for 1901–2099, Scientific Data 10, 724 (2023) ; figshare doi:10.6084/m9.figshare.21789074',
        licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      },
      {
        name: 'Hansen et al. 2013, agrégé par Wallace et al.',
        use: 'Classement des régions par relief, climat, forêt (couvert forestier).',
        licence: 'CC BY 4.0.',
        attribution:
          'Hansen, M. C. et al., Science 342, 850 (2013) — Hansen/UMD/Google/USGS/NASA ; agrégat : Wallace et al., doi:10.5281/zenodo.16930105',
        licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
        sourceUrl: 'https://zenodo.org/records/16930105',
      },
      {
        name: 'Archivo Narrow, Bodoni Moda, IBM Plex Mono, Source Serif 4',
        use: 'Les caractères du journal, servis par Google Fonts.',
        licence: 'SIL Open Font License 1.1.',
      },
      {
        name: 'country-flag-icons',
        use: 'Les drapeaux des nations.',
        licence: 'MIT.',
        attribution: '© 2020 catamphetamine',
        licenceUrl: 'https://gitlab.com/catamphetamine/country-flag-icons/-/blob/master/LICENSE',
      },
      {
        name: 'i18n-iso-countries',
        use: 'Les noms des pays.',
        licence: 'MIT.',
        attribution: '© 2016 widdix GmbH',
        licenceUrl: 'https://github.com/michaelwittig/node-i18n-iso-countries/blob/master/LICENSE',
      },
    ] as {
      name: string;
      use: string;
      licence: string;
      attribution?: string;
      licenceUrl?: string;
      sourceUrl?: string;
    }[],
    software:
      'Le jeu repose sur des logiciels libres, dont three.js, React, TanStack Router et Convex.',
  },

  auth: {
    dateline: 'bureau des engagements',
    loginTagline: 'reprendre ses parties',
    registerTagline: 'ouvrir un dossier',
    nicknameLabel: 'pseudo',
    nicknamePlaceholder: 'votre nom de guerre',
    passwordLabel: 'mot de passe',
    passwordPlaceholder: '••••••••',
    /** **Il n'y a pas d'e-mail** (ADR 0022), donc pas de « mot de passe oublié » : la phrase
     *  le dit avant la perte, pas après. */
    passwordNote:
      'aucun e-mail n’est demandé — un mot de passe perdu se remet à zéro par le tenancier du serveur',
    loginSubmit: 'entrer',
    registerSubmit: 'ouvrir le dossier',
    pending: 'en ligne…',
    toRegister: 'pas encore de dossier ? en ouvrir un',
    toLogin: 'déjà un dossier ? se connecter',
    signedIn: (nickname: string) => `dossier de ${nickname}`,
    logout: 'se déconnecter',
    logoutNote:
      'la place reste au compte — on ferme un appareil, on ne rend pas son siège. Reconnectez-vous et la partie est là.',
    logoutOthers: 'déconnecter les autres appareils',
    logoutOthersNote:
      'ferme ce compte partout ailleurs et y coupe les notifications. Cet appareil reste connecté.',
    logoutOthersDone: (closed: number) =>
      closed === 0
        ? 'aucun autre appareil n’était connecté'
        : `${closed} ${plural(closed, 'session fermée', 'sessions fermées')}`,
    noBackend:
      'Aucun backend configuré (VITE_CONVEX_URL absent). Lancez la pile locale avec docker compose up — voir deploiement/README.md.',
  },

  /** Le film de 30 s, à la demande : un lien discret sur les deux pages d'entrée. */
  film: {
    open: 'voir le film d’annonce — 30 s',
    title: 'le film d’annonce',
    unavailable: 'Le film n’est pas disponible pour l’instant.',
  },

  /** **La une** (`/` sans session, maquette 2a du 03/10) : une première page qui ne propose pas
   *  de compte seul — on entre sur invitation (marque-1c). */
  front: {
    /** La date du jour en tête de page, longue au bureau, abrégée sur téléphone. */
    date: (at: Date) =>
      new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(at),
    shortDate: (at: Date) =>
      new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(
        at,
      ),
    shortDateline: 'édition de guerre',
    film: 'voir le film (30 s)',
    caption: 'Le plateau, à l’encre : des forces se déplacent sur la carte du monde.',
    headline: 'Sept jours pour refaire le monde',
    lede: 'Stratégie entre amis sur une carte du monde réel : 2 à 8 joueurs, une saison de sept jours.',
    stamp: 'sur invitation',
    codeTitle: 'J’ai un code d’invitation',
    codeLabel: 'code d’invitation',
    codeHint: 'Six caractères, reçus avec l’invitation',
    open: 'ouvrir',
    accountTitle: 'Déjà un compte ?',
    signIn: 'se connecter',
    haveCode: 'j’ai un code',
    /** Le chemin inverse, au pied de la connexion et de l'invitation (`SheetExit`). */
    back: 'retour à la une',
    briefs: [
      {
        kicker: 'la saison',
        text: 'Une saison dure sept jours. On y passe quelques minutes, plusieurs fois par jour.',
      },
      {
        kicker: 'la nation',
        text: 'Chacun prend une nation de 1940, la développe, et envoie ses forces sur terre, en mer et dans les airs.',
      },
      {
        kicker: 'les ordres',
        text: 'Les ordres se donnent, puis la carte les exécute pendant qu’on vit sa vie. Une dépêche prévient quand il se passe quelque chose.',
      },
    ],
  },

  /** **La feuille qu'ouvre un lien d'invitation** (`/rejoindre/CODE`). Les refus sont ceux du
   *  serveur, dits par `fr.errors` : une phrase, jamais un bouton grisé (ADR 0015) — sauf
   *  l'heure de clôture, que seule cette page sait donner. */
  invitation: {
    opening: 'Ouverture de l’invitation…',
    invitedBy: (founder: string | null) =>
      founder === null ? 'on vous invite à une partie' : `${founder} vous invite`,
    tagline: 'une place vous attend à la table',
    duration: (pace: string) => `saison : ${pace}`,
    placesLeft: (count: number) =>
      `${count} place${plural(count, '', 's')} restante${plural(count, '', 's')}`,
    join: 'rejoindre la partie',
    resume: 'reprendre',
    toHome: 'retour à l’accueil',
    closedSince: (date: string) => `Les nouvelles inscriptions ont été closes le ${date}.`,
    signedIn: (nickname: string) => `vous entrez sous le nom de ${nickname}`,
    /** Le compte est né, la place non : le salon s'est rempli entre-temps. Le dossier est gardé. */
    accountKept: 'Votre dossier est ouvert et gardé — il vous attend à l’accueil.',
  },

  home: {
    edition: 'édition du jour',
    audience: '2 à 8 joueurs — entre amis',
    tagline: 'projeter de la force — l’information est chère, tout engagement est irréversible',
    stampTitle: 'état-major',
    stampSub: 'bureau des cartes',
    gamesHeader: 'mes parties',
    gamesNote: 'les parties de votre dossier',
    gamesCount: (count: number) => `${count} partie${plural(count, '', 's')}`,
    resume: 'reprendre',
    resumeLobby: (code: string) => `salon ${code}`,
    resumeSeason: 'saison en cours',
    /** L'entrée d'un défait : elle ouvre le même plateau, en l'état. Ce n'est pas une
     *  partie qu'on reprend, c'est une guerre qu'on regarde finir. */
    resumeDefeated: 'défaite : observer',
    statusLabel: 'statut',
    endsIn: 'fin dans',
    open: 'ouvert',
    finished: 'terminée',
    foundTitle: 'Fonder une saison',
    /** Fonder demande le mode ; l'horloge et le plafond de joueurs en découlent (`MODE_RULES`). */
    foundNote: 'Choisissez le mode : l’horloge et le nombre de joueurs en découlent.',
    noClock: 'sans horloge',
    foundSubmit: 'fonder — obtenir un code',
    joinTitle: 'Rejoindre par code',
    joinNote: 'Six caractères reçus d’un fondateur. La cadence est déjà fixée.',
    codeLabel: 'code de partie',
    codePlaceholder: 'ABC234',
    joinHint: (hours: number) =>
      `Les nouvelles places sont admises avant le lancement et pendant les ${hours} premières heures.`,
    joinSubmit: 'rejoindre le salon',
    footerLeft: 'tour de jeu asynchrone · plage de repos respectée',
    footerRight: 'région fixée au lancement',
    noBackend: {
      before: 'Aucun backend configuré (',
      env: 'VITE_CONVEX_URL',
      middle: ' absent). Lancez la pile locale avec ',
      command: 'docker compose up',
      after: ' — voir ',
      readme: 'deploiement/README.md',
      end: '.',
    },
  },

  lobby: {
    opening: 'Ouverture du salon…',
    header: (pace: string) => `salon de saison — ${pace}`,
    regionLabel: (region: string) => `région : ${region}`,
    quit: 'quitter',
    codeLabel: 'code de partie — à partager',
    codeNote: 'Partagez ce code pour inviter vos amis tant que les inscriptions sont ouvertes.',
    copyCode: 'copier le code',
    codeCopied: 'code copié',
    copyLink: 'copier le lien d’invitation',
    linkCopied: 'lien copié',
    participantCount: (count: number, maximum: number) =>
      `${count} joueur${plural(count, '', 's')} inscrit${plural(count, '', 's')} sur ${maximum}`,
    registrationBeforeLaunch: (hours: number) =>
      `Les inscriptions sont ouvertes avant le lancement, puis pendant les ${hours} premières heures.`,
    registrationUntil: (date: string) => `Clôture des nouvelles inscriptions : ${date}.`,
    registrationClosed: 'Les nouvelles inscriptions sont closes.',
    registrationConcluded: 'La saison est conclue ; elle peut être relue.',
    nationsHeader: 'nations — premier arrivé, premier servi',
    nationsFree: (count: number) =>
      `${count} nation${plural(count, '', 's')} libre${plural(count, '', 's')}`,
    you: 'vous',
    takenBy: (nickname: string) => `prise · ${nickname}`,
    toBalance: 'à équilibrer',
    free: 'libre',
    reservationNote:
      'La réservation se relâche d’un clic tant que la saison n’est pas lancée. La richesse des pays neutres (graine) ne sera révélée qu’au lancement.',
    playersHeader: 'joueurs',
    founder: 'fondateur',
    ready: 'prêt',
    waiting: 'en attente',
    freeSeat: 'place libre',
    restHeader: 'ma plage de repos — publique',
    restFrom: 'à partir de',
    restUntil: (end: string) => `jusqu’à ${end}`,
    restNote:
      'Sept heures par nuit, durée fixe : vous choisissez quand vous dormez, pas combien de temps. Vos adversaires la voient, et aucun mouvement ne peut arriver pendant — il attend à la frontière. Elle se scelle au lancement, comme la nation.',
    restDeclare: 'déclarer',
    restDeclared: 'déclarée ✓',
    checkNation: 'une nation réservée',
    checkAllReady: 'tous les joueurs déclarés prêts',
    declareReady: 'me déclarer prêt',
    declareNotReady: 'je ne suis plus prêt',
    launch: 'lancer la saison — irréversible',
    launchSeedNote: 'la graine des pays neutres sera tirée au lancement',
    launchMissing: (count: number) => `il manque ${count} condition${plural(count, '', 's')}`,
    creatorOnly: 'seul le fondateur lance la saison.',
    destroy: 'supprimer la partie',
    destroyConfirm: 'confirmer — tout est effacé',
    destroyCancel: 'annuler',
    destroyNote: 'la partie disparaît pour tous les joueurs, sans retour.',
    /**
     * **Le salon a deux visages** : celui d'avant le lancement, et celui d'un retardataire qui
     * rejoint une saison déjà en cours. Rien à y déclarer prêt, personne à attendre — la guerre
     * a commencé sans lui et ne le rattrapera pas : il reçoit le kit de lancement tel quel.
     */
    enterWarHeader: 'entrée en guerre — la saison court déjà',
    enterWarNote:
      'La saison a été lancée sans vous. Votre siège est conservé : choisissez votre nation et terminez votre préparation quand vous le souhaitez. Vous entrez avec la dotation de départ, sans compensation pour les heures écoulées.',
    enterWar: 'entrer en guerre — irréversible',
    enterWarMissing: (count: number) =>
      `il manque ${count} condition${plural(count, '', 's')} — une nation`,
    enterWarSeedNote: 'votre nation apparaît au journal de tous les belligérants',
    enterWarNationsHeader: 'nations encore libres',
    belligerents: 'belligérants',
    atWar: 'en guerre',
    footerLeft: 'la partie commence quand le fondateur lance — pas avant',
    footerEnterWar: 'la saison court — votre entrée est immédiate',
    footerCode: (code: string) => `salon ${code}`,
    pace2: '2 heures',
    pace48: '48 heures',
    pace168: '7 jours',
    paceNone: 'sans horloge',
  },

  launchSequence: {
    order: 'ORDRE DE MOBILISATION',
    sealed: 'scellé — aucun retour',
    seed: 'graine distribuée',
    season: 'SAISON 1',
    summary: (region: string, pace: string, players: number) =>
      `${region} · ${pace} · ${players} joueurs`,
    skip: 'passer',
  },

  board: {
    linkLost: 'liaison interrompue — dernière situation connue',
    unavailableKicker: 'plateau indisponible',
    noGameTitle: 'aucune partie en cours',
    noGameBody:
      'Le plateau ne s’ouvre qu’avec une saison rejointe. Fondez-en une ou entrez le code d’une partie existante.',
    backHome: 'retour à l’accueil',
    loading: 'Préparation du plateau…',
    /**
     * What the ground holds, and nothing else. The terrain type used to read here: it came
     * from a hash of the region's name, so the tooltip was printing an invention where the
     * one true fact about the region was available and unused.
     */
    regionDeposit: (deposit: string) => `gisement de ${deposit}`,
    /** Décor seulement : aucune règle ne lit le terrain (fiche 08, « ni grille, ni terrain »). */
    regionTerrain: (terrain: string) => `terrain : ${terrain}`,
    regionNoDeposit: 'aucun gisement — caserne, aérodrome, baraquements',
    regionCoastal: 'côtière — port possible',
  },

  banner: {
    home: 'retour à l’accueil — vos parties',
    unread: (count: number) =>
      `${count} dépêche${plural(count, '', 's')} non lue${plural(count, '', 's')}`,
    slotsCount: (used: number, total: number) => `${used} / ${total}`,
    slotsTitle: (used: number, total: number) =>
      `${used} slot${plural(used, '', 's')} engagé${plural(used, '', 's')} sur ${total}`,
    counter: (label: string, stock: number, cap: number, rate: number) =>
      `${label} — ${stock} / ${cap} · ${rate >= 0 ? '+' : ''}${Math.round(rate)}/h`,
    nationSheet: (nation: string) => `${nation} — fiche de nation`,
    site: 'chantier',
    siteTitle: (name: string, region: string) => `${name} — ${region}`,
  },

  /**
   * **Le bandeau des ressources — icône, chiffre, et rien d'autre** (décision du 30/08). Ce qui
   * est rare et borne l'action vit sur une ligne permanente ; le nom, le plafond, le débit et la
   * source n'apparaissent qu'au survol, une fois, et nulle part ailleurs.
   *
   * Le diagnostic hérite des tournures du panneau Réserves qu'il remplace : la saturation nomme
   * ce qui tourne pour rien et le magasin à agrandir.
   */
  resourceBand: {
    /** Le seul endroit où le plafond et le débit se lisent — d'où les quatre champs d'un coup. */
    tooltip: (resource: string, stock: number, cap: number, perHour: number) =>
      `${resource} · ${num(stock)} / ${num(cap)} · ${perHour > 0 ? '+' : ''}${tenths(perHour)} / h`,
    source: (building: string, level: number) => `${building} MK${num(level)}`,
    fullDiagnosis: (producer: string, store: string, perHour: number) =>
      `${producer} tourne pour rien — ${tenths(perHour)} / h perdus, agrandir ${store}`,
    /** Au plafond sans rien qui la remplisse : agrandir le magasin n'y changerait rien, on le dit. */
    fullQuiet: (resource: string) => `${resource} au plafond — rien n’en produit`,
    /** L'étiquette qui pend sous une réserve à sec (réglette), seule encre rouge de la ligne. */
    dry: 'à sec',
    drySoon: (hours: number) => `à sec dans ${num(hours)} h`,
    /** Huit colonnes sur un téléphone : l'étiquette tient à peu près dans la sienne. */
    drySoonShort: (hours: number) => `à sec ${num(hours)} h`,
    /** **Trois lettres par colonne sous le seuil** (passe 2, A1) : huit colonnes sur un téléphone,
     *  et le nom entier revient au toucher, dans la même carte que le plafond et le débit. */
    abbreviations: {
      food: 'nou',
      textile: 'tis',
      coal: 'cha',
      oil: 'pét',
      ore: 'min',
      alloy: 'all',
      ammunition: 'mun',
      bandages: 'ban',
    } satisfies Record<ResourceKey, string>,
    slots: 'mouvements',
  },

  /**
   * **La presse — le classement, à l'heure du dernier relevé** (contrat de vue 07, annexe
   * `07-presse-donnees.md`, barème `propositions/classement-bareme.md`). Les chaînes sont celles
   * de l'annexe, mot pour mot : la maquette a été validée dessus, et une reformulation ici
   * décalerait la colonne qu'elle a mesurée.
   *
   * **Aucune mention « estimations ».** Les chiffres sont exacts depuis la décision 80 ; la
   * manchette « scores relevés à » est la seule source que la page cite, et c'est elle qui porte
   * tout l'avertissement : ce n'est pas maintenant, c'est le relevé de 14 heures.
   */
  press: {
    title: 'Presse',
    /** Ce que la page dit d'elle-même au rail — la seule promesse qu'elle tient. */
    kicker: 'classement de la saison',
    capturedAt: (time: string) => `scores relevés à ${time}`,
    next: (time: string) => `prochaine édition à ${time}`,
    final: 'édition finale',
    none: 'Aucune édition n’a encore paru — la première tombe trois heures après le lancement.',
    columns: {
      rank: 'rang',
      nation: 'nation',
      pseudo: 'pseudo',
      territory: 'territoire',
      general: 'score général',
      deeds: 'faits d’armes',
    },
    /** Le tri est une lecture, jamais un ordre : la page n'envoie rien, et l'ordre servi reste
     *  celui du territoire — le but de la saison (79a). */
    sortBy: (column: string) => `trier par ${column}, du plus grand au plus petit`,
    leadColumn: 'premier de la colonne',
    ownRegisters: 'selon nos propres registres',
    registers: {
      title: 'nos registres',
      territory: 'territoire',
      industry: 'industrie',
      military: 'puissance militaire',
      deeds: 'faits d’armes',
      general: 'score général',
      since: (time: string) => `depuis l’édition de ${time}`,
      /** Première édition : rien à comparer, et un « +393 » depuis le néant serait une
       *  progression inventée. */
      noPrevious: 'première édition — rien à comparer',
    },
    /** **Le signe s'imprime toujours**, et `=` remplace un zéro : une case vide se lirait comme
     *  une donnée manquante plutôt que comme une immobilité. */
    delta: (value: number, decimals = 0): string =>
      Math.abs(value) < 10 ** -decimals / 2
        ? '='
        : `${value > 0 ? '+' : '−'}${decimal(Math.abs(value), decimals)}`,
    percent: (value: number): string => `${decimal(value, 1)} %`,
    score: (value: number): string => decimal(value, 0),
    /** Le rang de la dernière édition, à la française : « 1ᵉʳ », puis « 2ᵉ ». */
    ordinal: (rank: number): string => (rank === 1 ? '1ᵉʳ' : `${rank}ᵉ`),
    /** L'exposant seul, quand le chiffre se compose à part (la vedette du téléphone, 1j). */
    ordinalSuffix: (rank: number): string => (rank === 1 ? 'ᵉʳ' : 'ᵉ'),
    /** **Sous le seuil, la prochaine édition se compte à rebours** (refonte mobile, 1j) : on
     *  ouvre la presse pour savoir où l'on en est, et quand on le saura de nouveau. */
    nextIn: (time: string, hours: number, minutes: number) =>
      `prochaine ${time} · dans ${hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${minutes} min`}`,
    points: (value: number): string => `${decimal(value, 0)} pts`,
    deedsCount: (value: number): string => `${decimal(value, 0)} fait${plural(value, '', 's')}`,
    you: 'vous',
    /** Ce que la page tient de son propre dispositif — la seule phrase d'explication qu'elle
     *  s'autorise, sous la table. */
    frozen: 'Entre deux éditions, recruter ne déplace pas un chiffre de la page.',
  },

  rail: {
    /** L'onglet « prod. » est mort avec la fenêtre Production (59a) ; l'abaque prend sa place
     *  parce qu'il est la seule lecture des unités qui ne demande de posséder rien (contrat 06). */
    gunnery: { title: 'Abaque de tir — qui bat qui', label: 'abaque' },
    economy: { title: 'Économie — chantier, filière et projection', label: 'écon.' },
    nation: { title: 'Ma nation — fiche de lecture', label: 'nation' },
    press: { title: 'Presse — le classement au dernier relevé', label: 'presse' },
    telegraph: { title: 'Télégraphe — canal général de la saison', label: 'télég.' },
    journal: { title: 'Journal d’événements', label: 'journal' },
    todo: 'à faire',
    settings: 'Réglages',
    settingsShort: 'régl.',
    seasonEnd: (season: number, hours: number, minutes: string) =>
      `saison ${season} — fin dans ${hours} h ${minutes}`,
    /** Une saison sans horloge ne compte rien à rebours : le rail le dit en un mot plutôt que
     *  d'afficher un « 0 h 00 » qui se lirait comme une fin imminente. */
    seasonNoClock: (season: number) => `saison ${season} — sans horloge`,
    seasonShort: (season: number) => `S.${season}`,
    telegraphUnread: (count: number) =>
      `${count} message${plural(count, '', 's')} non lu${plural(count, '', 's')} au télégraphe`,
  },

  /**
   * **Le rapporteur** (téléphone, table plein écran, 13/10) : le coin d'encre qui remplace la barre
   * de pied, et ses ronds posés sur l'arc. Les titres des ronds sont ceux de `foot`.
   */
  protractor: {
    label: 'menu du plateau',
    open: (waiting: number) =>
      `${waiting > 0 ? `${num(waiting)} à faire — ` : ''}ouvrir le menu : à faire, chantiers, journal, presse, télégraphe, réglages`,
    close: 'refermer le menu',
    closeShort: 'fermer',
    works: 'chant.',
  },

  /** Les entrées du téléphone, que portaient la barre de pied et que portent les ronds du
   *  rapporteur. */
  foot: {
    works: 'chantiers',
    journal: 'journal',
    todo: 'à faire',
    press: 'presse',
    telegraph: 'télégraphe',
    layersTitle: 'Calques de la carte',
  },

  /**
   * **La colonne « En cours »** (refonte mobile, 1a) : chaque compte à rebours du joueur, du plus
   * proche au plus lointain. Les libellés sont en capitales par la feuille de style.
   */
  underway: {
    header: 'en cours',
    fold: 'replier la colonne « en cours »',
    unfold: 'déplier la colonne « en cours »',
    locate: (label: string) => `${label} — recentrer la carte`,
    movement: (type: string, destination: string) => `${type} → ${destination}`,
    construction: (building: string, level: number) => `${building} → niveau ${num(level)}`,
    raise: (level: number) => `avant-poste → niveau ${num(level)}`,
    foundation: (country: string) => `fondation · ${country}`,
    recruitment: (region: string) => `recrutement · ${region}`,
    lot: (ordered: number, resource: string) => `lot · ${num(ordered)} ${resource}`,
  },

  /**
   * **Le dossier de la nation, sous le drapeau du bandeau** (refonte mobile, 1s) : tout ce qu'on
   * cherche à froid, une ligne par porte, et la phrase sous chacune dit ce qu'on y trouve.
   */
  dossier: {
    open: (nation: string) => `${nation} — ouvrir le dossier de la nation`,
    seasonDay: (season: number, day: number) => `saison ${season}, jour ${day}`,
    rank: (ordinal: string) => `${ordinal} au classement`,
    nation: 'Fiche de nation',
    nationNote: (troops: number) =>
      `${num(troops)} troupe${plural(troops, '', 's')}, nos registres, entretien`,
    gunnery: 'Abaque de tir',
    gunneryNote: 'qui bat qui — tout le matériel du jeu',
    layers: 'Calques de la carte',
    layersNote: (lit: number, total: number) =>
      `${lit} sur ${total} allumé${plural(lit, '', 's')} — aussi sur la carte`,
    settings: 'Réglages',
    settingsNote: 'son du télégraphe, notifications, échelle',
    briefingNote: 'les gestes, le terrain, vos bureaux',
  },

  indicatorCategories: {
    buildings: 'bâtiments',
    deposits: 'gisements',
    outposts: 'avant-postes',
    objectives: 'objectifs neutres',
    constructions: 'chantiers',
    forces: 'forces',
    'my-movements': 'mes mouvements',
    inbound: 'cap sur moi',
    intel: 'renseignement',
  },

  edgeIndicators: {
    groupTitle: (count: number, nature: string) => `${count} ${nature} hors champ`,
    singleTitle: (nature: string) => `${nature} — hors champ`,
    natures: {
      buildings: 'bâtiments',
      deposits: 'gisements',
      outposts: 'avant-postes',
      objectives: 'objectifs neutres',
      constructions: 'chantiers',
      forces: 'forces',
      'my-movements': 'mouvements',
      inbound: 'mouvements cap sur moi',
      intel: 'contacts',
    },
  },

  /**
   * **Une passe de résolution se raconte en hommes et en machines**, jamais en pourcentage
   * (ADR 0014) : « 2 troupes contre 1, j'en perds 16, il en perd 22 » se comprend sans manuel,
   * et c'est la seule qualité qu'on demande à cette phrase.
   */
  combat: {
    dispatch: ({
      where,
      intercepted,
      attacking,
      won,
      mine,
      theirs,
      outpostDisabled,
    }: {
      where: string;
      intercepted: boolean;
      attacking: boolean;
      won: boolean;
      mine: { troops: number; lost: number; routed: number; destroyed: number };
      theirs: { troops: number; lost: number; routed: number; destroyed: number };
      outpostDisabled: boolean;
    }) => {
      const opening = intercepted
        ? attacking
          ? `interception ${where}`
          : `colonne interceptée ${where}`
        : attacking
          ? `engagement ${where}`
          : `attaque reçue ${where}`;
      const forces = `${mine.troops} contre ${theirs.troops}`;
      const toll = combatBeats(attacking, mine.lost, theirs.lost);
      const after = [
        won ? 'terrain tenu' : 'terrain perdu',
        mine.routed > 0 ? `${mine.routed} déroute${plural(mine.routed, '', 's')} chez moi` : null,
        theirs.routed > 0
          ? `${theirs.routed} déroute${plural(theirs.routed, '', 's')} en face`
          : null,
        outpostDisabled ? 'avant-poste désactivé' : null,
      ].filter((piece): piece is string => piece !== null);
      return `${opening} — ${forces}, ${toll} · ${after.join(' · ')}`;
    },
    disabledUntil: (time: string) => `désactivé — retour à ${time}`,
    beats: combatBeats,
  },

  /**
   * **La victoire de test — un échafaudage, pas une décision de design.** La domination est
   * le mode unique (ADR 0020) ; cette barre-là tient en attendant la part de carte qui la
   * remplacera (`src/domain/victory.ts`). Le vocabulaire suit : on *réduit* un joueur, on ne
   * l'élimine jamais — il rejoue, il reconstruit, et il sort alors du compte de son bourreau.
   */
  victory: {
    kicker: 'domination — victoire de test',
    scaffold: 'condition unique et publique, en attendant la part de carte',
    dispatch: (by: string, whom: string) => `${by} a réduit ${whom}`,
    concluded: (nation: string) => `LA SAISON EST CONCLUE — ${nation} l’emporte`,
    tally: (reduced: number, target: number) => `${reduced} réduits sur ${target}`,
    reducedMark: 'réduit',
    standingMark: 'debout',
    homeConcluded: (nation: string) => `saison conclue — ${nation} l’emporte`,
  },

  /**
   * **Ce qu'un tampon dit, et il ne dit qu'une chose** (`shell/Stamp.tsx`). Un mot, deux au plus :
   * un cachet qui a besoin d'une phrase n'est pas un cachet, c'est une note. La casse haute et le
   * crènelage sont posés par le composant — écrire les majuscules ici doublerait la règle.
   */
  stamps: {
    /** La sorte de chaque dépêche, tamponnée dans la marge du journal. */
    dispatches: {
      seasonConcluded: 'saison close',
      reduction: 'réduction',
      warEntry: 'entrée en guerre',
      assault: 'assaut mené',
      attacked: 'attaque subie',
      construction: 'chantier',
      delivery: 'livraison',
      column: 'colonne',
      stalled: 'arrivée retenue',
      outpostFounded: 'avant-poste fondé',
      outpostStands: 'avant-poste debout',
      foundationLost: 'fondation perdue',
      outpostRaised: 'avant-poste élevé',
      outpostDismantled: 'avant-poste démantelé',
      outpostDisabled: 'avant-poste désactivé',
      drownedAtSea: 'coulés en mer',
      sighting: 'relevé',
      campSighted: 'camp relevé',
      firedDry: 'tir à sec',
      foundNothing: 'bredouille',
      surrender: 'capitulation',
      command: 'commandement',
      edition: 'édition',
      productionCut: 'production coupée',
      captureStarted: 'capture engagée',
      captureThreat: 'capture en cours',
      captured: 'capturé',
      siteLost: 'site perdu',
      captureCancelled: 'capture levée',
      productionRestored: 'production rétablie',
      lootTaken: 'butin pris',
      sitePlundered: 'site pillé',
      siteSabotaged: 'site saboté',
      lootLost: 'charge perdue',
      lootRecovered: 'charge reprise',
      lootCollected: 'caisse ramassée',
      lootDelivered: 'butin livré',
      objectiveRevealed: 'réserve signalée',
      objectiveGap: 'aucune réserve',
      objectiveTaken: 'réserve épuisée',
    } satisfies Record<DispatchKind, string>,
    /** Un avant-poste mis hors service par un raid. **Désactivé, jamais pris** (ADR 0004) — et
     *  pas de tampon « détruit » tant que rien sur le plateau ne compte les raids vers elle. */
    outpostDisabled: 'désactivé',
    /** Le point n'existe pas encore : il ne tient rien, n'atteint rien, ne détecte rien. Rouge
     *  parce que c'est la fenêtre où un voisin peut réagir (révision du 15/09). */
    outpostUnderConstruction: 'en chantier',
    /** **Un état, jamais une action** (ADR 0020 §6) : le bâtiment est debout, entier, et il ne
     *  rend rien parce que sa région a changé de couleur. Rien à cliquer sur le site. */
    unlinked: 'hors réseau',
    /** **Les cachets de la carte** (table d'état-major) : posés à plat à côté de la pièce, à la
     *  dépêche que le joueur reçoit déjà, et effacés trois secondes plus tard. */
    arrived: 'arrivé',
    engaged: 'engagé',
    /** Un site qui change de main, chez ses deux tenants (14/10). */
    captured: 'capturé',
    /** Un chantier à moi qui s'achève sous les yeux du joueur : l'échafaudage tombe, le tampon. */
    finished: 'achevé',
    /** Une force relevée dont le brouillard n'a pas rendu la composition (fiche 04). */
    unidentified: 'non identifié',
    /** En tête du journal quand la saison est prise : elle se relit, elle ne se joue plus. */
    seasonClosed: 'saison close',
    /** Au bandeau, pour celui qui a déposé les armes. À l'encre du support et non au rouge : la
     *  défaite est grave mais acquise, et le rouge est réservé à ce qui exige un geste. */
    defeated: 'défaite',
  },

  journal: {
    editionOf: (time: string) => `édition de ${time}`,
    /** La manchette d'une entrée en guerre — le seul canal qui l'annonce (aucun autre écran ne
     *  dit qu'un belligérant de plus est entré). */
    warEntry: (nickname: string, nation: string) =>
      `${nation.toUpperCase()} ENTRE EN GUERRE — ${nickname} rejoint le conflit`,
    /** Une entrée de la file annulée à son tour : le droit avait disparu entre la mise en file
     *  et le démarrage. La dépêche dit la restitution, sinon le joueur cherche sa matière. */
    constructionCancelled: (building: string, region: string) =>
      `Chantier abandonné : ${lowerFirst(building)} en ${region} — le droit d’y bâtir a disparu avant son tour. Matières remboursées.`,
    seasonDay: (season: number, day: number, total: number) =>
      `saison ${season} — jour ${day} sur ${total}`,
    seasonDayNoClock: (season: number, day: number) => `saison ${season} — jour ${day}`,
    masthead: 'LE JOURNAL DES OPÉRATIONS',
    dispatches: (count: number) => `${count} dépêche${plural(count, '', 's')}`,
    severities: { critical: 'critique', notable: 'notable', routine: 'routine' },
    atWaking: 'au réveil',
    stalledResolution: '. Résolution à ',
    noneStalled: 'Aucun mouvement immobilisé par une plage de repos.',
    slotsEngaged: 'slots engagés',
    resolutionAt: (time: string) => `résolution à ${time}`,
    /** **Le chiffre est rendu à part, en gros** : la manchette du journal pose le compte de
     *  non-lues en numéral et ne garde ici que le mot qui l'accorde. */
    unreadLabel: (count: number) => `non lue${plural(count, '', 's')}`,
    allRead: 'tout est lu',
    /** **Sous le seuil, des filtres et non des colonnes** (refonte mobile, 1h) : trois colonnes ne
     *  tiennent pas dans 390 px, et un défilement par colonne serait trois défilements. */
    filters: {
      all: 'tout',
      unread: (count: number) => `non lues ${count}`,
      critical: 'alertes',
      notable: 'notables',
      routine: 'routine',
    },
    sinceLastVisit: 'depuis votre dernière visite',
    earlier: 'plus tôt — déjà lues',
    noneFiltered: 'Aucune dépêche de cette sorte.',
    showOnMap: 'voir sur la carte',
    locate: 'localiser',
    fold: { show: 'afficher', hide: 'masquer' },
    /** Les éditions plus anciennes que la dernière, que le journal ne liste plus (`journalSections`). */
    earlierEditions: (count: number) =>
      `et ${count} édition${plural(count, '', 's')} précédente${plural(count, '', 's')}`,
    worldEvents: {
      title: 'événements mondiaux',
      note: 'signalements publics',
      loading: 'Les correspondances arrivent…',
      empty: 'Aucun signalement mondial publié.',
      published: (date: string) => `publié le ${date}`,
      states: {
        active: 'recherche en cours',
        ended: 'signalement terminé',
      },
      report: 'Du matériel abandonné a été signalé dans cette zone.',
      locate: 'ouvrir la zone de recherche sur la carte',
      dismiss: 'retirer la zone de recherche de la carte',
    },
    /**
     * **Une phrase entière par sorte, à la manière presse.** Le relevé ne nomme jamais la nation
     * ni le type : la notice ne les porte pas (`convex/validators.ts`), et la phrase ne pourrait
     * pas les dire même si elle essayait — c'est tout ce que la fiche 04 accorde à un relevé.
     */
    notices: {
      seasonClosed:
        'LA SAISON EST CLOSE — son fondateur y a mis fin. Elle se relit, elle ne se joue plus.',
      playerSurrendered: (nation: string) =>
        `${nation.toUpperCase()} CAPITULE — ses armes sont déposées. Ses positions tiennent, ses colonnes ne partiront plus.`,
      commandTransferred: (nation: string) => `${nation} prend la direction de la partie.`,
      /** Le rendez-vous de la table, à l'heure dite. Le rang, jamais un score : la page de
       *  presse est la lecture, cette ligne n'est que la convocation. */
      editionPublished: (time: string, rank: number) =>
        `Édition de ${time} — vous êtes ${ordinal(rank)} au classement.`,
      lootTaken: (building: string, region: string, loot: string) =>
        loot === 'rien'
          ? `${building} de ${region} neutralisé — rien à prendre.`
          : `${building} de ${region} neutralisé — charge embarquée : ${loot}.`,
      sitePlundered: (building: string, region: string, taken: string, storageLost: string) =>
        `${building} de ${region} pillé — ${taken} emporté ; ${storageLost} perdu faute de place.`,
      siteSabotaged: (building: string, region: string) =>
        `${building} de ${region} saboté — production interrompue.`,
      /** Le relevé datait : l'ordre est parti sur sa foi, et c'est le terrain qui répond. */
      expeditionFoundNothing: (building: string, region: string, reason: 'gone' | 'disabled') =>
        reason === 'gone'
          ? `Expédition bredouille — ${region} : ${building} relevé n’est plus debout. La colonne rentre à vide.`
          : `Expédition bredouille — ${region} : ${building} était déjà à l’arrêt. La colonne rentre à vide.`,
      lootLost: (loot: string) => `Charge perdue : ${loot}.`,
      lootRecovered: (country: string, loot: string) =>
        `Charge récupérée après combat — ${country} : ${loot}.`,
      lootCollected: (country: string, loot: string) => `Caisse ramassée — ${country} : ${loot}.`,
      lootDelivered: (region: string, delivered: string, lost: string) =>
        delivered === 'rien'
          ? `Livraison impossible en ${region} — charge perdue : ${lost}.`
          : lost === 'rien'
            ? `Charge livrée en ${region} : ${delivered}.`
            : `Charge livrée en ${region} : ${delivered} ; ${lost} perdu faute de place.`,
      /** **Le lieu et le nom, jamais la garnison** : on sait où aller, pas ce qu'on y trouvera. */
      objectiveRevealed: (objective: string, region: string, country: string) =>
        `${objective} — ${region}, ${country}.`,
      /** Personne n'est nommé : qui l'a vidée est de l'information de position (ADR 0005). */
      objectiveTaken: (objective: string, country: string) =>
        `${objective} — ${country} : le dépôt est épuisé.`,
      objectiveGap: (nations: ReadonlyArray<string>) =>
        `Aucune réserve signalée entre ${nations[0] ?? '—'} et ${nations[1] ?? '—'}.`,
      constructionFinished: (building: string, region: string, level: number) =>
        level <= 1
          ? `${building} en ${region} entre en service.`
          : `${building} en ${region} passe au niveau ${level}.`,
      /** Rasé sur ordre : la phrase dit le niveau, parce que c'est ce qui est parti — et rien
       *  ne revient (décision 5a du 15/09). */
      buildingDemolished: (building: string, region: string, level: number) =>
        `${building} en ${region} a été rasé — niveau ${level} perdu, rien n’est rendu.`,
      delivered: (building: string, region: string, role: string) =>
        `${building} en ${region} a livré une compagnie — ${role}.`,
      deliveredHome: (role: string) =>
        `Une compagnie — ${role} — a rejoint le pays : son site n’était plus debout.`,
      columnArrived: (
        movementType: 'march' | 'recall' | 'return',
        troops: number,
        country: string,
      ) => {
        const column = `${troops} troupe${plural(troops, '', 's')}`;
        if (movementType === 'return')
          return `Une colonne de ${column} a reflué sur ses arrières — ${country}.`;
        if (movementType === 'recall')
          return `Une garnison de ${column} est rentrée au pays — ${country}.`;
        return `Une colonne de ${column} a pris position — ${country}.`;
      },
      /** L'adresse en toutes lettres (décision 64b) : « a pris position — France » ne dirait
       *  pas quel port tient maintenant l'infanterie que le cargo attend. */
      garrisonEntered: (troops: number, building: string, region: string) =>
        `Une colonne de ${troops} troupe${plural(troops, '', 's')} est entrée en garnison à ${building} · ${region}.`,
      movementStalled: (country: string) =>
        `Une colonne attend à la frontière — ${country} : la plage de repos y interdit toute arrivée.`,
      outpostFounded: (specialization: string, country: string) =>
        `Un ${specialization} a été mis en chantier — ${country}.`,
      outpostStands: (specialization: string, country: string) =>
        `Notre ${specialization} est debout — ${country} : le sol autour prend nos couleurs.`,
      /** La phrase dit la cause, parce que c'est la seule chose que le joueur peut corriger la
       *  prochaine fois : un chantier tient tant que sa garnison tient. */
      foundationLost: (specialization: string, country: string) =>
        `Notre ${specialization} en chantier est perdu — ${country} : sa garnison n’y est plus, rien n’est remboursé.`,
      outpostDisabled: (specialization: string, country: string) =>
        `Notre ${specialization} a été désactivé par un raid — ${country}.`,
      /**
       * **Le prix de rester en mer** (règle 4 du 18/09). La phrase dit la cause parce que c'est
       * la seule perte du jeu qu'aucun tir n'explique : on ne lit nulle part ailleurs qu'une
       * cargaison n'a pas de place où se replier. Les hommes et les machines se comptent à part
       * (ADR 0014) et la place se nomme en degrés — au large, il n'y a pas de pays.
       */
      drownedAtSea: (men: number, machines: number, place: string) => {
        const lost = [
          men === 0 ? null : `${num(men)} homme${plural(men, '', 's')}`,
          machines === 0 ? null : `${num(machines)} machine${plural(machines, '', 's')}`,
        ].filter((part): part is string => part !== null);
        return `${lost.join(' et ')} ont coulé avec leur transport — ${place} : une cargaison n’a pas d’où se replier.`;
      },
      /** Le lieu est la région quand on la connaît, le pays sinon — un point d'avant le champ de
       *  région n'a que lui. La phrase dit ce que le niveau ouvre, qui est ce qu'on a payé. */
      outpostRaised: (level: number, place: string) =>
        `Notre avant-poste est passé au niveau ${num(level)} — ${place} : un emplacement de plus et ${num(OUTPOST_REACH_KM_BY_LEVEL[level] ?? 0)} km de portée.`,
      /**
       * **Le point qu'on a démonté soi-même** (décision du 16/09) — la seule fin d'un avant-poste
       * que personne ne subit, donc la seule qui n'ait pas besoin d'encre rouge. La phrase compte
       * les mâts emportés parce que c'est ce qu'on peut avoir sous-estimé en cliquant.
       */
      outpostDismantled: (level: number, country: string, buildings: number) =>
        `Notre avant-poste de niveau ${num(level)} a été démantelé — ${country}${
          buildings === 0
            ? '.'
            : ` : ${num(buildings)} bâtiment${plural(buildings, '', 's')} tombé${plural(buildings, '', 's')} avec lui.`
        }`,
      /**
       * **La production reliée, quand elle mord** (ADR 0020 §6). Elle est déposée chez le seul
       * propriétaire : l'adversaire qui vient de couper la frontière le lit sur la carte, et une
       * dépêche chez lui lui dirait ce que son renseignement n'a pas payé.
       */
      /**
       * **La capture** (14/10). Le défenseur ne lit jamais qui capture : il lit le site, et
       * l'heure où il le perdra si rien ne change — c'est la décision qu'on lui demande.
       */
      captureStarted: (site: string, until: string) =>
        `Notre infanterie tient ${site} : capture vers ${until}.`,
      captureThreat: (site: string, until: string) =>
        `${site} est en cours de capture : perdu vers ${until} si personne ne l’en chasse.`,
      captured: (site: string) => `${site} est à nous : capture achevée.`,
      siteLost: (site: string) => `${site} a été capturé — il n’est plus à nous.`,
      captureAbandoned: (site: string) =>
        `Capture de ${site} abandonnée : plus aucune infanterie à nous sur place.`,
      captureLifted: (site: string) => `La capture de ${site} est levée.`,
      captureVoid: (site: string) =>
        `Capture de ${site} sans objet : le site n’est plus à celui qu’on visait.`,
      productionCut: (sites: number, country: string) =>
        `${sites} site${plural(sites, '', 's')} hors réseau — ${country} : la région ne porte plus nos couleurs.`,
      productionRestored: (sites: number, country: string) =>
        `${sites} site${plural(sites, '', 's')} de nouveau relié${plural(sites, '', 's')} — ${country}.`,
      /**
       * **Nos guetteurs, jamais celui qu'on a vu.** Le pays nommé est celui d'où l'on a regardé :
       * la notice ne porte pas la nation de la colonne, et la phrase ne doit pas laisser croire
       * qu'elle la donne (fiche 04).
       */
      movementSighted: (detector: string, country: string, cardinal: string) =>
        `${detector} a relevé une colonne inconnue — ${country}, cap ${cardinal}.`,
      /** Le sol n'a pas de guetteur : personne n'a relevé, quelque chose est passé. */
      soilCrossed: (country: string, cardinal: string) =>
        `Une colonne inconnue a traversé notre sol — ${country}, cap ${cardinal}.`,
      /** La station est le seul détecteur que le joueur puisse montrer du doigt sur sa carte. */
      stationSighted: (region: string, country: string, cardinal: string) =>
        `Notre station d’écoute de ${region} a relevé une colonne inconnue — ${country}, cap ${cardinal}.`,
      /**
       * **Un camp relevé dans la portée** (ADR 0024 §1). Le même contrat que la colonne : le pays
       * est celui d'où l'on regarde, et rien ici ne dit ce que le camp est.
       */
      campSighted: (detector: string, country: string) =>
        `${detector} a relevé un camp inconnu — ${country}.`,
      campOnOurSoil: (country: string) => `Un camp inconnu se tient sur notre sol — ${country}.`,
      stationCampSighted: (region: string, country: string) =>
        `Notre station d’écoute de ${region} a relevé un camp inconnu — ${country}.`,
      firedDry: (country: string) =>
        `Nos troupes ont tiré à sec — ${country} : la passe de résolution s’est jouée sans munitions.`,
      /**
       * **Le seul événement du jeu qui ne laissait aucune trace.** Pas d'engagement, donc pas de
       * compte rendu : sans cette ligne, la plus longue marche d'une saison se lit « rien à
       * signaler ».
       */
      columnFoundNothing: (
        movementType: 'attack' | 'raid',
        troops: number,
        country: string,
        /**
         * **Ce qui est debout sur place, et par où on l'atteint** (retours du 11/09, ligne 5).
         * Une attaque vise un point ou une pile, jamais un bâtiment : le joueur venu saboter une
         * mine lisait « n'a trouvé personne » et repartait sans savoir que l'ordre existait.
         * `null` dès qu'aucun ordre ne porte sur ce qui est là, et la dépêche ne change pas.
         */
        site: { readonly key: BuildingKey; readonly effect: 'loot' | 'sabotage' } | null = null,
      ) => {
        const column = `${troops} troupe${plural(troops, '', 's')}`;
        const found =
          movementType === 'raid'
            ? `Notre raid est arrivé — ${country} — et n’a trouvé personne à l’avant-poste.`
            : `Notre colonne de ${column} est arrivée — ${country} — et n’a trouvé personne.`;
        if (site === null) return found;
        const order = site.effect === 'loot' ? fr.compass.plunder : fr.compass.sabotage;
        return `${found} ${upperFirst(theBuilding(site.key))} y est debout : un ordre « ${order} » pris sur son marqueur l’atteint.`;
      },
    },
  },

  /**
   * **Ce qu'on dit d'une troupe, et plus jamais d'un inventaire.** Le widget de troupes est
   * mort avec la couche permanente (décision Pierre, 30/08) : ce qui a une position se lit sur
   * la carte, et ce qui reste ici est ce qu'on écrit *à côté* d'une troupe — son adresse, son
   * effectif, ce qu'elle mange, et le cartouche qui la désigne.
   */
  troops: {
    atHome: 'à domicile',
    /** The host arrives as an `adm0_a3`; the naming happens here so that no caller can print
     *  a code by forgetting to ask for a name. */
    garrisonAt: (adm0: string) => `garnison — ${countryLabel(adm0)}`,
    /** A column left standing on the map (ADR 0019 §3), named the same way. */
    postedAt: (adm0: string) => `en campagne — ${countryLabel(adm0)}`,
    postedAtSea: 'en campagne — en mer',
    /** Le lieu seul, pour une ligne qui dit déjà de quoi elle parle : « 1 troupe sans ordre —
     *  en mer », où « en campagne — en mer » dirait deux fois la même chose. */
    atSea: 'en mer',
    strength: (current: number, nominal: number) => `effectif ${current} / ${nominal}`,
    /**
     * **Ce que la troupe mange, lu sur la troupe** (ADR 0019 §4). Le bandeau sert un débit net
     * et la fenêtre Économie le décompose par nation ; ici c'est la ligne d'une seule troupe —
     * le seul endroit où le surcoût du hors-ravitaillement se lit à côté de qui le paie.
     */
    upkeepRate: (perHour: number) => `entretien ${tenths(perHour)} nourriture / h`,
    upkeepRaised: (perHour: number, factor: number) =>
      `entretien ${tenths(perHour)} nourriture / h — hors ravitaillement ×${factor}`,
    /**
     * **La punition doit se voir là où le joueur regarde la troupe** (ADR 0019 §4). Un surcoût
     * qu'on ne lit que sur un écran de comptabilité est une punition invisible, exactement ce
     * que D3 refusait pour l'attrition.
     */
    unsupplied: (factor: number) => `hors ravitaillement — entretien ×${factor}`,
    sheetKicker: 'fiche de pile',
    sheetHealth: (health: number) => `${health} / 100`,
    sheetCount: (troops: number) => `×${troops}`,
    moreRoles: (roles: number) => `+${roles}`,
  },

  /**
   * **La pièce en main** (ADR 0026 §6) : la fiche posée au bord pendant qu'on cherche où poser, et
   * l'heure que la route du serveur rend quand le pointeur s'arrête. Le bouton qui lève et pose
   * est le gauche, qu'aucun mappage ne déplace.
   */
  hand: {
    kicker: (place: string) => `en main · ${place}`,
    scouting: (radiusKm: number) => `relève à ${num(radiusKm)} km`,
    hint: 'clic gauche sur la carte : poser · échap, ou clic sur la pièce : la reposer',
    hintFinger: 'touchez la carte pour poser, la pièce pour la reposer',
    found: 'fonder un avant-poste ici',
  },

  /**
   * **« À faire maintenant » — la carte qui a remplacé l'inventaire** (décision Pierre, 30/08).
   * Une ligne par chose qui attend le joueur, jamais une ligne par chose qu'il possède. Le
   * vocabulaire est celui d'une dépêche : ce qui manque, où, et rien d'autre — la ligne mène au
   * geste, elle ne l'explique pas.
   */
  nextActions: {
    header: 'à faire maintenant',
    count: (count: number) => `${count} en attente`,
    toMap: 'carte',
    toEconomy: 'économie',
    toSite: 'au site',
    foundation: (count: number) =>
      `${count} pose${plural(count, '', 's')} de fondation offerte${plural(count, '', 's')}`,
    idleSite: 'chantier libre — rien en file',
    siteUnderCapture: (site: string, hour: string) =>
      `${site} : capture en cours, perdue vers ${hour}`,
    sitesUnderCapture: (count: number) => `${count} sites en cours de capture`,
    captureStopped: (site: string) => `Capture de ${site} arrêtée : plus d’infanterie sur place`,
    capturesStopped: (count: number) => `${count} captures arrêtées`,
    unlinkedSites: (count: number) => `${count} site${plural(count, '', 's')} hors réseau`,
    idleProjection: (building: string, place: string) => `${building} sans recrutement — ${place}`,
    idleProjections: (count: number) => `${count} bâtiments sans recrutement`,
    /** **Une ligne par sorte** (décision Pierre, 05/10) : le lieu n'est dit qu'à une seule
     *  adresse, le total seul quand il y en a plusieurs. */
    troopWithoutOrder: (count: number, place: string | null) =>
      `${count} troupe${plural(count, '', 's')} sans ordre${place === null ? '' : ` — ${place}`}`,
    unsupplied: (count: number, place: string | null) =>
      `${count} troupe${plural(count, '', 's')} hors ravitaillement${place === null ? '' : ` — ${place}`}`,
    /** Où le prochain clic mène, parmi les occurrences d'une même sorte. */
    rank: (word: string, rank: number, total: number) => `${word} ${rank} / ${total}`,
    /** **Un avant-poste plein qu'on a de quoi monter** (précision du 15/09) : c'est la seule
     *  attente que la fiche promettait déjà sans porte pour y aller. */
    raiseOutpost: (place: string) => `avant-poste plein — montez-le · ${place}`,
    raiseOutposts: (count: number) => `${count} avant-postes pleins à monter`,
    toOutpost: 'à l’avant-poste',
    unfold: 'déplier',
    fold: 'replier',
    /** La feuille s'ouvre même vide, puisque l'entrée reste au pied : elle le dit en un mot. */
    nothing: 'Rien n’attend.',
  },

  /**
   * **Le panneau de garnison** : on y coche des troupes discrètes, jamais de compteurs +/− —
   * elles sont 24 au plus (brief « flux de mouvement en carte »).
   */
  garrison: {
    kicker: 'garnison',
    home: 'à domicile',
    projection: 'bâtiment de projection',
    troopCount: (count: number) => `${count} troupe${plural(count, '', 's')}`,
    empty: 'Aucune troupe ne stationne ici.',
    /** **Sur téléphone, les cartes ne s'indentent pas** : le passager dit sa coque en toutes
     *  lettres, ce que le retrait sous elle dit au bureau (`stackRows`). */
    aboard: (carrier: string) => `à bord · ${carrier}`,
    /** **L'en-tête d'un avant-poste** : le sol qu'il tient d'office (précision du 04/09) et son
     *  niveau, qui décide de sa portée comme de ses emplacements. Le mât dit déjà les deux, et
     *  le panneau qu'on vient d'ouvrir dessus ne doit pas en dire moins. Sans région nommée —
     *  un point d'avant le champ que le repli ne place pas — il reste le niveau. */
    outpostGround: (level: number, region: string | null) =>
      `${region === null ? '' : `${region} · `}niveau ${level}`,
    /** L'heure du lever, en clair : un chantier se lit sur une échéance, pas sur un décompte
     *  qu'il faudrait regarder tourner. */
    standsAt: (time: string) => `debout à ${time}`,
    /** **Le cachet dit l'état, cette ligne dit combien de temps encore.** Un tampon « désactivé »
     *  seul laissait le joueur sans la seule chose qu'il ait à décider ici : attendre ou non. */
    disabledFor: (hours: number, minutes: string) => `hors service — encore ${hours} h ${minutes}`,
    foundationHeld:
      'La garnison tient le chantier. Elle part entière ou elle tombe, il est perdu — rien n’est remboursé.',
    column: (count: number) => `pile : ${count} troupe${plural(count, '', 's')} · 1 slot`,
    /**
     * **Les places, dès qu'un transport est coché** (note « le transport terrestre et l'allure »).
     * Le joueur voyait « 2 troupes · 1 slot » et composait à l'aveugle : ni ce que ses transports
     * offrent, ni ce que sa pile demande. Un transport sans capacité n'affiche rien — le jour où
     * l'allure en donne une au camion, le compteur suit sans une ligne de plus.
     */
    seats: (needed: number, offered: number) =>
      `${needed} place${plural(needed, '', 's')} demandée${plural(needed, '', 's')} sur ${offered} offerte${plural(offered, '', 's')}`,
    lootCapacity: (capacity: number) => `capacité de butin : ${num(capacity)}`,
    /**
     * **L'allure se lit en composant, pas à l'arrivée de l'aperçu.** Le compteur de places dit
     * l'embarquement — traverser un milieu qui n'est pas le sien — et il ne dit rien du sol :
     * les places d'un camion sont une autre question, celle de qui roule et qui marche.
     *
     * Phrases entières plutôt que `colonne ${'${fr.aim.paces[…]}'}` : le mot de la visée qualifie un
     * trajet et s'accorde au masculin, celui-ci qualifie une colonne. Composer les deux écrivait
     * « colonne motorisé ».
     */
    paces: { motorized: 'colonne motorisée', foot: 'colonne à pied' } satisfies Record<
      LandPace,
      string
    >,
    noColumn: 'pile : aucune troupe cochée',
    /** La ligne au-dessus du bouton, sous le seuil (A7) : ce qui est coché, sans le slot — la
     *  feuille de visée le dit au moment où il se paie. */
    picked: (count: number) =>
      count === 0
        ? 'pile : aucune troupe cochée'
        : `pile : ${count} troupe${plural(count, '', 's')} cochée${plural(count, '', 's')}`,
    lootShort: (capacity: number) => `butin : ${num(capacity)}`,
    seatsShort: (needed: number, offered: number) => `places ${needed}/${offered}`,
    /** Les raccourcis de la composition sous le seuil (refonte mobile, 1e). */
    pickAll: 'tout',
    pickNone: 'aucune',
    pickRole: (role: string, count: number) => `${role} ×${count}`,
    prepare: 'préparer un mouvement',
    /** Founding is what a column does where it stands (ADR 0019 §1) — the terrain is under its
     *  feet when the specialisation is chosen, which is why the choice lives here. */
    found: 'fonder un avant-poste',
    foundSpecialization: 'spécialisation',
    foundHere: 'fonder ici',
    /**
     * **La spécialisation se règle sur le point, une fois planté** (décision du 29/08). Le serveur
     * exige un mot à la fondation : le clic droit pose « relais » et c'est ici qu'on en change,
     * tant qu'aucune passe ne l'a servi. Après quoi la phrase dit pourquoi les deux boutons ne
     * sont plus là — plutôt que de les montrer éteints.
     */
    specializationSealed:
      'Scellée : une passe s’en est déjà servie — un avant-poste ne change plus de métier.',
    // A garrison abroad has no barracks to leave from: the server only marches from a
    // projection building (ADR 0013), and saying so beats a refusal after the click.
    /** La seule adresse d'où rien ne part : le bâtiment qui logeait ces troupes n'est plus là,
     *  le jeu ne sait plus où elles se tiennent, donc il ne sait pas les router (ADR 0019 §1). */
    unplaceable: 'Ces troupes n’ont plus d’adresse sur la carte — rien ne peut partir d’ici.',
    /**
     * **Monter le point** (précision du 15/09 de l'ADR 0020 §10). La phrase dit ce qu'on achète —
     * un emplacement, un rayon — parce que c'est exactement ce que le refus « avant-poste plein »
     * promettait sans porte pour y aller.
     */
    raiseHeader: 'élévation',
    /** Le nom que la ligne de file porte : elle n'est dans aucune table de bâtiments. */
    raiseWork: 'élévation d’avant-poste',
    raiseAction: 'monter',
    raiseToLevel: (level: number) => `au niveau ${level}`,
    raiseTitle: (level: number) => `monter cet avant-poste au niveau ${level}`,
    raiseCarries: (slots: number, reachKm: number) =>
      `${slots} emplacement${plural(slots, '', 's')} · rayon ${num(reachKm)} km`,
    raiseAtMaximum: (maximum: number) => `Niveau maximal atteint (${num(maximum)}).`,
    raiseDisabled: 'Hors service : on ne monte pas un avant-poste sous le feu.',
    raiseQueued: 'Élévation déjà en file — elle se lit dans la fenêtre Économie.',
  },

  /**
   * **La feuille d'ordre, sous le seuil** (refonte mobile, 1c) : le type d'ordre s'y choisit, et
   * l'envoi s'y tient appuyé — rien d'irréversible en un toucher.
   */
  orderSheet: {
    kicker: 'ordre de mouvement',
    from: (count: number, origin: string) =>
      `${count} troupe${plural(count, '', 's')} depuis ${origin}`,
    duration: 'durée',
    arrival: 'arrivée',
    route: (leg: string, km: number, count: number, strength: number) =>
      `${leg} · ${num(km)} km · ${count} troupe${plural(count, '', 's')}, effectif ${num(strength)}`,
    hold: 'tenir pour envoyer',
    holding: 'maintenez…',
    holdNote: 'irréversible · 1 slot',
  },

  /** **L'ordre transmis** (refonte mobile, 1d) : la feuille s'est refermée, la boucle se dit. */
  sent: {
    stamp: 'transmis',
    title: (order: string, destination: string) => `${order} — ${destination}`,
    line: (time: string, used: number, total: number) =>
      `arrivée ${time} · mouvements ${used} / ${total}`,
    follow: 'suivre',
  },

  /**
   * **La dépêche d'un combat, ouverte depuis sa notification** (lot mobile-3, §6). Elle dit ce
   * que le journal dit déjà, en lignes — et ne nomme pas l'assaillant : le compte rendu ne le
   * nomme pas (ADR 0005).
   */
  dispatchSheet: {
    kicker: (time: string) => `dépêche · ${time}`,
    title: (attacking: boolean, intercepted: boolean, where: string) =>
      intercepted
        ? attacking
          ? `Interception — ${where}`
          : `Colonne interceptée — ${where}`
        : attacking
          ? `Engagement — ${where}`
          : `Attaque subie — ${where}`,
    engaged: 'engagées',
    engagedValue: (mine: number, theirs: number) => `${mine} contre ${theirs}`,
    losses: 'nos pertes',
    lossesValue: (lost: number, destroyed: number, routed: number) =>
      [
        `${lost} homme${plural(lost, '', 's')}`,
        destroyed > 0 ? `${destroyed} détruite${plural(destroyed, '', 's')}` : null,
        routed > 0 ? `${routed} en déroute` : null,
      ]
        .filter((piece): piece is string => piece !== null)
        .join(' · '),
    theirs: 'en face',
    theirsValue: (lost: number) =>
      `${lost} homme${plural(lost, '', 's')} perdu${plural(lost, '', 's')}`,
    pass: 'la passe',
    ground: 'le terrain',
    held: 'tenu',
    lost: 'perdu',
    outpost: 'avant-poste',
    outpostDisabled: 'désactivé',
    openGarrison: 'ouvrir la garnison',
    openJournal: 'voir le journal',
    later: 'plus tard',
  },

  /**
   * **Le rejeu d'un combat** (surface 4.7, ADR 0026 §7) : lancé depuis sa dépêche, une dizaine de
   * secondes, et un cartouche à la fin — chez nous par rôle, en face des totaux (ADR 0005).
   */
  replay: {
    play: 'rejouer',
    kicker: 'rejeu',
    steps: {
      voyage: 'en route vers le lieu',
      pose: 'mise en place',
      frappe: 'la frappe',
      riposte: 'la riposte',
      deroute: 'la déroute',
      'compte-rendu': 'compte rendu',
    } satisfies Record<ReplayStep, string>,
    pause: 'pause',
    resume: 'lecture',
    previous: 'étape précédente',
    next: 'étape suivante',
    leave: 'quitter',
    leaveQuestion: 'quitter le rejeu ?',
    leaveNote: 'la carte revient où elle était',
    stay: 'rester',
    held: 'terrain tenu',
    lost: 'terrain perdu',
    mine: 'chez nous',
    theirs: 'en face',
    columns: { troops: 'troupes', lost: 'pertes', routed: 'déroutées', destroyed: 'détruites' },
    /** Qui tire, accolé à « la frappe » et « la riposte » : l'étape se lit depuis son camp. */
    whose: (ours: boolean) => (ours ? 'la nôtre' : 'la leur'),
  },

  /** **Le combat qui arrive pendant qu'on regarde la carte** (ADR 0026 §7) : la phrase de la
   *  dépêche, « rejouer » (`fr.replay.play`) et « voir ». */
  combatToast: {
    show: 'voir',
    close: 'fermer',
  },

  /** La visée en carte : ce qui remplace la modale d’envoi. */
  aim: {
    /** A place has no name: the degrees are the name, to one decimal — the precision a click
     *  carries, past which the figure says more than the gesture did. */
    pointAt: (lon: number, lat: number) =>
      `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'O'}`,
    previewKicker: 'aperçu de trajet',
    slot: 'coûte 1 slot de mouvement',
    heading: (destination: string, type: string) => `${destination} — ${type}`,
    computing: 'calcul de la route…',
    noRoute: 'Aucune route terrestre vers cette destination.',
    duration: (duration: string, count: number) =>
      `durée ${duration} · ${count} troupe${plural(count, '', 's')}`,
    arrival: (time: string) => `arrivée ${time}`,
    /**
     * **Ce que les relais ont pris sur le trajet.** Une route plus courte que prévu sans rien à
     * l'écran pour l'expliquer se lit comme une panne, pas comme une récompense — et c'est
     * précisément ce qu'on a acheté en spécialisant l'avant-poste.
     */
    relayed: (duration: string) => `relais logistiques — ${duration} de moins`,
    restBite: (time: string) => `mord la fenêtre de repos — libre à ${time}`,
    /** Ce que l'expédition tient sur place avant de repartir : la seule durée du pillage que le
     *  joueur décide, et elle se dit avant qu'il paie le slot. */
    presence: (duration: string) => `présence sur site — ${duration}`,
    capture: (duration: string) => `capture — ${duration} à la force de la pile`,
    /** Une estimation depuis le relevé possédé, jamais un stock adverse : la caisse a pu bouger,
     *  et c'est le sujet. */
    estimatedLoot: 'butin estimé au relevé',
    /** L'initiative (B16), en tête du bloc qui dit ce que la cible rendra. */
    initiative: 'vous frappez en premier',
    /** Ce que la cible encaissera, selon ce qu'on vise : le seul avantage de la défense est un
     *  mur (C1), et il protège sans tirer. */
    cover: {
      sheltered: (taken: number) =>
        `En garnison : elle encaisse moins — ×${factor(taken)} de vos coups — et riposte avec ce qui lui reste.`,
      open: () => 'À découvert : elle encaisse tout, et riposte avec ce qui lui reste.',
      point: (taken: number) =>
        `La garnison riposte avec ce qui lui reste ; elle encaisse ×${factor(taken)} de vos coups si le point est debout et en service.`,
      either: (taken: number) =>
        `La cible riposte avec ce qui lui reste ; en garnison d’un bâtiment, elle encaisse ×${factor(taken)} de vos coups.`,
    } satisfies Record<'sheltered' | 'open' | 'point' | 'either', (taken: number) => string>,
    /**
     * **Le milieu du trajet, lu sur les tronçons** (fiche 04). Il se lit à côté de la durée
     * parce que c'est la même question : ce que le joueur s'apprête à payer. Le mot du code est
     * `medium` ; à l'écran on dit par où l'on passe.
     */
    mediums: {
      land: 'par terre',
      sea: 'par mer',
      air: 'par air',
      combined: 'terre et mer',
    } satisfies Record<RouteMedium, string>,
    /**
     * **L'allure, à côté du milieu.** Une colonne dont l'infanterie tient dans ses transports
     * roule (note « le transport terrestre et l'allure ») : c'est le seul effet du transport
     * terrestre, et la seule façon de le voir avant de payer.
     */
    paces: { motorized: 'motorisé', foot: 'à pied' } satisfies Record<LandPace, string>,
    /**
     * **This label promises nothing** (ADR 0019 §6). It does not say an adversary is there, and
     * above all it does not say recognised ground would be safe — a posted force is invisible
     * everywhere, at home included. It says one thing, and the note underneath repeats it so it
     * cannot be read the other way round: nothing of yours watches this ground.
     */
    unscouted: 'sol non reconnu',
    unscoutedNote:
      'rien à vous ne regarde ce sol. Un sol reconnu ne serait pas plus sûr : une troupe posée ne se voit pas.',
    submit: 'envoyer — irréversible',
    cancel: 'annuler',
  },

  /**
   * **L'abaque de tir** (ADR 0018 §4) — la table de chiffrage, enfin imprimée. Elle existait,
   * unique et testée, et le joueur recrutait sans l'avoir jamais vue.
   *
   * Le vocabulaire est celui d'un manuel de 1940 : une *pièce* tire, un *contre* est franc, une
   * *frappe* est faible. Jamais « DPS », jamais « ratio » — et jamais « tour de combat » : ce
   * que la case chiffre est une **passe de résolution** (`WWS/CONTEXT.md`).
   */
  gunnery: {
    header: 'abaque de tir',
    /** Le bouton qui l'ouvre, là où l'information sert : au recrutement, et sur la popin de
     *  troupe. Pas d'entrée de rail — il en a déjà trop (audit du 25/08 §3). */
    open: 'abaque de tir — qui bat qui',
    /** Le garde-fou du projet, imprimé : c'est ce que la table garantit, et c'est ce qu'un
     *  joueur doit lire avant de chercher l'arme absolue qui n'existe pas. */
    guarantee: 'Aucune arme ne bat tout, aucune n’est battue par tout.',
    lead: 'Part de l’effectif nominal du défenseur qu’une pièce à plein effectif détruit en une passe de résolution.',
    before: (garrisonDamageTaken: number, dryFactor: number) =>
      `L’attaquant frappe en premier, le défenseur riposte avec ce qui lui reste — au moins un abattu s’il touche ; une garnison n’encaisse que ×${factor(garrisonDamageTaken)} des coups. Un camp à court de munitions tire à ×${factor(dryFactor)}.`,
    firesOn: 'tire sur',
    piece: 'la pièce',
    /** Les trois transports ne sont pas des trous de la grille : ils sont des cibles, et le
     *  dire vaut mieux qu'une colonne muette qui a l'air d'une panne. */
    transports: (names: string) =>
      `${names} : victimes par conception — ils portent, ils ne combattent pas.`,
    outOfReach: '—',
    /** L'avion de transport se recrute et ne tire sur rien : sa ligne le dit, parce qu'une ligne
     *  absente et une ligne de onze tirets se liraient toutes deux comme une panne. */
    firesNothing: 'ne tire sur rien — il porte, il ne combat pas.',
    bands: {
      strong: 'fort contre',
      even: 'échange',
      weak: 'faible contre',
      none: 'hors de portée',
    } satisfies Record<'strong' | 'even' | 'weak' | 'none', string>,
    reading: 'lecture',
    /** Le pli est la seule chose que l'abaque ait jamais demandé d'apprendre : il faut le dire. */
    foldHint: 'pliez une ligne pour la fiche du rôle',
    /**
     * **Le pictogramme porte la valeur, la popin porte le nom** (68a, contrat 06 P2). Les trois
     * libellés de la fiche ne s'impriment plus : un lingot, une horloge, un cœur, et le nom de la
     * donnée ne revient qu'au survol — avec la phrase qui dit ce que le moteur en fait.
     *
     * La phrase de l'effectif est vérifiée contre `resolveEngagement` : la frappe vaut
     * `part × (effectif engagé / nominal) × modificateur × nominal de la cible`, donc une troupe
     * entamée tire bien au prorata de ce qui lui reste.
     */
    stats: {
      alloy: {
        name: 'coût — alliage',
        note: 'Ce que la troupe coûte à former, prélevé au lancement du lot.',
      },
      training: {
        name: 'formation',
        note: 'Le temps que la chaîne met à la livrer, à la vitesse de votre quartier général.',
      },
      strength: {
        name: 'effectif nominal',
        note: 'L’effectif est la vie : la part de l’abaque se prend sur lui, et une troupe à 32 / 50 tire à 32 / 50.',
      },
      range: {
        name: 'portée de détection',
        note: 'La pile conserve la meilleure portée de ses troupes. Voir une force ne suffit pas à ouvrir le feu.',
      },
    } satisfies Record<'alloy' | 'training' | 'strength' | 'range', { name: string; note: string }>,
    /** **La ligne dit son métier** (décisions 4a et 3a du 16/09) : un chiffre nu à côté d'un œil
     *  se lisait comme une allonge, et c'est justement la confusion que le second cercle de la
     *  carte lève. */
    detectionRange: (km: number) => `détection ${num(km)} km`,
    /** **Une seule fois, en tête, jamais par rôle** : le contact est une constante du jeu et non
     *  une qualité de la pièce — le mettre sur chaque fiche en ferait une statistique de rôle. */
    contactRange: (km: number) =>
      `Portée de contact : ${num(km)} km — ce qu’un ordre trouve debout là où il arrive, quel que soit le rôle.`,
    nominalLootCapacity: (capacity: number) => `capacité nominale de butin : ${num(capacity)}`,
    /** ADR 0025 : ce qu'un transport emporte, ce qu'une troupe terrestre occupe — en places. */
    liftCapacity: (places: number) => `emporte ${places} places de troupes`,
    liftCost: (places: number) => `occupe ${places} place${plural(places, '', 's')} à bord`,
    movementRule: ({ mode, pace, costs }: MovementSheet) => {
      const route = {
        land: 'par terre',
        naval: 'par mer',
        air: 'par air',
        combined: 'terre et mer',
      }[mode];
      const parts = [route];
      if (pace !== undefined) parts.push(fr.aim.paces[pace]);
      const indices = [costs.land, costs.sea]
        .filter((cost): cost is number => cost !== undefined)
        .map((cost) => String(cost).replace('.', ','));
      if (indices.length > 0) parts.push(`indice ${indices.join(' / ')}`);
      return parts.join(' · ');
    },
    share: (value: number) => value.toFixed(2).replace('.', ','),
    shot: (attacker: string, defender: string, share: string) =>
      `${attacker} sur ${defender} — ${share} de l’effectif nominal par passe`,
    noShot: (attacker: string, defender: string) => `${attacker} n’atteint pas ${defender}`,
  },

  production: {
    header: 'production',
    opening: 'Ouverture du site…',
    domains: { land: 'terre', air: 'air', sea: 'mer' },
    queueHeader: 'files de production',
    /**
     * **La feuille d'un site sur téléphone** (refonte mobile, 2a à 2c) : un seul gabarit pour la
     * caserne, le port et l'aérodrome — former, la file, la garnison en onglets, le plafond collé
     * sous eux. Ce qui n'est pas encore ouvert descend sous « plus haut » avec sa condition.
     */
    sheet: {
      tabs: { form: 'former', queue: 'file', garrison: 'garnison' },
      capLine: (inService: number, queued: number) => `${inService} en service · ${queued} en file`,
      capFree: (free: number, cap: number) =>
        `${free} place${plural(free, '', 's')} libre${plural(free, '', 's')} sur ${cap}`,
      capFull: (cap: number) => `plafond atteint — ${cap} sur ${cap}`,
      siteKicker: (level: number) => `le site · niveau ${level}`,
      opens: (level: number, roles: string) => `Le niveau ${level} ouvre ${roles}`,
      waits: (role: string, level: number) => `${role} attend le niveau ${level}`,
      and: ' et ',
      formHeader: 'former ici',
      formNote: 'un toucher, une troupe',
      lockedHeader: 'Plus haut',
      lockedNote: 'le site doit monter',
      bill: (alloy: number, duration: string) => `${alloy} all. · ${duration}`,
      /** La raison à la place du bouton, jamais un bouton grisé (ADR 0015). */
      capReached: (cap: number) =>
        `Plafond atteint — ${cap} troupes sur ${cap}. Montez les baraquements.`,
      queueFull: (max: number) => `File pleine — ${max} lots sur ${max}.`,
      alloyShort: (missing: number) => `Il manque ${missing} alliage.`,
      running: 'en chaîne',
      remaining: 'restant',
      deliveredAround: (time: string) => `livrée vers ${time}`,
      waitingHeader: 'en attente',
      waitingNote: 'payé d’avance · remboursé si annulé',
      rank: (rank: number) => `${rank}ᵉ`,
      queueEmptyTitle: 'Aucune troupe en chaîne.',
      queueEmptyNote:
        'La première troupe enfilée commence aussitôt ; les suivantes attendent leur tour et restent remboursables.',
      queueNote: (aSecond: string) =>
        `Les files continuent pendant la plage de repos, comme les chantiers. Chaque bâtiment tient sa propre file : ${aSecond} forme en parallèle.`,
      garrisonEmpty: {
        land: 'Personne au quartier.',
        sea: 'Rien n’est à quai.',
        air: 'Rien n’est au parc.',
      },
      garrisonEmptyNote: 'Ce que le site forme s’y tient jusqu’au premier mouvement.',
      /** Une troupe en tête de file a commencé : le cartouche le dit, sans offrir un « annuler »
       *  qui mentirait. */
      toastRunning: (name: string, time: string) => `${name} — en chaîne · vers ${time}`,
      toastQueued: (name: string, rank: number, time: string) =>
        `${name} — ${rank}ᵉ en file · vers ${time}`,
      toastRunningNote: 'commencée aussitôt : une troupe commencée ne s’annule plus',
      toastQueuedNote: 'payé d’avance — remboursé intégralement si annulé',
    },
    /** La modale ne parle que d'un site : le nom du bâtiment, sa région et son niveau sont son
     *  kicker, et le bandeau de garnison compte ce qui s'y tient. */
    siteLevel: (level: number) => `niveau ${level}`,
    queueOf: (region: string, count: number, max: number) =>
      `${region} — ${count} lot${plural(count, '', 's')} en file sur ${max}`,
    /** La seconde phrase envoyait vers le sélecteur de site, mort avec l'onglet (59a) : dans une
     *  modale de site il n'y a plus qu'un site, et les rôles sont juste au-dessus. */
    queueEmpty: 'Aucune troupe en chaîne. Enfilez un rôle ci-dessus.',
    atWaking: 'au réveil',
    wakingNote:
      'Les files continuent pendant la plage de repos, comme les chantiers. Chaque bâtiment tient sa propre file : une seconde caserne forme en parallèle. Une troupe déjà commencée ne s’annule plus ; les suivantes sont remboursées intégralement.',
    /**
     * The ceiling as three readings of one number, not one sentence: the figures are set apart
     * so the strip of pips beside them can be read as the same count drawn — filled for what
     * stands, half for what is queued, empty for what is left.
     */
    inService: 'en service',
    inQueue: 'en file',
    capOf: (cap: number) => `plafond ${cap} troupes`,
    /** The two halves of a card's ledger. Kept as eyebrows, never as sentences. */
    costLabel: 'coût',
    trainingLabel: 'formation',
    troopCapNote:
      'Les hommes ne sont pas une ressource : une troupe coûte des matières, et l’armée est bornée en nombre de troupes par les baraquements. La file compte dans le plafond.',
    perTroop: '/ troupe',
    strongAgainst: 'fort contre',
    weakAgainst: 'faible contre',
    supportNote: 'Ne combat pas, mais peut se faire détruire ou intercepter.',
    tier2Locked: (level: number) => `quartier général niveau ${level} requis`,
    /** The tank waits for the level that arms its counter — said before the click, not after. */
    roleLocked: (level: number) => `verrouillé — quartier général niveau ${level} requis`,
    /** **La condition en toutes lettres, et la même dans les deux cadres** (contrats 03 et 06) :
     *  l'abaque la dit sans rien posséder, la modale de site la dit sur la carte qu'elle laisse
     *  affichée. Le niveau ne s'imprime qu'à partir de 2 — « de niveau 1 » se lirait comme une
     *  condition alors que c'est le bâtiment nu (67b). */
    formsIn: (building: string, level: number) =>
      level > 1 ? `se forme dans ${building} de niveau ${level}` : `se forme dans ${building}`,
    tierLabel: (tier: number) => `palier ${tier}`,
    enqueueTitle: (role: string, tier: string, site: string) => `enfiler ${role} ${tier} — ${site}`,
    enqueue: '+ 1 troupe',
    inChain: 'en chaîne',
    pending: 'en attente',
    cancelStarted: 'une troupe commencée ne s’annule plus',
    cancelRefund: 'annuler et rembourser',
    cancel: 'annuler',
  },

  /**
   * **« Chantiers », la fenêtre Économie du téléphone** (refonte mobile, 1f et 1g) : un seul
   * défilement, l'en-tête collé, quatre onglets qui y mènent. Les phrases de l'Économie y sont
   * reprises telles quelles ; celles-ci n'existent que parce que la ligne d'un site y porte son
   * bouton et sa facture.
   */
  works: {
    header: 'chantiers',
    tabs: { underway: 'en cours', sites: 'sites', chains: 'filière', hq: 'QG' },
    remaining: 'restant',
    raising: (region: string, from: number, to: number) => `en ${region} · niveau ${from} → ${to}`,
    queueNote: 'payé d’avance · remboursé si annulé',
    sitesHeader: 'les sites',
    sitesNote: 'un toucher met en file',
    families: {
      extraction: 'extraction',
      transformation: 'transformation',
      projection: 'projection',
      command: 'commandement',
    },
    raise: (level: number, duration: string) => `▲ niv ${level} · ${duration}`,
    raiseTitle: (name: string, level: number) =>
      `mettre ${lowerFirst(name)} en file pour le niveau ${level}`,
    cost: (amount: number, abbreviation: string) => `${num(amount)} ${abbreviation}.`,
    underway: (time: string) => `en chantier · ${time}`,
    queued: (rank: number) => `en file · ${rank}ᵉ`,
    lacking: (amount: number, resource: string) => `il manque ${num(amount)} ${resource}`,
    queuedToast: (name: string, region: string, rank: number) =>
      `${name} en ${region} — ${rank}ᵉ en file`,
    startedToast: (name: string, region: string) => `${name} en ${region} — chantier en cours`,
    toastNote: 'payé d’avance — remboursé intégralement si annulé',
    chainsLead:
      'Une ligne par ressource : son débit réel, son état, et ce qui manque. Les réserves restent au bandeau.',
    deposits: (count: number) => `gisement${plural(count, '', 's')} ×${count}`,
    linkLevel: (building: string, level: number) => `${building} · ${level}`,
    lot: (made: number, ordered: number) => `lot ${made} / ${ordered}`,
    /** L'heure du chantier remonte à l'en-tête une fois sa carte passée. */
    headCountdown: (building: string, time: string) => `${lowerFirst(building)} · ${time}`,
    hqWhere: (region: string) => `quartier général · ${region}`,
  },

  upgrade: {
    action: 'améliorer',
    title: (name: string, level: number) => `passer ${name} au niveau ${level}`,
    toLevel: (level: number) => `→ niveau ${level}`,
    /**
     * A refusal that names its cause beats a refusal that counts (brief §5). "Il faut 72 de
     * charbon (0 disponibles)" is a wall; "disponible dans 4 h 20" is a plan, and when nothing
     * produces the matter at all, the only useful sentence names the building to raise.
     */
    availableIn: (time: string) => `disponible dans ${time}`,
    never: (none: string) => `jamais : ${none}`,
    neverOnDeposit: (none: string, deposit: string) => `jamais : ${none} de ${deposit}`,
    neverNote: (a: string) => `bâtissez ${a}, rien d’autre ne débloque cette amélioration`,
    /** Une seule entrée par région, en cours ou en file — le refus que le serveur oppose. */
    alreadyQueued: 'un chantier vise déjà cette région — annulez-le ou attendez son tour',
  },

  economy: {
    header: 'économie',
    lead: 'Tout ce qui se pose et tout ce qui coule. Aucun stock chiffré ici : les réserves sont au panneau haut-droit — cette fenêtre dit quelle entrée manque, jamais combien il en reste.',
    subtitle: (nation: string, season: number) => `${nation} — saison ${season}`,

    /**
     * **Le chantier, en tête et une seule fois.** La phrase se répétait sur chaque ligne
     * d'élévation : répétée quatre fois, l'information la plus importante de la fenêtre était
     * devenue du bruit de fond (`ordre-de-mobilisation-et-fenetre-economie.md` §2).
     */
    constructionHeader: 'chantier en cours',
    constructionNone:
      'Aucun chantier. La file est illimitée et se paie à la mise en file — un seul chantier avance à la fois.',
    constructionRemaining: (time: string) => `${time} restant`,

    /**
     * **La file, sous la tête et sobrement.** Aucun temps restant sur une ligne en attente : rien
     * derrière la tête n'est daté en base, précisément pour qu'une annulation ne redate rien
     * (`convex/constructions.ts`). Le rang est ce qui est vrai, un compte à rebours serait inventé.
     */
    queueHeader: (count: number) => `en file — ${count} chantier${plural(count, '', 's')}`,
    queueRank: (rank: number) => `${rank}ᵉ`,
    queueLevel: (level: number) => `niveau ${level}`,
    queueCancel: 'annuler',
    queueCancelTitle: 'annuler et rembourser intégralement',
    queuePaid: 'payé d’avance',

    /**
     * **La filière, dessinée.** Un maillon bâti porte son débit réel, un maillon en chantier son
     * temps restant, un maillon manquant sa condition en clair. « Rien de caché ne se débloque,
     * rien d'affiché sans sa condition » — la règle qui remplace le grisé (ADR 0015, révision du
     * 24/08/2026).
     */
    chartHeader: 'la filière',
    legendBuilt: 'bâti',
    legendUnderway: 'en chantier',
    legendQueued: 'en file',
    legendMissing: 'manquant',
    roleDeposit: 'gisement',
    roleDepositNone: 'gisement — aucun',
    roleUpstream: 'entrée',
    roleExtraction: 'extracteur',
    roleConversion: 'conversion',
    roleConversionMissing: 'conversion — manquante',
    roleConversionUnderway: 'conversion — en chantier',
    roleConversionQueued: 'conversion — en file',
    roleOutput: 'sortie',
    /** L'intitulé de la tête de colonne : le seul chiffre que la filière promet (P1). */
    realRate: 'débit réel',
    depositHeld: (count: number) =>
      `${count} gisement${plural(count, '', 's')} sur votre territoire`,
    depositNoneHeld: (deposit: string) =>
      `aucun gisement de ${deposit} — ce qui manque se prend ailleurs`,
    fromChain: (building: string) => `de ${lowerFirst(building)}`,

    /** La condition d'un maillon manquant — jamais un texte en dur : elle sort de la règle de
     *  placement que le serveur refuse avec (`placementOf`). */
    condition: {
      foundation: 'pose de fondation offerte',
      locked: (level: number) => `demande un quartier général niveau ${level}`,
      deposit: (deposits: ReadonlyArray<string>) =>
        `demande une région à gisement de ${deposits.join(' ou ')}`,
      coastal: 'demande une région côtière tenue — aucune pour l’instant',
      siteFull:
        'plus un emplacement libre sur vos sites — élevez le quartier général ou un avant-poste',
      regionsTaken: 'toutes vos régions portent déjà un bâtiment',
      free: (count: number) =>
        `${count} région${plural(count, '', 's')} l’accepte${plural(count, '', 'nt')} — clic droit sur la carte`,
    },

    /** **La ligne que la colonne du QG gardait en réserve** (ADR 0020 §6). Zéro, elle n'est pas
     *  là : un « 0 site hors réseau » permanent est du bruit de fond, et c'est la faute que le
     *  chantier en tête a déjà coûtée une fois. */
    unlinkedSites: (count: number) =>
      `${count} site${plural(count, '', 's')} hors réseau — la région ne porte plus vos couleurs`,

    sitesHeader: 'les sites de la filière',
    /** Les clés que rien ne porte, regroupées : une condition par ligne, jamais un vide
     *  intercalé entre deux bâtisses debout. */
    absentKeys: 'clés absentes',
    /** La projection, en bas : la section de ce qui arme. Deux sections, pas trois onglets. */
    projectionHeader: 'la projection — ce qui arme',
    worksHeader: 'commandement et ouvrages',
    built: 'bâti',
    builtIn: (region: string) => `bâti · ${region}`,

    chainStates: {
      off: 'éteinte',
      /** **Un site coupé n'est pas à sec, il est coupé** (ADR 0020 §6) : le premier envoie
       *  reprendre une frontière, le second envoie creuser une mine. Le tampon passe donc avant
       *  « à sec » et avant « tourne » — c'est l'ordre de lecture de la filière. */
      unlinked: 'hors réseau',
      idle: 'en attente d’ordre',
      running: 'tourne',
      starved: 'à sec',
      overflowing: 'débordée',
    } satisfies Record<ChainState, string>,
    starvedOn: (resource: string) => `à sec — ${resource}`,

    /** The lot, in its four readings: awaiting an order, being sized, running, delivered. */
    lot: {
      awaiting: 'en attente d’ordre',
      awaitingNote: 'rien n’est consommé',
      nothingOrdered: 'aucune commande en cours',
      keepsAvailable: (resource: string) =>
        `${startsWithVowel(resource) ? 'L’' : 'Le '}${resource} reste disponible pour les bâtiments et les troupes.`,
      commandsItself: 'se commande',
      order: 'commander un lot',
      launch: 'lancer le lot',
      cancel: 'annuler le lot',
      close: 'refermer',
      quantity: (output: string) => output,
      maxOf: (maximum: number, resource: string) => `max ${maximum} — le stock d’${resource}`,
      inReserve: (quantity: number, resource: string) => `${quantity} ${resource} en réserve`,
      costs: 'coûte',
      costOf: (quantity: number, resource: string) => `${quantity} ${resource}`,
      duration: 'durée',
      ends: 'fin',
      coversNight: 'couvre la nuit',
      coversYes: 'oui, et au-delà',
      coversNo: (hours: string) => `non — ${hours} seulement`,
      coversNone: 'aucun lot',
      once: 'Une fois, exactement cette quantité. La chaîne s’arrête ensuite.',
      impossible: (resource: string) => `lot impossible : aucun ${resource} en réserve`,
      bottleneck: (a: string, resource: string) =>
        `Le goulot nommé : bâtissez ${a}, elle seule fait de l’${resource}.`,
      progress: (made: number, ordered: number, output: string) =>
        `${made} sur ${ordered} ${output}`,
      remaining: (time: string) => `reste ${time}`,
      remainingUnknown: 'à l’arrêt — la chaîne ne produit rien',
      endsAt: (time: string) => `fin ${time}`,
      cancelNote:
        'L’annulation ne rembourse rien parce que rien n’a été pris d’avance : la matière est consommée au fil des heures. Ce qui n’est pas converti reste en réserve.',
      delivered: (quantity: number, output: string) => `${quantity} ${output} livrées`,
      done: 'lot terminé',
      doneNote: (building: string, resource: string) =>
        `${building} se tait et rend l’${resource} au reste de la nation.`,
    },

    /**
     * **L'entretien se lit à côté de ce qu'il mange.** Le débit de nourriture du bandeau est
     * déjà net : cette section n'ajoute aucun chiffre, elle décompose celui-là.
     */
    upkeepTroops: (count: number) => `${count} troupe${plural(count, '', 's')} en service`,
    upkeepDrain: (perHour: number) => `− ${tenths(perHour)} nourriture / h`,
    upkeepUnsupplied: (count: number, factor: number) =>
      `dont ${count} hors ravitaillement — entretien ×${factor}`,
    upkeepAllSupplied: 'toutes ravitaillées — sol national ou rayon d’un avant-poste',
    upkeepBalance: (net: number) =>
      `solde ${net >= 0 ? '+' : '−'} ${tenths(Math.abs(net))} nourriture / h`,
    upkeepStarving:
      'À sec : les files de recrutement sont à l’arrêt. Rien n’est perdu, aucune troupe ne meurt — elles repartent dès que la nourriture revient.',

    listeningUnfigured: 'rayon de révélation non chiffré — l’espionnage n’est pas écrit',
    listeningTemporary:
      'La station d’écoute est ici en attendant la fenêtre Espionnage : un jalon inerte serait pire.',

    level: (level: number) => `niveau ${level}`,
    // The real rate is a settled quantity, not a table entry: it arrives with a tail of
    // floating point behind it, and "2.9999999 / h" is not a figure anyone reads.
    perHour: (rate: number) => `${tenths(rate)} / h`,

    /** Le goulot central du jeu (ADR 0015), lu là où l'on décide quoi poser ensuite — **sur le
     *  site**, jamais sur la nation (ADR 0020 §10). */
    budgetTaken: (taken: number, total: number) =>
      `${taken} emplacement${plural(taken, '', 's')} sur ${total}`,
    /**
     * **Le site plein dit son remède, à l'endroit où le joueur décide quoi poser.** L'ordre de
     * mobilisation dit quoi poser gratuitement ; celle-ci dit quand monter le QG — même règle
     * que le refus ci-dessus, mêmes nombres, et rien de neuf à apprendre.
     */
    budgetRelief: (relief: { nextHqLevel: number; nextSlots: number }) =>
      `un QG niveau ${relief.nextHqLevel} les porte à ${relief.nextSlots}`,
    budgetAtCeiling: 'quartier général au maximum — le sol national ne s’élargira plus',
    budgetFree: (free: number) =>
      free <= 0
        ? 'plus un emplacement libre'
        : free === 1
          ? '1 emplacement libre'
          : `${free} emplacements libres`,
    budgetHome: 'sol national',
    budgetOutpost: (rank: number, level: number) => `avant-poste ${rank} · niveau ${level}`,
    budgetRaiseOutpost: 'améliorez l’avant-poste pour en ouvrir un de plus',
    hqCarriesHeader: 'ce qu’il porte',
    hqLevelLine: (level: number, maximum: number) => `niveau ${level} sur ${maximum}`,
    hqMissing: 'Aucun quartier général debout — rien d’autre ne peut se bâtir.',
    hqSlots: (total: number) => `${total} slots de mouvement`,
    hqPlacements: (total: number) =>
      `${total} emplacement${plural(total, '', 's')} sur le sol national`,
    hqChainSpeed: (speed: string) => `chaînes de production ×${speed}`,
    hqTier2: 'palier 2 ouvert en production',
    hqTier2Locked: (level: number) => `palier 2 en production au niveau ${level}`,
    cappedByHq: 'plafonné par le QG',
    nothingBuilt:
      'Rien de bâti. On pose une bâtisse sur la carte : clic droit sur une région à soi, au zoom rapproché.',
    inRegion: (region: string) => `en ${region}`,
  },

  /**
   * **La fondation** — la dette du format, rendue visible. Le jeu répond toujours à « et
   * maintenant ? » sans tutoriel : la ligne se retire d'elle-même quand la fondation est
   * soldée, et ne revient jamais. Son en-tête est passé à `nextActions`, qui la porte
   * désormais ; ce qui reste ici est ce qu'on lit **dans** le dépli.
   */
  mobilization: {
    pick: 'Choisissez une clé, puis sa région.',
    eligible: (count: number) =>
      `${count} région${plural(count, '', 's')} éligible${plural(count, '', 's')}`,
    noneEligible: 'aucune région éligible',
    chooseRegion: (condition: string) => `Choisissez la région — ${condition}`,
    highlighted: 'Cliquez l’une des régions surlignées sur le plateau.',
    zoomIn: 'Rapprochez-vous : les régions n’apparaissent qu’au zoom rapproché.',
    cancel: 'annuler la sélection de clé',
    /** **Une dette de socle est un couple** : deux mines dues se liraient sinon comme deux fois
     *  la même ligne, alors que l'une ne s'acquitte que sur du fer et l'autre que sur du
     *  charbon. */
    onDeposit: (building: string, deposit: string) => `${building} — ${deposit}`,
    /** **La dette que le sol ne nomme pas** : le quartier général (décision 1b du 13/09). La
     *  ligne dit l'absence de condition plutôt qu'un gisement vide — c'est la liberté qui est
     *  l'information, puisqu'une bâtisse par région fait du sol qu'il prend un sol perdu. */
    anywhereAtHome: (building: string) => `${building} — à poser sur votre sol`,
    /** Ce que la clé demande à une région — dit avant même qu'elle soit choisie, jamais après
     *  coup : rien d'affiché sans sa condition. */
    wants: {
      deposit: (deposits: ReadonlyArray<string>) => `gisement de ${deposits.join(' ou ')} requis`,
      coastal: 'région côtière requise',
      any: 'toute région tenue',
      home: 'n’importe où sur votre sol',
    },
  },

  /**
   * What a troop's strength is counted in — its hit points are read in men and machines
   * (ADR 0014), never in a percentage.
   */
  strengthUnits: {
    infantry: 'soldats',
    armor: 'chars',
    landTransport: 'camions',
    fighter: 'appareils',
    bomber: 'appareils',
    airTransport: 'appareils',
    escort: 'navires',
    cargo: 'navires',
    carrier: 'appareils embarqués',
  } satisfies Record<UnitRole, string>,

  /**
   * **Ce que Nation est devenue : une fiche de lecture.** Le recensement, le budget
   * d'emplacements et le quartier général sont partis dans Économie — le playtest a montré
   * trois fenêtres ouvertes en cascade pour suivre une seule pose, et le recensement sert une
   * décision qui se prend là-bas (`ordre-de-mobilisation-et-fenetre-economie.md` §2). Elle ne
   * gère plus rien ; elle se lit, et elle ne porte aucun bouton.
   */
  nationSheet: {
    kicker: 'fiche de nation',
    readOnly:
      'Fiche de lecture — rien ne s’y commande. Ce qui se pose et ce qui coule est dans Économie.',
    powerHeader: 'pouvoir national',
    /**
     * The counterpart of the power, and it belongs beside it: the ADR 0015 gap is a design
     * decision, not an accident of the map, and today a player only discovers it by searching
     * his own ground in vain for a season.
     */
    gapHeader: 'manque national',
    gapNone: 'Aucun manque : les cinq gisements sont chez soi.',
    gap: (deposits: ReadonlyArray<string>) =>
      `Aucun gisement de ${andList(deposits)} sur son sol. Ce qui manque se prend ailleurs.`,
    armyHeader: 'armée',
    present: 'présente',
    inTransit: 'en transit',
    /**
     * **La liste des troupes a atterri ici** avec la mort du widget (décision Pierre, 30/08) :
     * la fiche disait déjà ce que l'armée pèse, il lui manquait de dire où elle est. Cliquer une
     * ligne recentre la carte — la fiche ne commande toujours rien, elle désigne.
     */
    standingHeader: 'où elle se tient',
    standingNone: 'Aucune troupe posée : tout est en route ou rien n’est formé.',
    locate: (station: string) => `recentrer la carte sur ${station}`,
    restHeader: 'plage de repos déclarée',
    restNote:
      'Publique : vos adversaires la voient. Un mouvement qui arriverait pendant est immobilisé à la frontière jusqu’à sa fin.',
    restFrozen: 'Scellée au lancement — elle se déclarait au salon.',
    /**
     * **Une ligne, et seulement près du seuil** (`convex/constants.ts`,
     * `FOUNDER_ABSENCE_NOTICE_HOURS`). Elle ne nomme personne et ne dit aucune heure de
     * connexion : une durée d'absence et l'heure d'ouverture de la porte, parce que c'est une
     * règle publique et pas un relevé de présence.
     */
    founderHeader: 'commandement',
    founderAbsent: (since: string, at: string) =>
      `Le fondateur est absent depuis ${since} — la saison pourra être close par le doyen des belligérants à partir du ${at}.`,
    founderAbsentOpen: (since: string) =>
      `Le fondateur est absent depuis ${since} — la saison peut être close par le doyen des belligérants.`,
  },

  /**
   * **Le télégraphe, et pas « chat » ni « dépêches »** : le second mot appartient au journal, et
   * deux vocabulaires pour deux fils qu'on lit à trente centimètres l'un de l'autre est une
   * collision qu'on ne rattrape plus (`WWS/CONTEXT.md`).
   */
  telegraph: {
    header: 'télégraphe',
    channel: 'canal général',
    general: 'Général',
    privateChannel: (nickname: string) => `conversation privée avec ${nickname}`,
    empty: 'La ligne est muette — personne n’a encore télégraphié.',
    placeholder: 'télégraphier…',
    send: 'envoyer',
    /** Le décompte ne paraît qu'à l'approche de la borne : un compteur permanent transforme une
     *  conversation en formulaire. */
    remaining: (left: number) => `${left} caractère${plural(left, '', 's')}`,
    you: 'vous',
    today: 'aujourd’hui',
    yesterday: 'hier',
  },

  settingsWindow: {
    header: 'réglages',
    scaleLabel: 'Échelle de l’interface',
    scaleNote: (min: number, max: number) =>
      `De ${min} à ${max} %, appliqué immédiatement. Réglage propre à ce navigateur.`,
    reset: 'défaut',
    briefingLabel: 'Aide-mémoire du commandement',
    briefingNote: 'La feuille d’entrée en campagne — les commandes, le terrain, vos bureaux.',
    briefingReopen: 'relire',
    /** Quitter le plateau n'est ni se déconnecter ni rendre sa place : la note le dit, sans
     *  quoi le bouton se lirait comme un abandon à côté de « déposer les armes ». */
    homeLabel: 'Vos parties',
    homeNote: 'Quitter le plateau sans quitter la partie — elle vous attend à l’accueil.',
    home: 'retour à l’accueil',
    /**
     * **Quel bouton fait quoi est une préférence de joueur**, pas une règle du jeu (retour de la
     * partie du 11/09). La grammaire, elle, ne se règle pas : un bouton oriente, un bouton
     * déplace, un bouton agit — et la note le dit, sinon le bloc se lirait comme une permission
     * d'en désarmer un.
     */
    mouseLabel: 'La souris',
    mouseNote:
      'Trois métiers, trois boutons. Choisir un métier l’échange avec le bouton qui l’avait ; le clic gauche net sélectionne toujours, et espace + clic gauche déplace toujours.',
    mousePreset: { classic: 'classique', wheelActs: 'molette agit' },
    fingerLabel: 'Le doigt',
    fingerNote: 'Le doigt ne se règle pas. Une souris branchée garde son propre réglage.',
    motionLabel: 'Animations de la carte',
    motion: { auto: 'auto', full: 'actives', reduced: 'réduites', off: 'coupées' },
    motionNote:
      'Auto suit le réglage du système. Coupées, les fils ne coulent plus et la carte se redessine au plus juste : le mode batterie.',
    dayCycleLabel: 'Cycle jour et nuit',
    dayCycle: { real: 'réel', hour: 'accéléré — une heure' },
    dayCycleNote:
      'Réel : la nuit suit le vrai soleil. Accéléré : une journée entière en soixante minutes, pour juger la lumière sans attendre.',
    cameraLensLabel: 'Objectif de la caméra',
    cameraLens: { game: 'jeu', poc: 'prototype' },
    cameraLensNote:
      'Essai : le téléobjectif de 28° et les couleurs du prototype. La carte cadre la même chose, la perspective s’aplatit.',
    pieceScaleLabel: 'Taille des pièces',
    pieceScaleNote:
      'Au rapproché seulement : les planches du lointain ne bougent pas. Se règle en direct.',
    pieceScaleTroops: 'Troupes',
    pieceScaleBuildings: 'Bâtiments',
    pieceScalePercent: (value: number) => `${value} %`,
    soundLabel: 'Son du télégraphe',
    soundNote:
      'Un tic-tac bref à l’arrivée d’un message des autres. Muet quand l’onglet est masqué.',
    soundState: (on: boolean) => (on ? 'activé' : 'coupé'),
    /** **Le seul pouvoir de fondateur du plateau.** Une saison sans horloge n'a pas d'autre fin,
     *  et la note dit ce qui reste après — sinon « clore » se lit comme « supprimer ». Il passe
     *  au doyen quand le fondateur ne revient plus (`seasons.conclude`), sans que le titre
     *  bouge : le bouton apparaît, il n'est jamais grisé (ADR 0015). */
    concludeLabel: 'Clore la saison',
    concludeNote:
      'La saison passe en lecture : plus aucun ordre, le plateau et le journal restent lisibles.',
    conclude: 'clore la saison',
    concludeConfirm: 'confirmer — plus aucun ordre',
    concludeWarning:
      'la saison s’arrête pour tous les joueurs, sans vainqueur désigné. Il n’y a pas de retour.',
    /** **La capitulation, rangée à côté de la clôture** : même famille de geste, même double
     *  clic. La note dit ce qui survit, parce que « défaite » se lit comme « disparition » et
     *  que ce n'en est pas une — les positions tiennent, elles ne bougent plus. */
    surrenderLabel: 'Déposer les armes',
    surrenderNote:
      'Vous cessez de commander et vous observez la saison. Vos positions tiennent et se défendent, vos avant-postes gardent votre encre, et le télégraphe vous reste ouvert.',
    surrender: 'déposer les armes',
    surrenderConfirm: 'confirmer — plus aucun ordre',
    surrenderWarning:
      'irréversible. Si vous avez fondé la partie, le commandement passe au plus ancien joueur encore debout.',
    /** L'état, une fois le geste fait : le bouton a disparu, il ne reste qu'à le constater. */
    surrendered: 'Armes déposées — vous observez cette saison.',
    /**
     * **Les alarmes sortent de l'écran** (notif-1a, notif-6). Deux niveaux : la case de **cet
     * appareil** (l'abonnement), puis une case par genre, valable pour le **compte**. Chaque
     * cas où la case ne peut pas s'activer a sa phrase — jamais une case morte (ADR 0015).
     */
    notifications: {
      header: 'Notifications',
      deviceLabel: 'Recevoir les notifications sur cet appareil',
      deviceNote:
        'Les alarmes de la saison, sur ce téléphone ou cet ordinateur. Rien ne sonne pendant votre fenêtre de repos.',
      unsupported: 'Ce navigateur ne sait pas recevoir de notifications.',
      needsInstall:
        'Sur iPhone, ajoutez d’abord La Manchette à l’écran d’accueil, puis ouvrez-la depuis l’icône.',
      denied:
        'Les notifications sont bloquées pour ce site : rétablissez-les dans les réglages du navigateur.',
      unconfigured: 'Le serveur n’a pas encore de quoi envoyer des notifications.',
      failed: 'L’opération a échoué. Réessayez dans un instant.',
      typesLabel: 'Ce qui sonne',
      typesNote: 'Valable pour tous vos appareils, même celui-ci tant qu’il n’est pas abonné.',
      types: {
        attack: 'Attaque subie',
        outpost: 'Avant-poste désactivé ou détruit',
        sighting: 'Colonne relevée sur votre territoire',
        dryFire: 'Tir à sec',
        season: 'La saison (lancement et fin)',
        telegraph: 'Télégraphe',
      },
      typeNotes: { telegraph: 'Une fois par heure au plus.' },
      test: 'envoyer une dépêche d’essai',
      testNote: 'Une dépêche part vers vos appareils abonnés : c’est la preuve que tout marche.',
    },
  },

  /**
   * **Une feuille, jamais un pas-à-pas.** L'ordre de mobilisation dit quoi faire ; personne ne
   * disait comment tenir la carte. Ce mode d'emploi ne pointe rien du doigt, ne fléche rien et
   * n'attend aucune étape : la doctrine « sans tutoriel » tient. Chaque phrase décrit ce que le
   * code fait vraiment — ce qui n'existe pas n'y figure pas.
   *
   * **Les rayons sont des paramètres, jamais des chiffres écrits ici.** Une notice qui
   * recopie 60 et 400 est vraie le jour où on l'écrit et fausse le jour où l'équilibrage bouge —
   * et c'est la seule feuille du jeu qu'un joueur lit en croyant apprendre la règle. Ils sortent
   * de `convex/constants.ts`, comme partout ailleurs dans cette table.
   */
  briefing: {
    kicker: 'entrée en campagne',
    header: 'aide-mémoire du commandement',
    subtitle: 'Notice à l’usage de l’officier nouvellement affecté',
    /**
     * **La notice suit la main et l'écran** : les gestes de la souris ou ceux du doigt, les
     * bureaux du rail ou ceux du téléphone (refonte mobile — le « ? » du coin de carte n'existe
     * plus sous le seuil, ses gestes vivent ici). Le terrain, lui, est le même partout.
     */
    columns: (
      scoutRadiusKm: number,
      contactRadiusKm: number,
      outpostReachKm: number,
      hand: { readonly finger: boolean; readonly phone: boolean; readonly mapping: MouseMapping },
    ) => {
      const act = hand.finger
        ? 'toucher net'
        : fr.mapUi.mouse.click[buttonOfRole(hand.mapping, 'act')];
      return [
        hand.finger
          ? {
              title: 'La carte et le doigt',
              lines: [
                'Toucher net : ouvrir la rose et lire ce qui est touché. Un doigt glissé déplace la carte ; deux doigts pincent pour zoomer et tournent pour orienter.',
                'La rose des vents propose ce que ce point accepte, et rien d’autre.',
                'Touchez une de vos piles pour la lever : sa fiche s’ouvre au pied. Touchez la carte pour la poser, la pile pour la reposer. Le type d’ordre se choisit dans la feuille, et l’envoi se tient appuyé.',
                'Les régions n’apparaissent qu’au zoom rapproché : c’est là qu’on bâtit et qu’on désigne un sol.',
              ],
            }
          : {
              title: 'La carte et la souris',
              lines: [
                `Orienter et incliner la vue : ${fr.mapUi.mouse.drag[buttonOfRole(hand.mapping, 'orient')]}. Sélectionner le pays visé : clic gauche net.`,
                `Zoomer : molette. Déplacer la carte : ${fr.mapUi.mouse.drag[buttonOfRole(hand.mapping, 'pan')]}, ou espace maintenu avec le clic gauche.`,
                `La rose des vents : ${act} sur un point. Elle propose ce que ce point accepte, et rien d’autre.`,
                `Une de vos piles : ${fr.mapUi.mouse.click.left} pour la lever, puis ${fr.mapUi.mouse.click.left} sur la carte pour la poser. Pointeur arrêté, la route et l’heure d’arrivée s’affichent ; Échap la repose.`,
                'Ces trois métiers — orienter, déplacer, agir — se permutent sur les trois boutons dans les Réglages.',
                'Les régions n’apparaissent qu’au zoom rapproché : c’est là qu’on bâtit et qu’on désigne un sol.',
                'Le « ? » en bas à droite rouvre les commandes à tout moment.',
              ],
            },
        {
          title: 'Lire le terrain',
          lines: [
            'Les gisements ne sont le secret de personne : la géologie de 1940 est fixe. La carte les montre sur les terres où vous pouvez bâtir.',
            'Vous voyez ce que vous tenez. Le reste dort dans le brouillard — ni bâtiments, ni avant-postes adverses.',
            `Une troupe posée observe : elle relève les mouvements qui passent à moins de ${scoutRadiusKm} km. Un fil, un cap, une heure estimée — jamais le type, jamais la nation.`,
            `Une pile à vous porte deux cercles : le trait plein est ce qu’elle touche — ${contactRadiusKm} km, la portée de contact ; le tireté est ce qu’elle voit.`,
            `Un avant-poste ouvre ${outpostReachKm} km autour de son point : on y bâtit comme chez soi. Un raid le désactive ; seule l’infanterie le capture.`,
            'Un avant-poste se monte, jusqu’au niveau 3 : son panneau porte l’élévation — un emplacement de plus et le rayon suivant, payés dans la file de chantier.',
            `${upperFirst(act)} sur un avant-poste à vous : l’élever, choisir son métier — relais ou écoute — ou le démanteler. Le démantèlement emporte le sol qu’il colore et les bâtiments qu’il ancre.`,
          ],
        },
        hand.phone
          ? {
              title: 'Vos bureaux',
              lines: [
                'Au pied de l’écran : chantiers, journal, « à faire », presse, télégraphe. Une entrée ouverte se referme d’un second toucher.',
                'Le drapeau du bandeau ouvre le dossier de la nation : sa fiche, l’abaque de tir, les calques de la carte, les réglages, et cette feuille.',
                '« En cours », sous le bandeau : chaque compte à rebours, du plus proche au plus lointain. Un toucher y recentre la carte.',
                '« À faire » : vos poses offertes et tout ce qui attend un ordre.',
              ],
            }
          : {
              title: 'Vos bureaux',
              lines: [
                'Économie, dans le rail à gauche : tout ce qui se pose et tout ce qui coule — chantier, filière, projection.',
                '« À faire maintenant », en bas à gauche : tout ce qui attend un ordre, l’ordre de mobilisation en tête — chaque ligne recentre la carte. Vos troupes se lèvent sur la carte, et leur liste complète est dans la fenêtre Nation.',
                'Journal, au bout du bandeau : tout ce qui s’est passé depuis votre dernier passage.',
                'Télégraphe, dans le rail : le canal général de la saison — tout le monde y lit tout le monde.',
              ],
            },
      ];
    },
    foot: 'Cette feuille se relit depuis les Réglages.',
    dismiss: 'compris',
    dismissTitle: 'fermer l’aide-mémoire',
  },

  window: {
    resize: 'redimensionner',
  },

  panel: {
    expand: 'déplier',
    collapse: 'réduire',
  },

  selectedCountry: {
    enemyTitle: 'Nation adverse',
    neutralTitle: 'Pays neutre',
    /**
     * **Son propre pays n'est pas neutre** (trouvaille du 01/09). Le panneau titrait « Pays
     * neutre » sur la France d'un joueur français : la carte de la rose sait le dire depuis
     * toujours (`compass.myTerritory`), le panneau de terre ne le savait pas. Deux clés parce
     * que ce sont deux emplacements — un titre de panneau et l'intitulé d'une cible — et qu'un
     * jour l'un des deux se reformulera sans l'autre.
     */
    myTitle: 'Mon territoire',
    marker: 'sélection',
    hoverMarker: 'survol',
    restWindow: 'plage de repos',
    /**
     * **Deux questions, deux lignes** (correctif du 31/08). « Avant-poste » répond de *ce
     * pays-ci* — ai-je un point planté dedans — et c'est juste ; c'est l'étiquette qui mentait
     * par omission, puisque la carte peignait une région tenue depuis un point d'à côté sans
     * qu'aucune ligne ne le dise. « Tenue par » répond de *la région survolée*, et rien d'autre.
     */
    outpost: 'avant-poste',
    enemyOwner: 'adverse',
    garrison: 'garnison',
    heldBy: 'tenue par',
    moreDetails: 'détails',
    /**
     * **Le tenant tel qu'on l'a vu, et la date en clair** (ADR 0020 §5). La date ne dit pas
     * l'ancienneté — le délavage de la teinte la porte déjà, en permanence — elle dit *quand*,
     * ce qu'aucune nuance de couleur ne saura jamais dire. Une région à jour n'en a pas : son
     * nom franc est l'annonce.
     */
    heldBySurveyed: (holder: string, date: string) => `${holder} — relevé du ${date}`,
    /**
     * **Le souvenir d'une couleur, et l'heure de son retour** (ADR 0020 §7). La région n'est pas
     * tenue — elle ne compte ni au classement ni à la production — donc la ligne ne dit pas
     * « tenue par » : elle dit la suspension, et elle ne paraît que chez le propriétaire du point
     * hors service (ADR 0005).
     */
    suspended: 'zone suspendue',
    suspendedUntil: (time: string) => `suspendue jusqu’à ${time}`,
  },

  mapUi: {
    /** Le bouton qui ramène la carte chez soi, sous le seuil (refonte mobile, 1a). */
    recenter: 'recentrer sur le quartier général',
    recenterTitle: 'recentrer sur le quartier général (H)',
    /**
     * **Aucune phrase de la carte ne nomme un bouton en dur** : quel bouton oriente, déplace ou
     * agit est une préférence (`mouseMapping`), et une notice qui répondrait « clic droit » à un
     * joueur qui a mis la rose sur la molette mentirait dès son premier regard.
     */
    mouse: {
      drag: {
        left: 'clic gauche glissé',
        middle: 'molette enfoncée',
        right: 'clic droit glissé',
      },
      click: { left: 'clic gauche net', middle: 'clic molette net', right: 'clic droit net' },
      button: { left: 'bouton gauche', middle: 'bouton du milieu', right: 'bouton droit' },
      role: { orient: 'orienter', pan: 'déplacer', act: 'agir (la rose)' },
    },
    gestureHint: (mapping: MouseMapping) => ({
      orient: `${fr.mapUi.mouse.drag[buttonOfRole(mapping, 'orient')]} : orienter `,
      separator: '·',
      pan: ` ${fr.mapUi.mouse.drag[buttonOfRole(mapping, 'pan')]} ou espace : déplacer`,
      lift: ` ${fr.mapUi.mouse.click.left} : lever une pile, puis la poser`,
    }),
    controlsLabel: 'carte des commandes',
    controlsHeader: 'commandes de la carte',
    controlsClose: 'fermer',
    gestures: (mapping: MouseMapping) => [
      {
        gesture: fr.mapUi.mouse.drag[buttonOfRole(mapping, 'orient')],
        effect: 'orienter et incliner la caméra',
      },
      { gesture: 'clic gauche net', effect: 'sélectionner l’entité visée' },
      {
        gesture: `${fr.mapUi.mouse.click.left} sur une pile`,
        effect: 'la lever ; le suivant, sur la carte, la pose',
      },
      { gesture: 'échap', effect: 'reposer la pièce en main' },
      {
        gesture: fr.mapUi.mouse.drag[buttonOfRole(mapping, 'pan')],
        effect: 'déplacer la carte',
      },
      { gesture: 'espace + clic gauche', effect: 'déplacer la carte' },
      {
        gesture: fr.mapUi.mouse.click[buttonOfRole(mapping, 'act')],
        effect: 'ouvrir la rose des vents',
      },
      { gesture: 'molette', effect: 'zoomer' },
    ],
    /** **Le doigt ne lit pas le mappage** (décision mobile-1c) : trois lignes, toujours les mêmes. */
    fingerGestures: [
      { gesture: 'toucher net', effect: 'ouvrir la rose et lire ce qui est touché' },
      { gesture: 'toucher une pile', effect: 'la lever ; toucher la carte la pose' },
      { gesture: 'un doigt glissé', effect: 'déplacer la carte' },
      { gesture: 'deux doigts', effect: 'pincer pour zoomer, tourner pour orienter' },
    ],
    routeScale: 'échelle du trajet',
    dock: 'quai',
  },

  compass: {
    marchConsequence: (type: string) => `Trace l’arc réel et propose l’envoi : ${type}.`,
    aiming: (count: number) => `visée armée · ${count} troupe${plural(count, '', 's')}`,
    slotsCost: (free: number) => `1 slot · ${free} libre${plural(free, '', 's')}`,
    neutralHeld: 'pays neutre · avant-poste tenu',
    neutralFree: 'pays neutre · sans avant-poste',
    openWater: 'haute mer',
    myTerritory: 'mon territoire',
    enemyNation: 'nation adverse',
    outpostAt: (name: string) => `avant-poste · ${name}`,
    myForce: (count: number) => `ma force · ${count} unité${plural(count, '', 's')}`,
    fallbackOutpost: 'avant-poste',
    fallbackForce: 'force',
    build: 'Bâtir ici',
    buildConsequence: (region: string) => `Ouvre ce qui peut se poser en ${region}.`,
    /** La fondation a quitté la fenêtre de garnison pour le clic droit (décision du 29/08) :
     *  c'est un ordre donné à une troupe sur la carte, pas une ligne d'un formulaire. */
    found: 'Fonder un avant-poste',
    /** Le chantier plutôt que le point : ce que le clic ouvre est une fenêtre où rien ne tient
     *  encore, et où la garnison est ce qui la tient (révision du 15/09 de l'ADR 0020 §10). */
    foundConsequence:
      'Ouvre un chantier d’avant-poste ici : la colonne y devient garnison et le tient. Elle part ou elle tombe, le chantier est perdu — rien n’est remboursé.',
    /** La branche de la visée sur un mât à soi (décisions 64b, 69a) : une marche qui finit dans
     *  le bâtiment plutôt qu'en campagne devant lui. En minuscules comme les autres marches. */
    garrison: 'entrer en garnison',
    transportFull: 'ces troupes ne tiennent pas dans le camion disponible ici',
    joinTransport:
      'rejoindre sa position actuelle pour composer une pile — le camion doit vous y attendre',
    /** **Embarquer** (ADR 0025 §3) : sur-le-champ et sans slot — la bulle le dit avant le prix,
     *  parce que c'est ce qui sépare ce geste d'une marche. */
    board: 'embarquer',
    boardOnto: (transports: string) => `embarquer · ${transports}`,
    boardCost: (km: number) => `immédiat · sans slot · ${km} km`,
    boardPlaces: (used: number, capacity: number) =>
      `à bord ensuite : ${used} place${plural(used, '', 's')} sur ${capacity}`,
    /** « Cargo ×2 · porte-avions » : ce qui emporte, jamais l'abréviation de la pile. */
    transports: (roles: ReadonlyArray<UnitRole>) =>
      [...new Set(roles)]
        .map((role) => {
          const count = roles.filter((other) => other === role).length;
          return count > 1 ? `${roleLabel(role, 1)} ×${count}` : roleLabel(role, 1);
        })
        .join(' · ')
        .replace(/^./, (first) => first.toUpperCase()),
    region: (country: string) => `région · ${country}`,
    /**
     * **La cible est l'instance, et sa qualification décisionnelle est son niveau** (tranché le
     * 01/09) — calqué sur « région · France » : la sorte, puis ce qui la qualifie. La région, elle,
     * se lit déjà sur la carte sous le réticule, et la redire ici prendrait la place du niveau.
     */
    building: (level: number) => `bâtiment · niveau ${level}`,
    /** La facture de l'élévation, matière par matière : le dû, puis ce qu'il en reste en
     *  réserve. Le stock à côté du prix est ce qui transforme un chiffre en décision. */
    upgradeBill: (resource: string, needed: number, held: number) =>
      `${resource} ${needed} / ${held}`,
    /** **Un seul ordre, deux mots** (S8) : ce que le verbe change est ce que l'expédition
     *  rapporte — un entrepôt rend du butin, un producteur ne rend que son arrêt. En minuscules
     *  comme les marches, parce que c'en est une. */
    plunder: 'piller',
    sabotage: 'saboter',
    plunderConsequence: (verb: string) =>
      `Trace l’arc réel et propose l’envoi : ${verb}. La colonne tient le site, puis rentre.`,
    installation: 'installation relevée',
    /** **Capturer** (14/10) : la durée à la force de la pile, lue sur la fonction que le serveur date. */
    capture: 'capturer',
    captureConsequence: (duration: string) =>
      `L’infanterie tient le site ${duration} à sa force d’aujourd’hui, puis il change de main.`,
    collect: 'ramasser',
    collectConsequence:
      'Marche vers le dernier relevé de la caisse et ramène ce que la pile peut porter.',
    /** **Raser** (demande du 15/09) : en dernière position et en encre rouge, parce que c'est
     *  la seule branche de la rose dont rien ne revient. La confirmation dit le détail. */
    demolish: 'raser',
    demolishConsequence: 'Efface ce bâtiment. Rien de l’alliage payé n’est rendu.',
    /**
     * **Un point à soi se commande au clic droit** (décision de Pierre, 16/09, Registre 27). La
     * qualification décisionnelle est son niveau, comme pour un bâtiment : c'est lui qui dit ce
     * que le point porte — son rayon, ses emplacements — et le pays se lit déjà sous le réticule.
     */
    myOutpost: (level: number) => `mon avant-poste · niveau ${level}`,
    raiseConsequence: (level: number) =>
      `Ouvre un chantier : ce point passe au niveau ${level}, avec le rayon et l’emplacement qui vont avec.`,
    /** Le métier en cours : la branche est marquée, et cliquer ne change rien — il n'y a rien
     *  à changer. La phrase le dit plutôt que de laisser croire à un geste sans effet. */
    specializationHeld: 'Le métier que ce point exerce déjà.',
    specializeConsequence: (name: string) => `Change le métier de ce point : ${name}.`,
    /** **Démanteler** (décision du 16/09) : jumelle de « raser », en dernier et en encre rouge.
     *  Ce qu'elle emporte en plus — la couleur du sol et les bâtiments ancrés — se lit sur la
     *  confirmation, qui a la place de le dire en chiffres. */
    dismantle: 'démanteler',
    dismantleConsequence:
      'Efface ce point, sa couleur et ce qu’il ancre. Rien de l’alliage payé n’est rendu.',
    /** The rose in refusal: no branch, one motive. The heading says the absence, `fr.errors`
     *  says why — the same sentence the server would have answered after the click. */
    refused: 'aucun ordre ici',
  },

  /**
   * **La confirmation d'une démolition** (demande du 15/09). Elle dit ce qui est perdu **en
   * clair et en chiffres** — le niveau, le chantier repris, la garnison qui passe au sol,
   * l'écrêtage d'un entrepôt — parce que c'est le seul geste du jeu qui efface sans contrepartie
   * et sans passe d'armes. Même bouton que la visée : le mot *irréversible* à même l'encre.
   */
  demolition: {
    kicker: 'démolition',
    heading: (building: string, level: number) => `${building} — niveau ${level}`,
    /** La phrase de la décision 5a, imprimée : ce qui est bâti est dépensé. */
    noRefund: 'aucun remboursement de l’alliage payé',
    freed: (region: string) => `libère ${region} et son emplacement de site`,
    /** Le chantier repris, et ce que la file en rend : une entrée qui court a déjà consommé son
     *  tour, et elle ne rend rien — la même règle qu'une annulation ordinaire. */
    queueCancelled: 'chantier en file annulé',
    queueRefund: (amounts: string) => `remboursé : ${amounts}`,
    queueRunning: 'le chantier a commencé — il ne se rembourse pas',
    /** Une garnison ne meurt pas d'une démolition (ADR 0019) : elle se retrouve dehors. */
    garrison: (count: number) =>
      `${count} troupe${plural(count, '', 's')} passe${plural(count, '', 'nt')} au sol de la région`,
    /** Les lots d'une caserne rasée : la file s'arrête avec le bâtiment qui la portait. */
    batches: (count: number) =>
      `${count} lot${plural(count, '', 's')} en formation annulé${plural(count, '', 's')}`,
    clipping: 'plafonds abaissés — écrêtage au nouveau plafond',
    clippingLine: (resource: string, lost: number) => `${resource} −${num(lost)}`,
    submit: 'raser — irréversible',
    cancel: 'annuler',
  },

  /**
   * **La confirmation d'un démantèlement** (décision de Pierre, 16/09). Jumelle de la démolition,
   * et elle a plus à dire : un avant-poste n'est pas une bâtisse mais un **site** — il colore un
   * sol, il ancre des mâts, il héberge une garnison. Deux de ces trois pertes ne se lisent nulle
   * part ailleurs sur le plateau, donc elles se lisent ici ou jamais.
   */
  dismantle: {
    kicker: 'démantèlement',
    heading: (place: string, level: number) => `Avant-poste de ${place} — niveau ${level}`,
    /** **La couleur, en régions** (ADR 0020 §7 : « détruit, il la décolore définitivement »).
     *  Zéro est une information à part entière : un point qui ne tient rien de plus que ses
     *  voisins ne coûte rien à retirer, et c'est la phrase qui le dit. */
    colour: (regions: number) =>
      regions === 0
        ? 'aucune région ne perd nos couleurs — d’autres points les tiennent'
        : `${regions} région${plural(regions, '', 's')} perd${plural(regions, '', 'ent')} nos couleurs`,
    /** Les mâts que ce point ancre (décision 1a du 16/09) : ils tombent avec lui, comme s'ils
     *  étaient rasés un à un — file annulée, garnison au sol, aucun remboursement. */
    anchored: (count: number) =>
      `${count} bâtiment${plural(count, '', 's')} ancré${plural(count, '', 's')} tombe${plural(count, '', 'nt')} avec lui`,
    garrison: (count: number) =>
      `${count} troupe${plural(count, '', 's')} passe${plural(count, '', 'nt')} au sol, au point`,
    /** Le cas du chantier : ce qu'on retire alors est une promesse et non une bâtisse, et le
     *  joueur doit savoir qu'il n'attend plus rien. */
    underConstruction: 'le chantier de fondation est abandonné',
    noRefund: 'aucun remboursement — ni la fondation, ni les élévations',
    submit: 'démanteler — irréversible',
  },

  /**
   * **Le mode de pose** (ADR 0013, révision du 04/09) : le joueur tient un bâtiment et cherche
   * le point où il le pose. Trois mots — ce qu'on tient, ce qu'on cherche, comment on renonce —
   * parce que c'est un état sans bouton, et qu'un état sans bouton doit dire sa sortie.
   */
  placing: {
    hint: 'choisissez le point de côte — Échap pour renoncer',
    /** Ce qu'on tient, son prix et son attente — les chiffres du panneau de construction, que
     *  le joueur vient de lire sur une ligne et ne doit pas rechercher une fois la ligne
     *  fermée. Le nom de la région tient la ligne au-dessus : c'est le *où*, pas le *quoi*. */
    figures: (building: string, cost: string, duration: string) =>
      `${building} · ${cost} · ${duration}`,
  },

  construction: {
    kicker: 'chantier',
    offerHeader: 'à poser',
    noDeposit: 'aucun gisement',
    coastal: 'côtière',
    /**
     * The budget, said **before** the ceiling bites. `heldByCap` below only speaks once every
     * line is refused, which is the moment it is too late to plan — choosing where to build is
     * the decision this panel exists for, and it is made against what is left.
     */
    budget: (site: string, taken: number, total: number) =>
      `${site} — ${taken} sur ${total} emplacements, ${
        total - taken <= 0
          ? 'plus un libre'
          : `${total - taken} libre${plural(total - taken, '', 's')}`
      }`,
    /** Le site que la région sert : le sol national, ou le point qui la couvre. Un site nommé
     *  est la seule façon de dire « pas ici, mais là-bas » sans montrer une carte. */
    siteHome: 'sol national',
    siteOutpost: 'avant-poste',
    depositReason: (deposit: string) => `gisement de ${deposit}`,
    coastalReason: 'région côtière',
    // The blocking reason is written once, at the head of the panel — never as fifteen grey
    // badges. A ceiling names its remedy; a running site names nothing, since the queue takes
    // everything the player can pay for (25/08).
    heldBySite: (site: string, total: number, relief: HomeSlotRelief) =>
      `${site} : plus un emplacement libre sur ${total}${relief === null ? '' : homeSlotRelief(relief.nextHqLevel, relief.nextSlots)}.`,
    heldByOutpostSite: (total: number) =>
      `Avant-poste : plus un emplacement libre sur ${total} — améliorez-le pour en ouvrir un de plus.`,
    heldByMaterials: 'Matières insuffisantes pour les lignes en rouge.',
    /**
     * A launched season whose foundation is not placed is a normal state — so it is said, and
     * said where the placement happens. What the format takes back is the price and the wait;
     * the region stays the player's, and the sentence has to make that difference audible.
     */
    foundationNotice: (owed: string) =>
      `Socle de la saison : ${owed}. Pose gratuite et immédiate — la région reste votre choix.`,
    /** **L'effet se produit hors du champ où l'on a cliqué** : le panneau se referme sur la carte
     *  et le chantier part dans un bureau qui vit ailleurs. La phrase nomme les deux, sinon le
     *  joueur ne sait ni que ça a pris, ni où le retrouver. « Commandé » et non « mis en file » :
     *  le premier de la file démarre, et l'avis ne doit pas mentir sur le cas le plus courant. */
    queued: (building: string) => `${building} : chantier commandé — voir Économie.`,
    foundationCount: (name: string, count: number) => (count > 1 ? `${name} ×${count}` : name),
    free: 'offert',
    immediate: 'immédiat',
    /**
     * The rest of the catalogue, below the offer. The header has to say *region*, not
     * *impossible*: a port is not impossible, it is elsewhere — and a player who reads the
     * shelf as a list of failures stops reading it.
     */
    elsewhereHeader: 'pas sur cette région',
    /** After the name, never instead of it: what the nation already stands, all regions
     *  together. Hidden at zero — a column of « 0 déjà bâti » is noise, not a count. */
    built: (count: number) => `${count} déjà bâti${plural(count, '', 's')}`,
    blocked: {
      constructionHere: 'un chantier vise déjà cette région',
      /** L'avant-poste qui couvrait cette région est détruit : ses bâtisses restent debout,
       *  son ancre est morte (ADR 0020 §10). */
      outOfReach: 'plus aucun avant-poste ne couvre cette région',
      standing: 'déjà debout sur cette région',
      regionTaken: (name: string) => `la région porte déjà ${name}`,
      unique: 'un seul quartier général par nation',
      locked: (level: number) => `demande un quartier général niveau ${level}`,
      deposit: (deposits: ReadonlyArray<string>) =>
        `demande une région à gisement de ${deposits.join(' ou ')}`,
      coastal: 'demande une région côtière',
      here: 'ne peut pas se poser sur cette région',
    },
  },

  /** **Les affiches au survol** (table d'état-major) : ce que la pièce survolée dit d'elle, en
   *  carte de presse au-dessus d'elle. Elles remplacent le cartouche le temps du survol. */
  posters: {
    myMovement: 'mouvement · le mien',
    route: (from: string, to: string) => `${from} → ${to}`,
    site: (region: string) => `site · ${region}`,
    building: (name: string, level: number) => `${name}, niv. ${level}`,
    perHour: (amount: string) => `+${amount} / h`,
    network: 'réseau',
    linked: 'relié',
    unlinked: 'hors réseau',
    /** **Le mode chantier** : le nom, le niveau, le reste et la barre ne se lisent qu'ici. */
    worksSite: (region: string) => `chantier · ${region}`,
    raisingSite: (region: string) => `élévation · ${region}`,
    queuedSite: (region: string) => `en file · ${region}`,
    raising: (name: string, from: number, to: number) => `${name}, niv. ${from} → ${to}`,
    left: 'reste',
    /** Rien derrière la tête de file n'est daté : la file dit son rang, jamais une heure. */
    queued: (ahead: number) =>
      ahead === 1 ? 'après le chantier en cours' : `après ${ahead} chantiers`,
    lot: 'lot',
    lotProgress: (produced: number, ordered: number) => `${produced} / ${ordered}`,
    surveyed: (time: string) => `relevé · ${time}`,
    inSight: 'relevé · en vue',
    standing: 'force posée',
    moving: 'force en mouvement',
    unknown: 'composition inconnue, nation inconnue',
    pierced: (type: string, composition: string) => `${type} · ${composition}, nation inconnue`,
    estimatedArrival: 'arrivée estimée',
    estimatedTime: (time: string) => `~${time}`,
    heading: 'cap',
    headingAtMe: 'sur nous · estimé',
  },

  labels: {
    levelAndGarrison: (level: number, garrison: number) => `NIVEAU ${level} · GARNISON ${garrison}`,
    /** **Un chantier n'a pas de niveau** : il n'en aura un qu'au lever. Ce que le mât doit dire
     *  est ce qui le tient — la garnison — et dans combien de temps il tiendra debout. */
    outpostUnderConstruction: 'avant-poste en chantier',
    outpostGarrison: (garrison: number) => `GARNISON ${garrison}`,
    buildingLevel: (level: number) => `NIVEAU ${level}`,
    /** **Un cartouche par pile** (carte-lisible, 03/10) : le lieu et le compte, rien d'autre. */
    stackPlace: (place: string, troops: number) => `${place} · ${troops}`,
    /** Deux cartouches qui se chevauchent n'en font qu'un : les piles, puis les troupes. */
    stackGroup: (piles: number, troops: number) => `${piles} piles · ${troops}`,
    buildingGroup: (buildings: number) => `${buildings} sites`,
    groupZoom: (caption: string) => `${caption} — rapprocher pour les séparer`,
    /** **Des mâts d'une même région ne se sépareront jamais** (refonte mobile, 1r) : la pile
     *  s'ouvre en liste, une ligne par site. */
    groupList: (caption: string) => `${caption} — ouvrir la liste`,
    groupHeader: (caption: string, region: string) => `${caption} · ${region}`,
    constructionPrefix: 'chantier ',
    /** Le fanion du piquet de chantier d'une élévation : le niveau qui monte. */
    pennant: (level: number) => `niv. ${level}`,
    estimated: 'estimé',
    /** La colonne est au bout du fil et n'avance plus : ce qui reste à dire est l'heure de la
     *  passe, jamais un compte à rebours de marche. */
    arrivalHeld: (time: string) => `arrivée retenue · résolution à ${time}`,
    borderHold: (time: string) => `retenue à la frontière jusqu’à ${time}`,
  },

  unitSheets: {
    infantry: {
      kind: 'combat',
      strongAgainst: ['garnisons', 'avant-postes'],
      weakAgainst: ['blindé', 'bombardier'],
    },
    armor: {
      kind: 'combat',
      strongAgainst: ['infanterie', 'garnisons'],
      weakAgainst: ['bombardier', 'infanterie MK2'],
    },
    landTransport: {
      kind: 'support',
      contribution: 'Motorise deux fantassins : projette l’infanterie plus loin.',
    },
    fighter: {
      kind: 'combat',
      strongAgainst: ['bombardier', 'transport aérien'],
      weakAgainst: ['escorte'],
    },
    bomber: {
      kind: 'combat',
      strongAgainst: ['blindé', 'avant-postes', 'navires'],
      weakAgainst: ['chasseur'],
    },
    airTransport: {
      kind: 'support',
      contribution: `Vitesse maximale, capacité minimale : ${LIFT_CAPACITY.airTransport} places, jamais un blindé. Embarque et débarque dans un aérodrome.`,
    },
    escort: {
      kind: 'combat',
      strongAgainst: ['cargo', 'mouvements maritimes'],
      weakAgainst: ['bombardier'],
    },
    cargo: {
      kind: 'support',
      contribution: `Fait traverser la mer aux troupes terrestres : ${LIFT_CAPACITY.cargo} places, un blindé en prend ${LIFT_COST.armor}.`,
    },
    carrier: {
      kind: 'support',
      contribution: `Infrastructure mobile : déplace le point de lancement aérien, et emporte ${LIFT_CAPACITY.carrier} places de troupes terrestres.`,
    },
  },
} as const;

/**
 * Why a raise is greyed out, in the **same words the server would use** — the refusal sentence
 * is written once, in `fr.errors`, and the anticipation borrows it rather than paraphrasing it.
 * A player must not read one thing before the click and another after it.
 *
 * The running construction is the exception, and deliberately: the error code carries no name
 * and no deadline, where the view does. "Come back in twenty minutes" is information; "un
 * chantier est déjà en cours" is a wall.
 */
export function upgradeHoldText(hold: UpgradeHold): string {
  switch (hold.kind) {
    case 'alreadyQueued':
      return fr.upgrade.alreadyQueued;
    case 'cappedByHq':
      return fr.errors.CAPPED_BY_HQ();
    case 'materials':
      return fr.errors.INSUFFICIENT_RESOURCE({
        resource: hold.resource,
        needed: hold.needed,
        available: hold.available,
      });
  }
}

/**
 * **Ce qui retient une élévation d'avant-poste**, en une phrase — la même fonction pour le
 * panneau de garnison et pour la rose des vents, parce que c'est le même empêchement lu par la
 * même `outpostRaiseHold`. Le panneau tait la facture (il l'affiche déjà en chiffres rouges
 * au-dessus) ; la rose la dit, faute de place pour deux lectures.
 */
export function raiseHoldText(hold: OutpostRaiseHold): string {
  switch (hold.kind) {
    case 'maxLevel':
      return fr.garrison.raiseAtMaximum(hold.maximum);
    case 'disabled':
      return fr.garrison.raiseDisabled;
    case 'alreadyQueued':
      return fr.garrison.raiseQueued;
    case 'materials':
      return fr.errors.INSUFFICIENT_RESOURCE({
        resource: hold.resource,
        needed: hold.needed,
        available: Math.floor(hold.available),
      });
  }
}

/** `aucune caserne`, `aucun aérodrome` — the sentence that names a blockage, declined. */
export const noBuilding = (key: BuildingKey): string =>
  `${fr.buildingGender[key] === 'f' ? 'aucune' : 'aucun'} ${lowerFirst(fr.buildings[key])}`;

/** `l’entrepôt`, `le dépôt`, `la fonderie` — the building designated rather than counted, for
 *  a sentence that tells the player which one to go and raise. */
export const theBuilding = (key: BuildingKey): string => {
  const name = lowerFirst(fr.buildings[key]);
  return startsWithVowel(name)
    ? `l’${name}`
    : `${fr.buildingGender[key] === 'f' ? 'la' : 'le'} ${name}`;
};

/** `le blindé`, `l’escorte` — a role designated, for the sentence that says what a level opens. */
export const theRole = (role: UnitRole): string => {
  const name = fr.roles[role].one;
  return startsWithVowel(name)
    ? `l’${name}`
    : `${fr.roleGender[role] === 'f' ? 'la' : 'le'} ${name}`;
};

/** `une seconde caserne`, `un second port` — the building a parallel queue would need. */
export const aSecondBuilding = (key: BuildingKey): string =>
  `${fr.buildingGender[key] === 'f' ? 'une seconde' : 'un second'} ${lowerFirst(fr.buildings[key])}`;

/** `une caserne`, `un aérodrome` — the sentence that names the remedy. */
export const aBuilding = (key: BuildingKey): string =>
  `${fr.buildingGender[key] === 'f' ? 'une' : 'un'} ${lowerFirst(fr.buildings[key])}`;

/** Formats a stack for display: `3 blindés · 12 infanterie`, or an em dash when empty. */
export function stackLabel(stack: Partial<Record<UnitRole, number>>): string {
  const parts = (Object.entries(stack) as ReadonlyArray<[UnitRole, number]>)
    .filter(([, count]) => count > 0)
    .map(([role, count]) => `${count} ${roleLabel(role, count)}`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function roleLabel(role: UnitRole, count: number): string {
  return count > 1 ? fr.roles[role].many : fr.roles[role].one;
}

/**
 * **Un profil de tir, nommé** — le rôle, et la marque seulement quand le rôle en a deux
 * (`PROFILE_UNITS`). « Cargo MK1 » opposerait le cargo à un cargo MK2 qui n'existe pas.
 */
export function profileLabel(profile: CombatProfile): string {
  const { role, tier, marked } = PROFILE_UNITS[profile];
  return marked ? `${roleLabel(role, 1)} ${tierLabel(tier)}` : roleLabel(role, 1);
}

/** La même chose en trois lettres, pour une en-tête de colonne : une grille de onze colonnes
 *  n'a pas la largeur d'un nom propre. */
export function profileAbbreviation(profile: CombatProfile): string {
  const { role, tier, marked } = PROFILE_UNITS[profile];
  return marked ? `${fr.roleAbbreviations[role]}${tier}` : fr.roleAbbreviations[role];
}

/** The eight points of the compass, which is all a bearing is read at on a card: a heading in
 *  degrees is a number nobody pictures, and the fog grants no more precision than a direction. */
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

export function cardinalLabel(degrees: number): string {
  return CARDINALS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]!;
}

export function nationLabel(nation: string | null): string {
  return nation !== null && nation in fr.nations
    ? fr.nations[nation as Nation]
    : fr.common.noNation;
}

/**
 * **The only place a country becomes French.** Everything that names a land — the map, the
 * rose, the journal, a garrison's address — keys it by its Natural Earth `adm0_a3`, which is
 * the server's vocabulary and the regions'. The eight playable nations answer from
 * `fr.nations`, which is hand-written and stays that way; the other 243 come from
 * `public/country-names.json`, baked by `scripts/generate-region-index.mjs`.
 *
 * The fallback on the raw code never fires: the generation refuses to produce a table with a
 * hole in it. It is kept because a label vanishing is worse than a label reading "SAU", and
 * because a code arriving from somewhere the table does not cover is a bug to see, not to hide.
 */
export function countryLabel(adm0: string): string {
  const nation = NATION_BY_ADM0.get(adm0);
  if (nation !== undefined) return fr.nations[nation];
  return (countryNames as Readonly<Record<string, string>>)[adm0] ?? adm0;
}

/** « Blitz · Europe » ou « Mondiale » : le mode d'une saison, et son théâtre quand elle en a un. */
export const modeSummary = (mode: SeasonMode, theatre: string | null): string =>
  fr.modes.summary(
    fr.modes[mode].name,
    theatre === null ? null : ((fr.modes.theatres as Record<string, string>)[theatre] ?? theatre),
  );

/** Où une saison se joue : le théâtre d'une Blitz, le monde ou sa région pour une Mondiale. */
export const placeLabel = (mode: SeasonMode, theatre: string | null, region: string): string =>
  mode === 'blitz' ? modeSummary(mode, theatre) : `${fr.modes[mode].name} · ${region}`;

/**
 * **L'horloge d'une saison, en un mot.** Trois écrans la nomment — l'accueil, le salon, la
 * séquence de lancement — et une saison sans horloge en a besoin d'un plutôt que d'un blanc.
 */
export function clockLabel(durationHours: number | null): string {
  if (durationHours === null) return fr.lobby.paceNone;
  if (durationHours === 2) return fr.lobby.pace2;
  return durationHours === 48 ? fr.lobby.pace48 : fr.lobby.pace168;
}

/**
 * Le remède du sol national plein, en une demi-phrase — vide quand le QG est au maximum, parce
 * qu'il n'y a alors rien à faire et qu'une phrase qui ne dit rien vaut moins que le silence. Les
 * deux nombres arrivent servis (`me.homeSlotRelief`, `convex/constructions.ts`) : rien n'est
 * calculé ici.
 */
const homeSlotRelief = (nextHqLevel: unknown, nextSlots: unknown): string =>
  typeof nextHqLevel === 'number' && typeof nextSlots === 'number'
    ? ` — un quartier général niveau ${nextHqLevel} les porte à ${nextSlots}`
    : ' — le quartier général est au maximum';

const slotRelief = (nextHqLevel: unknown, nextSlots: unknown): string =>
  typeof nextHqLevel === 'number' && typeof nextSlots === 'number'
    ? ` — un quartier général niveau ${nextHqLevel} les porte à ${nextSlots}`
    : ' — le quartier général est au maximum';

const str = (value: unknown): string => (typeof value === 'string' ? value : '—');
const num = (value: unknown): string => (typeof value === 'number' ? String(value) : '—');
const nationName = (value: unknown): string =>
  typeof value === 'string' && value in fr.nations ? fr.nations[value as Nation] : str(value);
const resourceName = (value: unknown): string =>
  typeof value === 'string' && value in fr.resources
    ? fr.resources[value as ResourceKey]
    : str(value);
/** `une caserne` depuis une charge utile d'erreur — le pendant de `buildingName`, qui compte
 *  le bâtiment là où celui-ci le désigne dans une phrase. */
const aBuildingName = (value: unknown): string =>
  typeof value === 'string' && value in fr.buildings ? aBuilding(value as BuildingKey) : str(value);
/** « un blindé », « une infanterie » — the role with its article, from an error payload. */
const aRoleName = (value: unknown): string =>
  typeof value === 'string' && value in fr.roles
    ? `${fr.roleGender[value as UnitRole] === 'f' ? 'une' : 'un'} ${fr.roles[value as UnitRole].one}`
    : str(value);
const buildingName = (value: unknown): string =>
  typeof value === 'string' && value in fr.buildings
    ? fr.buildings[value as BuildingKey]
    : str(value);
const depositNames = (value: unknown): string =>
  Array.isArray(value)
    ? value
        .map((key) =>
          typeof key === 'string' && key in fr.deposits ? fr.deposits[key as DepositKey] : str(key),
        )
        .join(' ou ')
    : str(value);
