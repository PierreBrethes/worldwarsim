/**
 * The single French translation table. Code speaks English (identifiers, ids, error codes);
 * every string a player reads comes from here. The game ships in French only for now — no
 * runtime language switch, so components import `fr` directly and stay fully typed.
 *
 * Pure constants and functions: the domain layer may import this module — it pulls no React,
 * no Convex, no DOM.
 */
import type { ErrorCode } from '../../convex/errors';
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
    attack: 'attaque',
    raid: 'raid d’avant-poste',
    outpost: 'fondation d’avant-poste',
    agent: 'agent',
    decoy: 'leurre',
  } satisfies Record<MovementType, string>,

  movementTypesPlural: {
    attack: 'attaques',
    raid: 'raids',
    outpost: 'avant-postes',
    agent: 'agents',
    decoy: 'leurres',
  } satisfies Record<MovementType, string>,

  resources: {
    supply: 'ravitaillement',
    steel: 'acier',
    manpower: 'effectifs',
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
    industry: 'Complexe industriel',
    logistics: 'Centre logistique',
    conscription: 'Conscription',
    listening: 'Station d’écoute',
  } satisfies Record<BuildingKey, string>,

  buildingEffects: {
    hq: 'débloque les paliers et relève les plafonds de stockage',
    industry: 'vitesse et rendement de la conversion acier → unités',
    logistics: 'réduit le temps de trajet et fixe le nombre de slots',
    conscription: 'régénération et plafond des effectifs',
    listening: 'rayon de révélation passif autour du territoire',
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
    extraction: 'extraction',
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
    UNKNOWN_BUILDING: () => 'bâtiment inconnu',
    CAPPED_BY_HQ: () => 'plafonné par le QG — montez le quartier général d’abord',
    BATCH_TOO_SMALL: () => 'il faut recruter au moins une unité',
    BATCH_TOO_LARGE: (d) => `${num(d.maximum)} unités par lot au plus`,
    SINGLE_TIER_ROLE: () => 'ce rôle n’a qu’un seul palier',
    TIER_2_LOCKED: (d) => `palier 2 : complexe industriel niveau ${num(d.requiredLevel)} requis`,
    QUEUE_FULL: (d) => `file pleine (${num(d.maximum)} lots)`,
    UNKNOWN_BATCH: () => 'lot inconnu',
    BATCH_ALREADY_STARTED: () => 'ce lot a déjà commencé — il ne s’annule plus',
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
    regionSlots: { europe: '2–3', 'europe-med': '4–6', world: '7–8' } satisfies Record<PlayableRegion, string>,
    regionShort: { europe: 'Europe', 'europe-med': '+ Méditerranée', world: 'Monde' } satisfies Record<PlayableRegion, string>,
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
  },

  banner: {
    journalEmpty: 'journal — rien à signaler',
    unread: (count: number) =>
      `${count} dépêche${plural(count, '', 's')} non lue${plural(count, '', 's')}`,
    rate: (label: string, rate: number) => `${label} — ${rate >= 0 ? '+' : ''}${Math.round(rate)}/h`,
    nationSheet: (nation: string) => `${nation} — fiche de nation`,
    doctrine: (doctrine: string) => `doctrine ${doctrine}`,
  },

  rail: {
    troops: { title: 'Troupes — inventaire et envoi', label: 'troupes' },
    production: { title: 'Production — recrutement d’unités', label: 'prod.' },
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
  },

  indicatorCategories: {
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
      outposts: 'avant-postes',
      constructions: 'chantiers',
      forces: 'forces',
      'my-movements': 'mouvements',
      inbound: 'mouvements cap sur moi',
      intel: 'contacts',
    },
  },

  timeline: {
    header: 'mouvements en vol',
    collapse: 'replier la frise',
    expand: 'déplier la frise',
    slots: 'slots',
    slotsTitle: 'slots de mouvement occupés',
    empty: 'rien en vol',
    nextArrival: 'proch. arrivée',
    all: 'tous',
    mine: 'les miens',
    inbound: 'cap sur moi',
    intel: 'renseignement',
    unknownOrigin: 'origine inconnue',
    heading: (degrees: string) => `cap ${degrees}°`,
    unidentified: 'non identifié',
    unknownComposition: 'nature et composition non observées',
    identified: '· identifié',
    unknownTime: 'heure inconnue',
    stalledTitle: 'immobilisé à la frontière : plage de repos de la cible',
    arrivalTitle: 'heure d’arrivée',
    none: 'aucun mouvement en vol',
    inFlight: (count: number) => `${count} en vol`,
    inboundCount: (count: number) => `${count} cap sur moi`,
    nextArrivalShort: (time: string) => `proch. arrivée ${time}`,
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

  troops: {
    header: 'troupes',
    inventory: 'inventaire',
    send: 'envoi',
    slotsLine: (used: number, free: number) =>
      `${used} slot${plural(used, '', 's')} engagé${plural(used, '', 's')} · ${free} disponible${plural(free, '', 's')}`,
    situation: 'situation',
    situations: { all: 'toutes', home: 'à domicile', movement: 'en mouvement', garrison: 'en garnison' },
    domain: 'domaine',
    domains: { all: 'tous', land: 'terre', air: 'air', sea: 'mer' },
    sort: 'tri',
    sorts: { role: 'rôle', count: 'nombre', due: 'échéance' },
    countOf: (shown: number, total: number) => `${shown} unités sur ${total}`,
    emptyFilter: 'Aucune troupe ne répond à ce filtre.',
    atHome: 'à domicile',
    garrisonAt: (country: string) => `garnison — ${country}`,
    movementsHeader: 'mouvements en cours',
    intelNote:
      'Un arc adverse n’expose ni son type ni sa composition, et n’entre donc pas à l’inventaire. Un arc grisé est une dernière position connue, horodatée.',
    arcMine: (type: string) => `mien — ${type}`,
    arcDetected: 'adverse détecté',
    arcHeading: (degrees: number) => `arc relevé — cap ${degrees}°`,
    arcUnknownComposition: 'composition inconnue',
    arcLastKnown: 'dernière position connue',
    arcFrozen: (degrees: number) => `arc figé — cap ${degrees}°`,
    arcSeenAgo: (minutes: number) => `vu il y a ${minutes} min`,
    arcSeaControl: 'maîtrise des mers',
    arcEndsErased: 'extrémités effacées',
    arcNoEnds: 'ni origine ni destination',
  },

  send: {
    header: 'envoi d’un mouvement',
    slotCost: (freeAfter: number) =>
      `coût 1 slot — ${freeAfter} disponible${plural(freeAfter, '', 's')} après envoi`,
    noSlot: 'aucun slot disponible',
    typeLabel: 'type',
    decoyNote: 'Le leurre part avec zéro unité. Il est indiscernable d’un mouvement réel côté adverse.',
    stackLabel: 'composition de la pile',
    stackRight: 'reste à domicile après envoi',
    atHomeOf: (left: number, total: number) => `${left} / ${total} à domicile`,
    transitNote: 'Les forces en transit ne défendent plus le territoire national.',
    headingLabel: 'cap d’arrivée',
    headingButton: (heading: string) => `cap ${heading}`,
    headingNotes: {
      N: 'cap nord — pas de bonus, exposé aux escortes en garnison',
      E: 'cap est — favorise les blindés à la première passe',
      S: 'cap sud — allonge le trajet, réduit le bonus défenseur',
      O: 'cap ouest — favorise l’appui aérien à la première passe',
    },
    destinationLabel: 'destination',
    enemyNation: (power: string) => `nation adverse — ${power}`,
    pickDestination: 'Sélectionner un pays sur le plateau pour fixer la destination.',
    noRoute: 'Aucune route connue vers cette destination.',
    routeComputing: 'Calcul de la route…',
    estimatedDuration: 'durée estimée',
    arrival: 'arrivée',
    antimeridian: 'antiméridien',
    crossed: 'traversé',
    notCrossed: 'non traversé',
    cost: 'coût',
    restWarningKicker: 'plage de repos de la cible',
    restWarning: (window: string) =>
      `L’arrivée tombe dans la plage publique (${window}). Le mouvement sera immobilisé à la frontière jusqu’à la fin de la plage.`,
    cancel: 'annuler',
    submit: 'envoyer — irréversible',
  },

  production: {
    header: 'production',
    opening: 'Ouverture de l’atelier…',
    batch: 'lot',
    chainSpeed: (speed: string, level: number) =>
      `chaîne ×${speed} — complexe industriel niveau ${level}`,
    domains: { land: 'terre', air: 'air', sea: 'mer' },
    queueHeader: (count: number, max: number) => `file de production — ${count} / ${max}`,
    queueEmpty: 'Aucun lot en chaîne. Choisissez un lot et enfilez un rôle.',
    atWaking: 'au réveil',
    wakingNote:
      'La file continue pendant la plage de repos, comme les chantiers. Les unités terminées rejoignent l’armée à domicile. Un lot déjà commencé ne s’annule plus ; les suivants sont remboursés intégralement.',
    manpowerNote: 'Les effectifs ne s’achètent pas : chaque unité produite puise dans la conscription.',
    capOf: (cap: number) => `/ ${cap} plafond`,
    perUnit: '/ unité',
    strongAgainst: 'fort contre',
    weakAgainst: 'faible contre',
    supportNote: 'Ne combat pas, mais peut se faire détruire ou intercepter.',
    tier2Locked: (level: number) => `complexe industriel niveau ${level} requis`,
    tierLabel: (tier: number) => `palier ${tier}`,
    enqueueTitle: (count: number, role: string, tier: string) => `enfiler ${count} × ${role} ${tier}`,
    inChain: 'en chaîne',
    pending: 'en attente',
    cancelStarted: 'un lot commencé ne s’annule plus',
    cancelRefund: 'annuler et rembourser',
    cancel: 'annuler',
  },

  nationSheet: {
    kicker: 'fiche de nation',
    season: (season: number) => `saison ${season}`,
    doctrineLine: (doctrine: string) => `doctrine ${doctrine}`,
    buildingsHeader: 'bâtiments — un chantier à la fois',
    level: (level: number) => `niv. ${level}`,
    cappedByHq: 'plafonné par le QG',
    constructionRunning: 'Chantier en cours : ',
    remains: ' — reste ',
    powerHeader: 'pouvoir national',
    armyHeader: 'armée',
    present: 'présente',
    inTransit: 'en transit',
    capSuffix: (cap: number) => ` / ${cap} plafond`,
    restHeader: 'plage de repos déclarée',
    restNote:
      'Publique : vos adversaires la voient. Un mouvement qui arriverait pendant est immobilisé à la frontière jusqu’à sa fin.',
    restFrozen: 'Scellée au lancement — elle se déclarait au salon.',
    constructionInProgressTitle: 'un chantier est déjà en cours',
    raiseHqFirst: 'montez le quartier général d’abord',
    upgradeTitle: (name: string, level: number) => `passer ${name} au niveau ${level}`,
    construction: 'chantier',
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
    sendMovement: 'Envoyer un mouvement',
    sendConsequenceBlank: 'Ouvre la fenêtre d’envoi sur l’onglet mouvement.',
    sendConsequenceTo: (name: string) => `Ouvre la fenêtre d’envoi, ${name} en destination.`,
    foundOutpost: 'Fonder un avant-poste',
    foundConsequence: (name: string) => `Ouvre l’envoi préréglé sur la fondation, vers ${name}.`,
    slotsCost: (free: number) => `1 slot · ${free} libre${plural(free, '', 's')}`,
    neutralHeld: 'pays neutre · avant-poste tenu',
    neutralFree: 'pays neutre · sans avant-poste',
    myTerritory: 'mon territoire',
    enemyNation: 'nation adverse',
    outpostAt: (name: string) => `avant-poste · ${name}`,
    myForce: (count: number) => `ma force · ${count} unité${plural(count, '', 's')}`,
    fallbackOutpost: 'avant-poste',
    fallbackForce: 'force',
  },

  labels: {
    levelAndGarrison: (level: number, garrison: number) => `NIV. ${level} · GARN. ${garrison}`,
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

export function nationLabel(nation: string | null): string {
  return nation !== null && nation in fr.nations ? fr.nations[nation as Nation] : fr.common.noNation;
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
