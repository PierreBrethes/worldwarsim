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
import { NATION_BY_ADM0 } from '../domain/nations';
import type { UpgradeHold } from '../domain/construction';
import type { LandPace, RouteMedium } from '../domain/routing';
import type { ChainState } from '../domain/economy';
import type {
  BuildingKey,
  DepositKey,
  Doctrine,
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

/** Building names are capitalised as titles; mid-sentence they are common nouns again. */
const lowerFirst = (label: string): string => label.charAt(0).toLowerCase() + label.slice(1);

/** One decimal at most, and never a trailing `.0`: rates come out of a settlement, not a table. */
const tenths = (value: number): string => String(Math.round(value * 10) / 10);

/** "a, b et c" — the French list, the last conjunction spelled rather than commaed. */
const andList = (items: ReadonlyArray<string>): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`;

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

  doctrines: {
    domination: 'domination',
    hegemony: 'hégémonie',
    influence: 'influence',
  } satisfies Record<Doctrine, string>,

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
    decoy: 'leurre',
    return: 'retour',
  } satisfies Record<MovementType, string>,

  movementTypesPlural: {
    march: 'marches',
    attack: 'attaques',
    raid: 'raids',
    outpost: 'avant-postes',
    recall: 'rappels',
    agent: 'agents',
    decoy: 'leurres',
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
    depot: 'Dépôt',
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
    listening: 'rayon de révélation passif autour du territoire',
    billets: 'relève le nombre de troupes que l’armée peut aligner',
    warehouse: 'relève le plafond des matières et de l’alliage — se pille',
    depot: 'relève le plafond du pétrole et des munitions — explose',
  } satisfies Record<BuildingKey, string>,

  playableRegions: {
    europe: 'Europe',
    'europe-med': 'Europe + Méditerranée + Moyen-Orient',
    world: 'Monde',
  } satisfies Record<PlayableRegion, string>,

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
    listening: 'station d’écoute',
  } satisfies Record<Specialization, string>,

  mediums: {
    land: 'terrestre',
    sea: 'maritime',
    air: 'aérien',
  } satisfies Record<Medium, string>,

  errors: {
    UNKNOWN_TOKEN: () => 'jeton inconnu — redemandez le code de partie',
    SEASON_GONE: () => 'cette saison n’existe plus',
    SEASON_NOT_LAUNCHED: () => 'la saison n’est pas lancée',
    SEASON_ALREADY_LAUNCHED: () => 'la saison est déjà lancée',
    SEASON_CONCLUDED: () =>
      'la saison est conclue — on la relit, on n’y joue plus (le fondateur l’efface)',
    UNKNOWN_GAME_CODE: () => 'code inconnu — vérifiez les six caractères',
    NO_FREE_GAME_CODE: () => 'impossible de tirer un code de partie libre — réessayez',
    LOBBY_FULL: (d) => `salon complet (${num(d.maximum)} joueurs)`,
    UNKNOWN_NATION: () => 'nation inconnue',
    NATION_TAKEN: (d) => `${nationName(d.nation)} est déjà prise par ${str(d.nickname)}`,
    NATION_AND_DOCTRINE_REQUIRED: () => 'être prêt exige une nation et une doctrine',
    CREATOR_ONLY: () => 'seul le fondateur lance la saison',
    NOT_ENOUGH_PLAYERS: (d) => `il faut au moins ${num(d.minimum)} joueurs`,
    PLAYERS_NOT_READY: (d) =>
      `pas prêts : ${(d.nicknames as string[] | undefined)?.join(', ') ?? '—'}`,
    INVALID_REST_WINDOW: () => 'plage invalide : minutes entre 0 et 1439',
    REST_WINDOW_FROZEN: () =>
      'la plage de repos se déclare au salon — elle est scellée pour toute la saison',
    MISSING_RESOURCE: (d) => `ressource absente : ${resourceName(d.resource)}`,
    INSUFFICIENT_RESOURCE: (d) =>
      `il faut ${num(d.needed)} de ${resourceName(d.resource)} (${num(d.available)} disponibles)`,
    CONSTRUCTION_IN_PROGRESS: () => 'un chantier est déjà en cours',
    CAPPED_BY_HQ: () => 'plafonné par le QG — montez le quartier général d’abord',
    UNKNOWN_REGION: () => 'région inconnue',
    UNKNOWN_CAPITAL_REGION: (d) =>
      `capitale introuvable pour ${nationName(d.nation)} — la partie ne peut pas se lancer`,
    OUT_OF_OUTPOST_REACH: (d) =>
      d.nearestKm === null
        ? `hors de chez soi, il faut un avant-poste à moins de ${num(d.reachKm)} km — vous n’en avez aucun`
        : `aucun avant-poste à moins de ${num(d.reachKm)} km — le plus proche est à ${num(d.nearestKm)} km`,
    DEPOSIT_REQUIRED: (d) =>
      `${buildingName(d.building)} exige un gisement de ${depositNames(d.expected)} dans la région`,
    NOT_COASTAL: () => 'un port se pose sur une région côtière',
    REGION_TAKEN: (d) =>
      `la région porte déjà ${buildingName(d.standing)} — une seule bâtisse par région`,
    BUILDING_CAP_REACHED: (d) =>
      `plafond atteint : ${num(d.cap)} bâtiments — montez le quartier général pour l’élargir`,
    BUILDING_LOCKED: (d) =>
      `${buildingName(d.building)} demande un quartier général de niveau ${num(d.requiredLevel)} (vous en êtes au ${num(d.hqLevel)})`,
    ROLE_LOCKED: (d) => `ce rôle demande un quartier général de niveau ${num(d.requiredLevel)}`,
    MAX_LEVEL_REACHED: (d) => `niveau maximal atteint (${num(d.maximum)})`,
    HQ_ALREADY_BUILT: () => 'le quartier général est unique',
    UNKNOWN_BUILDING: () => 'bâtiment inconnu',
    WRONG_PROJECTION_BUILDING: (d) =>
      `ce rôle se forme dans ${buildingName(d.expected)}, pas dans ${buildingName(d.found)}`,
    TROOP_CAP_REACHED: (d) =>
      `plafond atteint : ${num(d.cap)} troupes, file comprise — bâtissez ou montez des baraquements`,
    SINGLE_TIER_ROLE: () => 'ce rôle n’a qu’un seul palier',
    TIER_2_LOCKED: (d) => `palier 2 : quartier général niveau ${num(d.requiredLevel)} requis`,
    QUEUE_FULL: (d) => `file pleine (${num(d.maximum)} lots)`,
    UNKNOWN_BATCH: () => 'lot inconnu',
    BATCH_ALREADY_STARTED: () => 'ce lot a déjà commencé — il ne s’annule plus',
    CHAIN_NOT_COMMANDED: (d) => `${buildingName(d.chain)} tourne seule — elle ne se commande pas`,
    CHAIN_NOT_STANDING: (d) => `aucun ${buildingName(d.building)} debout`,
    EMPTY_ORDER: () => 'un lot d’au moins une unité',
    ORDER_ABOVE_RESERVE: (d) => `la réserve d’entrée ne permet que ${num(d.maximum)}`,
    ORDER_RUNNING: (d) =>
      `un lot court déjà : ${num(d.produced)} sur ${num(d.ordered)} — annulez-le d’abord`,
    NO_ORDER: () => 'aucun lot en cours',
    MOVEMENT_IN_FLIGHT: (d) =>
      `un seul mouvement en vol à la fois (${num(d.maximum)}) — attendez son arrivée`,
    NO_LAND_ROUTE: (d) => `aucune route terrestre de ${str(d.from)} à ${str(d.to)}`,
    UNKNOWN_TROOP: () => 'troupe inconnue',
    TROOP_NOT_AT_ORIGIN: () => 'la troupe ne stationne pas à cette adresse',
    INFANTRY_ONLY: () => 'seule l’infanterie fonde un avant-poste',
    NO_PORT_AT_DEPARTURE: () => 'aucun port là d’où part la colonne — on n’embarque pas sans quai',
    NO_AIRFIELD_AT_DEPARTURE: () =>
      'aucun aérodrome là d’où part la colonne — on ne décolle pas d’un champ',
    /** The stack's footer prints this **before** the aim, not after the refusal: it says how
     *  many berths are short, because "il manque du transport" leaves the player counting. */
    NOT_ENOUGH_LIFT: (d) =>
      `${num(d.needed)} place${plural(Number(d.needed), '', 's')} à embarquer pour ${num(
        d.offered,
      )} à bord — il en manque ${num(Number(d.needed) - Number(d.offered))}`,
    UNKNOWN_OUTPOST: () => 'avant-poste inconnu',
    FRIENDLY_TARGET: () => 'on ne marche pas sur les siens',
    EMPTY_MOVEMENT: () => 'un mouvement part avec au moins une troupe',
    OUTPOST_TARGET_ONLY: () => 'un raid marche sur un avant-poste et sur rien d’autre',
    POINT_TARGET_ONLY: () => 'une marche va sur un point de la carte et sur rien d’autre',
    NOT_ORDERABLE: () => 'ce mouvement ne s’ordonne pas — le retour naît de la résolution',
  } satisfies Record<ErrorCode, (details: Record<string, unknown>) => string>,

  unexpectedError: 'une erreur imprévue est survenue — réessayez',

  notifications: {
    kicker: 'dépêche — incident',
    close: 'fermer',
  },

  errorScreen: {
    kicker: 'liaison interrompue',
    title: 'le bureau ne répond plus',
    retry: 'réessayer',
    backHome: 'retour à l’accueil',
  },

  common: {
    close: 'fermer',
    noNation: 'sans nation',
    players: (count: number) => `${count} joueur${plural(count, '', 's')}`,
    slot: '1 slot',
    dash: '—',
  },

  home: {
    edition: 'édition du jour',
    audience: '2 à 8 joueurs — entre amis',
    masthead: 'WORLDWARSIM',
    tagline: 'projeter de la force — l’information est chère, tout engagement est irréversible',
    stampTitle: 'état-major',
    stampSub: 'bureau des cartes',
    resume: 'reprendre la partie en cours',
    resumeLobby: (code: string) => `salon ${code}`,
    resumeSeason: 'saison en cours',
    statusLabel: 'statut',
    endsIn: 'fin dans',
    open: 'ouvert',
    finished: 'terminée',
    nicknameLabel: 'pseudo',
    nicknameNote: 'pas de compte — le pseudo suffit, il meurt avec la saison',
    nicknamePlaceholder: 'votre nom de guerre',
    foundTitle: 'Fonder une saison',
    foundNote: 'Vous choisissez la cadence. Un code est tiré, vous le partagez.',
    paceLabel: 'cadence',
    paces: {
      fast: { name: '48 heures', note: 'cadence rapide' },
      long: { name: '7 jours', note: 'cadence longue' },
    },
    regionLabel: 'région — fixée au lancement',
    regionSlots: { europe: '2–3', 'europe-med': '4–6', world: '7–8' } satisfies Record<
      PlayableRegion,
      string
    >,
    regionShort: {
      europe: 'Europe',
      'europe-med': '+ Méditerranée',
      world: 'Monde',
    } satisfies Record<PlayableRegion, string>,
    foundSubmit: 'fonder — obtenir un code',
    joinTitle: 'Rejoindre par code',
    joinNote: 'Six caractères reçus d’un fondateur. La cadence est déjà fixée.',
    codeLabel: 'code de partie',
    codePlaceholder: 'ABC234',
    joinHint: 'Le salon reste ouvert tant que le fondateur n’a pas lancé.',
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
    codeNote: 'Toute personne qui a ce code peut prendre une nation libre.',
    copyCode: 'copier le code',
    codeCopied: 'code copié',
    openCount: (count: number) => `salon ouvert · ${count} / 8`,
    nationsHeader: 'nations — premier arrivé, premier servi',
    nationsFree: (count: number) => `${count} libres`,
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
    doctrineHeader: 'ma doctrine — secrète',
    doctrineNote: 'Personne d’autre ne voit ce choix, seulement « prêt / pas prêt ».',
    restHeader: 'ma plage de repos — publique',
    restFrom: 'à partir de',
    restUntil: (end: string) => `jusqu’à ${end}`,
    restNote:
      'Sept heures par nuit, durée fixe : vous choisissez quand vous dormez, pas combien de temps. Vos adversaires la voient, et aucun mouvement ne peut arriver pendant — il attend à la frontière. Elle se scelle au lancement, comme la nation et la doctrine.',
    restDeclare: 'déclarer',
    restDeclared: 'déclarée ✓',
    checkNation: 'une nation réservée',
    checkDoctrine: 'une doctrine scellée',
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
    footerLeft: 'la partie commence quand le fondateur lance — pas avant',
    footerCode: (code: string) => `salon ${code}`,
    pace48: '48 heures',
    pace168: '7 jours',
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
    unavailableKicker: 'plateau indisponible',
    noGameTitle: 'aucune partie en cours',
    noGameBody:
      'Le plateau ne s’ouvre qu’avec une saison rejointe. Fondez-en une ou entrez le code d’une partie existante.',
    backHome: 'retour à l’accueil',
    loading: 'Préparation du plateau…',
    regionLabel: 'Région',
    /**
     * What the ground holds, and nothing else. The terrain type used to read here: it came
     * from a hash of the region's name, so the tooltip was printing an invention where the
     * one true fact about the region was available and unused.
     */
    regionDeposit: (deposit: string) => `gisement de ${deposit}`,
    regionNoDeposit: 'aucun gisement — caserne, aérodrome, baraquements',
    regionCoastal: 'côtière — port possible',
  },

  banner: {
    journalEmpty: 'journal — rien à signaler',
    unread: (count: number) =>
      `${count} dépêche${plural(count, '', 's')} non lue${plural(count, '', 's')}`,
    slots: 'slots de mouvement',
    slotsCount: (used: number, total: number) => `${used} / ${total}`,
    slotsTitle: (used: number, total: number) =>
      `${used} slot${plural(used, '', 's')} engagé${plural(used, '', 's')} sur ${total}`,
    counter: (label: string, stock: number, cap: number, rate: number) =>
      `${label} — ${stock} / ${cap} · ${rate >= 0 ? '+' : ''}${Math.round(rate)}/h`,
    nationSheet: (nation: string) => `${nation} — fiche de nation`,
    doctrine: (doctrine: string) => `doctrine ${doctrine}`,
    site: 'chantier',
    siteTitle: (name: string, region: string) => `${name} — ${region}`,
  },

  /**
   * The reserves left the banner for a panel of their own: eight figures set flat on a 32 px
   * strip could not carry the chains, and the arrows had nowhere to live. Vertical, they do.
   */
  reserves: {
    header: 'réserves',
    cap: (cap: number) => `plafond ${cap}`,
    collapsed: 'replié',
    alerts: (count: number) => `${count} alerte${plural(count, '', 's')}`,
    quiet: 'Rien à signaler',
    expand: 'déplier les réserves',
    collapse: 'replier les réserves',
    flow: (building: string, perHour: number) => `${building} — ${tenths(perHour)} / h`,
    /** The settled net rate, sign included: a reserve that drains says so with a minus. */
    rate: (perHour: number) => `${perHour > 0 ? '+' : ''}${tenths(perHour)} / h`,
    /** The cause, never the symptom: a chain out of matter with nothing that makes it. */
    starvedNoSource: (none: string, resource: string) => `à sec — ${none} · ${resource}`,
    saturated: (perHour: number) => `saturé — ${tenths(perHour)} / h perdus`,
    cappedAlert: (resource: string, perHour: number) =>
      `${resource} au plafond — ${tenths(perHour)} / h perdus`,
    haltedAlert: (building: string, resource: string) =>
      `${building} à l’arrêt — ${resource} à sec`,
  },

  rail: {
    production: { title: 'Production — recrutement d’unités', label: 'prod.' },
    industry: { title: 'Industrie — chaînes, gisements et réserves', label: 'indus.' },
    nation: { title: 'Ma nation', label: 'nation' },
    replay: { title: 'Rejeu de bataille — à venir', label: 'rejeu' },
    doctrine: { title: 'Doctrine — à venir', label: 'doctrine' },
    intel: { title: 'Espionnage — à venir', label: 'espion.' },
    settings: 'Réglages',
    seasonEnd: (season: number, hours: number, minutes: string) =>
      `saison ${season} — fin dans ${hours} h ${minutes}`,
    seasonShort: (season: number) => `S.${season}`,
    toggleTitle: (label: string, on: boolean) =>
      `${label} au bord de l’écran — ${on ? 'allumé' : 'éteint'}`,
    // The buildings bascule governs the board itself, not only its edge: saying otherwise
    // would promise a border setting and hide the plates.
    toggleBuildingsTitle: (on: boolean) =>
      `bâtiments sur la carte — ${on ? 'affichés' : 'masqués'}`,
    // Same reading as the buildings bascule, same reason: it governs the board, not the edge.
    toggleDepositsTitle: (on: boolean) => `gisements sur la carte — ${on ? 'affichés' : 'masqués'}`,
  },

  indicatorCategories: {
    buildings: 'bâtiments',
    deposits: 'gisements',
    outposts: 'avant-postes',
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
      const toll = `j’en perds ${mine.lost}, il en perd ${theirs.lost}`;
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
  },

  /**
   * **La victoire de test — un échafaudage, pas une décision de design.** Une seule condition,
   * publique et nominative, en attendant les trois doctrines secrètes de la fiche 05
   * (`src/domain/victory.ts`). Le vocabulaire suit : on *réduit* un joueur, on ne l'élimine
   * jamais — il rejoue, il reconstruit, et il sort alors du compte de son bourreau.
   */
  victory: {
    kicker: 'domination — victoire de test',
    scaffold: 'condition unique et publique, en attendant les doctrines',
    dispatch: (by: string, whom: string) => `${by} a réduit ${whom}`,
    concluded: (nation: string) => `LA SAISON EST CONCLUE — ${nation} l’emporte`,
    tally: (reduced: number, target: number) => `${reduced} réduits sur ${target}`,
    reducedMark: 'réduit',
    standingMark: 'debout',
    homeConcluded: (nation: string) => `saison conclue — ${nation} l’emporte`,
  },

  journal: {
    editionOf: (time: string) => `édition de ${time}`,
    seasonDay: (season: number, day: number, total: number) =>
      `saison ${season} — jour ${day} sur ${total}`,
    masthead: 'LE JOURNAL DES OPÉRATIONS',
    nationLine: (nation: string, doctrine: string) => `${nation} — doctrine ${doctrine}`,
    dispatches: (count: number) => `${count} dépêche${plural(count, '', 's')}`,
    severities: { critical: 'critique', notable: 'notable', routine: 'routine' },
    effectRunning: 'L’effet court encore ',
    atWaking: 'au réveil',
    stalledResolution: '. Résolution à ',
    noneStalled: 'Aucun mouvement immobilisé par une plage de repos.',
    embargoLeft: 'embargo restant',
    slotsEngaged: 'slots engagés',
    remaining: (time: string) => `restant ${time}`,
    resolutionAt: (time: string) => `résolution à ${time}`,
    replay: 'rejeu',
    seeReplay: 'voir le rejeu',
    replayTitle: 'rejeu — surface 4.7 à venir',
    historyLabel: 'historique de la saison',
    historyTitle: 'surface 4.7 — à venir',
    keepNote: 'les dépêches lues restent consultables, rejeu compris',
    backToBoard: 'retour au plateau',
  },

  /**
   * **Le widget de troupes** — la seule maison de la liste depuis la décision 13a. Deux
   * sections, deux pouvoirs : les stationnaires se dirigent, les mouvements en vol
   * s'observent, et le vocabulaire de chaque section doit rendre cette différence lisible
   * sans qu'on ait à lire une phrase.
   */
  troops: {
    header: 'troupes',
    collapsed: 'replié',
    expand: 'déplier le widget de troupes',
    collapse: 'replier le widget de troupes',
    cap: (standing: number, cap: number) => `${standing} / ${cap}`,
    slots: (used: number, total: number) => `slots ${used} / ${total}`,
    stationary: 'stationnaires',
    stationaryPower: 'dirigeables',
    moving: 'en mouvement',
    movingPower: 'observables',
    none: 'aucune troupe en service',
    atHome: 'à domicile',
    /** The host arrives as an `adm0_a3`; the naming happens here so that no caller can print
     *  a code by forgetting to ask for a name. */
    garrisonAt: (adm0: string) => `garnison — ${countryLabel(adm0)}`,
    /** A column left standing on the map (ADR 0019 §3), named the same way. */
    postedAt: (adm0: string) => `en campagne — ${countryLabel(adm0)}`,
    postedAtSea: 'en campagne — en mer',
    strength: (current: number, nominal: number) => `effectif ${current} / ${nominal}`,
    open: (station: string) => `voir ${station} et composer un mouvement`,
    remaining: (duration: string) => `${duration} restant`,
    arrivalAt: (time: string) => `arrivée ${time}`,
    restMark: (time: string) => `arrive en repos — libre à ${time}`,
    // The decoy is visible to its owner alone (fiche 04) — the adversary sees an ordinary arc.
    decoyMark: 'leurre — visible de vous seul',
    observe: (route: string) => `suivre ${route}`,
    foldedQuiet: 'rien en vol',
    foldedFlight: (count: number, next: string) =>
      `${count} mouvement${plural(count, '', 's')} en vol — prochaine arrivée dans ${next}`,
    foldedStanding: (count: number) => `${count} stationnaire${plural(count, '', 's')}`,
    /**
     * **La punition doit se voir là où le joueur regarde la troupe** (ADR 0019 §4). Un surcoût
     * qu'on ne lit que sur un écran de comptabilité est une punition invisible, exactement ce
     * que D3 refusait pour l'attrition.
     */
    unsupplied: (factor: number) => `hors ravitaillement — entretien ×${factor}`,
    /**
     * **Le renseignement, troisième section** — ce qu'une troupe posée a vu passer (ADR 0019 §5,
     * fiche 04). Elle ne perce rien : ni type, ni composition, ni nation. Le fil, le cap, un
     * horaire estimé, et c'est tout.
     */
    intel: 'renseignement',
    intelPower: 'non identifié',
    intelNone: 'rien de repéré',
    /**
     * **La règle temporelle, en une ligne.** Le relevé se calcule au départ du mouvement adverse
     * et jamais après : une troupe posée ensuite ne verra pas ce qui vole déjà. Sans cette
     * phrase, ce sera lu comme une panne le premier jour — c'est un pari sur ce qui passera, pas
     * une réaction à ce qui passe.
     */
    intelRule: 'une sentinelle ne voit que ce qui part après elle',
    intelBearing: (cardinal: string) => `cap ${cardinal}`,
    intelAtMe: 'cap sur vous',
    intelEstimate: (duration: string) => `~ ${duration}`,
    intelLost: (duration: string) => `perdu de vue il y a ${duration}`,
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
    column: (count: number) => `pile : ${count} troupe${plural(count, '', 's')} · 1 slot`,
    /**
     * **Les places, dès qu'un transport est coché** (note « le transport terrestre et l'allure »).
     * Le joueur voyait « 2 troupes · 1 slot » et composait à l'aveugle : ni ce que ses transports
     * offrent, ni ce que sa pile demande. Un transport sans capacité n'affiche rien — le jour où
     * l'allure en donne une au camion, le compteur suit sans une ligne de plus.
     */
    seats: (needed: number, offered: number) => `places : ${needed}/${offered}`,
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
    prepare: 'préparer un mouvement',
    /** Founding is what a column does where it stands (ADR 0019 §1) — the terrain is under its
     *  feet when the specialisation is chosen, which is why the choice lives here. */
    found: 'fonder un avant-poste',
    foundSpecialization: 'spécialisation',
    foundHere: 'fonder ici',
    // A garrison abroad has no barracks to leave from: the server only marches from a
    // projection building (ADR 0013), and saying so beats a refusal after the click.
    notProjection: 'Une colonne part d’un bâtiment de projection — celle-ci tient son point.',
  },

  /** La visée en carte : ce qui remplace la modale d’envoi. */
  aim: {
    /** A place has no name: the degrees are the name, to one decimal — the precision a click
     *  carries, past which the figure says more than the gesture did. */
    pointAt: (lon: number, lat: number) =>
      `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'O'}`,
    armed: 'visée armée',
    column: (count: number, station: string) =>
      `pile ${count} troupe${plural(count, '', 's')} — ${station}`,
    gesture: 'survol : destinations légales · clic droit : type',
    disarm: 'échap — désarme la visée',
    previewKicker: 'aperçu de trajet',
    slot: '1 slot',
    heading: (destination: string, type: string) => `${destination} — ${type}`,
    computing: 'calcul de la route…',
    noRoute: 'Aucune route terrestre vers cette destination.',
    duration: (duration: string, count: number) =>
      `durée ${duration} · ${count} troupe${plural(count, '', 's')}`,
    arrival: (time: string) => `arrivée ${time}`,
    restBite: (time: string) => `mord la fenêtre de repos — libre à ${time}`,
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

  production: {
    header: 'production',
    opening: 'Ouverture de l’atelier…',
    domains: { land: 'terre', air: 'air', sea: 'mer' },
    site: 'site',
    siteOption: (region: string, level: number) => `${region} — niv. ${level}`,
    // The single limiting factor, never the list of conditions (brief §5).
    blockedBy: (none: string) => `bloqué : ${none}`,
    noSite: (building: string) =>
      `Aucun bâtiment de ce type. Bâtissez ${building} pour former ce domaine.`,
    queueHeader: 'files de production',
    queueOf: (region: string, count: number, max: number) => `${region} — ${count} / ${max}`,
    queueEmpty: 'Aucune troupe en chaîne. Choisissez un site et enfilez un rôle.',
    atWaking: 'au réveil',
    wakingNote:
      'Les files continuent pendant la plage de repos, comme les chantiers. Chaque bâtiment tient sa propre file : une seconde caserne forme en parallèle. Une troupe déjà commencée ne s’annule plus ; les suivantes sont remboursées intégralement.',
    troopCapLine: (inService: number, queued: number, cap: number) =>
      `${inService} en service · ${queued} en file — plafond ${cap}`,
    troopCapNote:
      'Les hommes ne sont pas une ressource : une troupe coûte des matières, et l’armée est bornée en nombre de troupes par les baraquements. La file compte dans le plafond.',
    perTroop: '/ troupe',
    strongAgainst: 'fort contre',
    weakAgainst: 'faible contre',
    supportNote: 'Ne combat pas, mais peut se faire détruire ou intercepter.',
    tier2Locked: (level: number) => `quartier général niveau ${level} requis`,
    /** The tank waits for the level that arms its counter — said before the click, not after. */
    roleLocked: (level: number) => `verrouillé — quartier général niveau ${level} requis`,
    tierLabel: (tier: number) => `palier ${tier}`,
    enqueueTitle: (role: string, tier: string, site: string) => `enfiler ${role} ${tier} — ${site}`,
    enqueue: '+ 1 troupe',
    inChain: 'en chaîne',
    pending: 'en attente',
    cancelStarted: 'une troupe commencée ne s’annule plus',
    cancelRefund: 'annuler et rembourser',
    cancel: 'annuler',
  },

  upgrade: {
    action: 'améliorer',
    title: (name: string, level: number) => `passer ${name} au niveau ${level}`,
    toLevel: (level: number) => `→ niv. ${level}`,
    /**
     * A refusal that names its cause beats a refusal that counts (brief §5). "Il faut 72 de
     * charbon (0 disponibles)" is a wall; "disponible dans 4 h 20" is a plan, and when nothing
     * produces the matter at all, the only useful sentence names the building to raise.
     */
    availableIn: (time: string) => `disponible dans ${time}`,
    never: (none: string) => `jamais : ${none}`,
    neverOnDeposit: (none: string, deposit: string) => `jamais : ${none} de ${deposit}`,
    neverNote: (a: string) => `bâtissez ${a}, rien d’autre ne débloque cette amélioration`,
  },

  industry: {
    header: 'industrie',
    lead: 'Les stocks disent où vous en êtes ; cette fenêtre dit ce qui coule et ce qui est bloqué.',

    chainsHeader: 'chaînes de conversion',
    chainArrow: '→',
    chainRecipe: (quantity: number, resource: string) => `${quantity} ${resource}`,
    chainStates: {
      off: 'éteinte',
      idle: 'en attente d’ordre',
      running: 'tourne',
      starved: 'à sec',
      overflowing: 'débordée',
    } satisfies Record<ChainState, string>,
    starvedOn: (resource: string) => `à sec — ${resource}`,
    chainNotes: {
      off: (building: string) => `${building} : rien de bâti, rien ne se convertit.`,
      idle: 'En attente d’ordre, pas en panne : rien n’est consommé.',
      running: 'Débit nominal — rien à faire.',
      starved: (resource: string) =>
        `L’entrée manque : la chaîne ne produit rien. Exploitez ou stockez du ${resource}.`,
      overflowing: 'Sortie au plafond : ce qui se convertirait se perdrait. Stockez ou dépensez.',
    },
    // The real rate leads, the nominal follows — never the other way round (brief §2.1).
    nominalRate: (rate: number) => `nominal ${tenths(rate)} / h`,
    depositsHeader: 'gisements exploités',
    depositsEmpty:
      'Aucune exploitation debout. Une ferme, une filature, une mine ou un puits se pose sur une région à gisement.',
    noDeposit: 'aucun gisement exploitable — ne produit rien',
    depositLine: (deposit: string, level: number) => `${deposit} — niv. ${level}`,

    /**
     * The gauge carries the ratio to the ceiling **without writing the ceiling** — that is
     * what removes the eighteen repetitions of "/ 400 plafond" (brief §3). The figure lives in
     * the banner, where one wants the value; the gauge lives here, where one wants the margin.
     */
    reservesHeader: 'réserves',
    reservesNote: 'jauge pleine = production perdue',
    reservesMark:
      'Le repère à 85 % est le seuil où le chiffre revient : « reste N avant plafond » ne s’écrit qu’au-delà.',
    headroom: (left: number) => `reste ${left} avant plafond`,
    atCap: 'saturé — production perdue',
    gaugeTitle: (resource: string, stock: number, cap: number) =>
      `${resource} — ${stock} sur ${cap}`,

    /** The lot, in its four readings: awaiting an order, being sized, running, delivered. */
    lot: {
      awaiting: 'en attente d’ordre',
      awaitingNote: 'rien n’est consommé',
      nothingOrdered: 'aucune commande en cours',
      keepsAvailable: (resource: string) =>
        `Le ${resource} reste disponible pour les bâtiments et les troupes.`,
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
    upkeepHeader: 'entretien des troupes',
    upkeepEmpty: 'Aucune troupe en service : rien à nourrir.',
    upkeepTroops: (count: number) => `${count} troupe${plural(count, '', 's')} en service`,
    upkeepDrain: (perHour: number) => `− ${tenths(perHour)} nourriture / h`,
    upkeepUnsupplied: (count: number, factor: number) =>
      `dont ${count} hors ravitaillement — entretien ×${factor}`,
    upkeepAllSupplied: 'toutes ravitaillées — sol national ou rayon d’un avant-poste',
    upkeepBalance: (net: number) =>
      `solde ${net >= 0 ? '+' : '−'} ${tenths(Math.abs(net))} nourriture / h`,
    upkeepStarving:
      'À sec : les files de recrutement sont à l’arrêt. Rien n’est perdu, aucune troupe ne meurt — elles repartent dès que la nourriture revient.',

    othersHeader: 'autres bâtiments',
    othersEmpty: 'Ni entrepôt, ni dépôt, ni station d’écoute.',
    listeningUnfigured: 'rayon de révélation non chiffré — l’espionnage n’est pas écrit',
    listeningTemporary:
      'La station d’écoute est ici en attendant la fenêtre Espionnage : un jalon inerte serait pire.',

    level: (level: number) => `niv. ${level}`,
    // The real rate is a settled quantity, not a table entry: it arrives with a tail of
    // floating point behind it, and "2.9999999 / h" is not a figure anyone reads.
    perHour: (rate: number) => `${tenths(rate)} / h`,
    inRegion: (region: string) => `en ${region}`,
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

  nationSheet: {
    kicker: 'fiche de nation',
    season: (season: number) => `saison ${season}`,
    doctrineLine: (doctrine: string) => `doctrine ${doctrine}`,
    hqHeader: 'quartier général',
    hqLevelLine: (level: number, maximum: number) => `niveau ${level} sur ${maximum}`,
    hqMissing: 'Aucun quartier général debout — rien d’autre ne peut se bâtir.',
    hqCarriesHeader: 'ce qu’il porte',
    hqSlots: (total: number) => `${total} slots de mouvement`,
    hqChainSpeed: (speed: string) => `chaînes de production ×${speed}`,
    hqTier2: 'palier 2 ouvert en production',
    hqTier2Locked: (level: number) => `palier 2 en production au niveau ${level}`,
    budgetHeader: 'budget d’emplacements',
    budgetTaken: (taken: number, cap: number) => `${taken} sur ${cap}`,
    budgetFree: (free: number) =>
      free <= 0
        ? 'plus un emplacement libre'
        : free === 1
          ? '1 emplacement libre'
          : `${free} emplacements libres`,
    budgetNote: 'Le quartier général est le seul goulot : aucune quantité ne se compte en régions.',
    /** The headquarters is counted in — the census and the budget above it would otherwise
     *  disagree to the eye, and it is the figure that loses (brief §2.2). */
    buildingsHeader: 'recensement des bâtiments — un chantier à la fois',
    buildingsNote: 'On élève un bâtiment là où on l’emploie : Industrie ou Production.',
    nothingBuilt:
      'Rien de bâti. On pose une bâtisse sur la carte : clic droit sur une région à soi, au zoom rapproché.',
    inRegion: (region: string) => `en ${region}`,
    level: (level: number) => `niv. ${level}`,
    cappedByHq: 'plafonné par le QG',
    constructionRunning: 'Chantier en cours : ',
    remains: ' — reste ',
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
    restHeader: 'plage de repos déclarée',
    restNote:
      'Publique : vos adversaires la voient. Un mouvement qui arriverait pendant est immobilisé à la frontière jusqu’à sa fin.',
    restFrozen: 'Scellée au lancement — elle se déclarait au salon.',
  },

  settingsWindow: {
    header: 'réglages',
    scaleLabel: 'Échelle de l’interface',
    scaleNote: (min: number, max: number) =>
      `De ${min} à ${max} %, appliqué immédiatement. Réglage propre à ce navigateur.`,
    reset: 'défaut',
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
    marker: 'sélection',
    hoverMarker: 'survol',
    progression: 'progression',
    doctrine: 'doctrine',
    unknown: 'inconnue',
    restWindow: 'plage de repos',
    lastIntel: 'dernier renseignement',
    outpost: 'avant-poste',
    enemyOwner: 'adverse',
    none: 'aucun',
    garrison: 'garnison',
  },

  mapUi: {
    gestureHint: {
      leftClick: 'clic gauche : orienter ',
      separator: '·',
      pan: ' molette ou espace : déplacer',
    },
    controlsLabel: 'carte des commandes',
    controlsHeader: 'commandes de la carte',
    controlsClose: 'fermer',
    gestures: [
      { gesture: 'clic gauche glisser', effect: 'orienter et incliner la caméra' },
      { gesture: 'clic gauche net', effect: 'sélectionner l’entité visée' },
      { gesture: 'molette enfoncée', effect: 'déplacer la carte' },
      { gesture: 'espace + clic gauche', effect: 'déplacer la carte' },
      { gesture: 'clic droit', effect: 'ouvrir la rose des vents' },
      { gesture: 'molette', effect: 'zoomer' },
    ],
    routeScale: 'échelle du trajet',
    dock: 'quai',
  },

  compass: {
    seeCountry: 'Voir le pays',
    seeCountryConsequence: (name: string) => `Sélectionne ${name} et ouvre son panneau de bord.`,
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
    region: (country: string) => `région · ${country}`,
    /** The rose in refusal: no branch, one motive. The heading says the absence, `fr.errors`
     *  says why — the same sentence the server would have answered after the click. */
    refused: 'aucun ordre ici',
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
    budget: (taken: number, cap: number) =>
      `${taken} sur ${cap} emplacements — ${
        cap - taken <= 0 ? 'plus un libre' : `${cap - taken} libre${plural(cap - taken, '', 's')}`
      }`,
    depositReason: (deposit: string) => `gisement de ${deposit}`,
    coastalReason: 'région côtière',
    // The blocking reason is written once, at the head of the panel — never as fifteen grey
    // badges. A construction names its deadline, a ceiling names its remedy.
    heldByConstruction: (name: string, remaining: string) =>
      `Chantier en cours : ${name} — reste ${remaining}. Un seul à la fois.`,
    heldByCap: (cap: number) =>
      `Plafond de bâtiments atteint (${cap}) — élevez votre quartier général pour l’élargir.`,
    heldByMaterials: 'Matières insuffisantes pour les lignes en rouge.',
    /**
     * A launched season whose foundation is not placed is a normal state — so it is said, and
     * said where the placement happens. What the format takes back is the price and the wait;
     * the region stays the player's, and the sentence has to make that difference audible.
     */
    foundationNotice: (owed: string) =>
      `Socle de la saison : ${owed}. Pose gratuite et immédiate — la région reste votre choix.`,
    foundationCount: (name: string, count: number) => (count > 1 ? `${name} ×${count}` : name),
    free: 'offert',
    immediate: 'immédiat',
  },

  labels: {
    levelAndGarrison: (level: number, garrison: number) => `NIV. ${level} · GARN. ${garrison}`,
    buildingLevel: (level: number) => `NIV. ${level}`,
    constructionPrefix: 'chantier ',
    estimated: 'estimé',
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
      contribution: 'Ajoute de la capacité de pile : projette l’infanterie plus loin.',
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
      contribution: 'Vitesse maximale, capacité minimale.',
    },
    escort: {
      kind: 'combat',
      strongAgainst: ['cargo', 'mouvements maritimes'],
      weakAgainst: ['bombardier'],
    },
    cargo: {
      kind: 'support',
      contribution: 'Commerce avec les pays neutres et logistique lourde.',
    },
    carrier: {
      kind: 'support',
      contribution: 'Infrastructure mobile : déplace le point de lancement aérien.',
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
export function upgradeHoldText(hold: UpgradeHold, running: string | null): string {
  switch (hold.kind) {
    case 'constructionRunning':
      return running ?? fr.errors.CONSTRUCTION_IN_PROGRESS();
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

/** `aucune caserne`, `aucun aérodrome` — the sentence that names a blockage, declined. */
export const noBuilding = (key: BuildingKey): string =>
  `${fr.buildingGender[key] === 'f' ? 'aucune' : 'aucun'} ${lowerFirst(fr.buildings[key])}`;

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

export function doctrineLabel(doctrine: string | null): string | null {
  return doctrine !== null && doctrine in fr.doctrines
    ? fr.doctrines[doctrine as Doctrine]
    : doctrine;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '—');
const num = (value: unknown): string => (typeof value === 'number' ? String(value) : '—');
const nationName = (value: unknown): string =>
  typeof value === 'string' && value in fr.nations ? fr.nations[value as Nation] : str(value);
const resourceName = (value: unknown): string =>
  typeof value === 'string' && value in fr.resources
    ? fr.resources[value as ResourceKey]
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
