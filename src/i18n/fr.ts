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
import { isNation, NATION_BY_ADM0 } from '../domain/nations';
import { LIFT_CAPACITY, LIFT_COST, tierLabel } from '../domain/troops';
import type { AimVerdict, OutpostRaiseHold, UpgradeHold } from '../domain/construction';
import type { DispatchKind, Faced, TourEnd } from '../domain/player-view';
import type { TagTour } from '../domain/cargo-tag';
import type { SeasonMode } from '../domain/season-mode';
import type { JoinRefusal } from '../domain/off-season';
import type { VerdictReason } from '../domain/blitz';
import type { TheatreId } from '../domain/theatres';
import type { RacePoint } from '../domain/landing';
import type { StrategicPointKey } from '../domain/strategic-points';
import type { ReplayStep } from '../domain/replay';
import type { CombatProfile } from '../domain/combat';
import { PROFILE_UNITS } from '../domain/gunnery';
import type { MovementSheet } from '../domain/gunnery';
import { buttonOfRole, type MouseMapping } from '../domain/mouse-mapping';
import type { LandPace } from '../domain/routing';
import type {
  BuildingKey,
  DepositKey,
  Detector,
  Medium,
  MovementType,
  Nation,
  PlayableRegion,
  RegionType,
  ResearchCard,
  ResourceKey,
  Specialization,
  UnitRole,
} from '../domain/ids';

const NUMBER_WORDS = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
];
/** Un petit nombre en toutes lettres, comme un télégramme et une manchette l'écrivent. */
const spelled = (count: number): string => NUMBER_WORDS[count] ?? num(count);

const PLACE_OF: Readonly<Record<string, string>> = {
  Europe: 'd’Europe',
  Méditerranée: 'de la Méditerranée',
  Pacifique: 'du Pacifique',
  Amériques: 'des Amériques',
};
const ofPlace = (theatre: string): string => PLACE_OF[theatre] ?? `de ${theatre}`;

/** **Les cartes de recherche** (ADR 0028 §5), comme l'artefact les nomme. */
const RESEARCH_NAMES: Readonly<Record<ResearchCard, string>> = {
  infantryMk2: 'Infanterie MK2',
  armor: 'Blindé',
  armorMk2: 'Blindé MK2',
  artillery: 'Artillerie',
  escort: 'Escorte',
  carrier: 'Porte-avions',
  aviation: 'Aviation',
  bomber: 'Bombardier',
  airlift: 'Transport aérien',
  syntheticOil: 'Pétrole synthétique',
  listening: 'Station d’écoute',
  transmissions1: 'Transmissions I',
  transmissions2: 'Transmissions II',
  transmissions3: 'Transmissions III',
  doubleWorks: 'Chantier double',
  doubleTraining: 'Formation double',
};

/** Ce que chaque carte ouvre, dans les mots de l'artefact du 18/10. */
const RESEARCH_UNLOCKS: Readonly<Record<ResearchCard, string>> = {
  infantryMk2: 'le fantassin antichar',
  armor: 'le blindé MK1',
  armorMk2: 'le blindé lourd',
  artillery: 'le tir indirect',
  escort: 'le navire qui protège les cargos',
  carrier: 'l’aviation en mer',
  aviation: 'la tuile aérodrome et le chasseur',
  bomber: 'la frappe de loin sur les bâtiments',
  airlift: 'l’avion qui embarque et largue le ravitaillement',
  syntheticOil: 'une ligne d’usine : 3 charbon pour 1 pétrole',
  listening: 'la tuile du relevé à longue portée, qui brûle du charbon',
  transmissions1: 'un slot de mouvement de plus',
  transmissions2: 'un slot de mouvement de plus',
  transmissions3: 'un slot de mouvement de plus',
  doubleWorks: 'une seconde file de chantier',
  doubleTraining: 'une seconde file de formation dans chaque site',
};

/** **Une pièce ou une tuile derrière sa carte**, une seule phrase partout : le refus du serveur,
 *  la pièce, l'abaque et le site. */
export const researchRequired = (card: ResearchCard): string =>
  `demande la recherche ${cardName(card)}`;

/** `« Blindé »` — la carte nommée comme sur le plateau personnel. */
export const cardName = (card: unknown): string =>
  `« ${RESEARCH_NAMES[card as ResearchCard] ?? String(card)} »`;

type RefusalContext = {
  readonly founder: string | null;
  readonly maximum: number;
  readonly theatre: string | null;
};

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

/** L'élision devant une voyelle — `l’acier` et jamais `le acier`. */
const startsWithVowel = (word: string): boolean =>
  'aeiouyâàäéèêëîïôöûüœ'.includes(word.charAt(0).toLowerCase());

/** `de Paris`, `d’essai-nuit-a` — a free-form name (nickname, region) after `de`. */
export const ofName = (name: string): string =>
  name === '' ? '' : startsWithVowel(name) ? `d’${name}` : `de ${name}`;

/** `de` before a designated site: `du port`, `de la caserne`, `de l’aérodrome`. */
const ofSite = (site: string): string =>
  site.startsWith('le ') ? `du ${site.slice(3)}` : `de ${site}`;

/** `une` before a feminine noun, where `spelled(1)` says `un`. */
const spelledFeminine = (count: number): string => (count === 1 ? 'une' : spelled(count));

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
const combatBeats = (
  attacking: boolean,
  mineLost: number,
  theirsLost: number,
  shock = false,
): string => {
  /** **Un choc** (B17) : charge contre charge, personne n'a frappé le premier. */
  if (shock)
    return `choc, les deux camps ont tiré ensemble : nous en perdons ${mineLost}, eux ${theirsLost}`;
  const [strike, riposte] = attacking ? [theirsLost, mineLost] : [mineLost, theirsLost];
  const answer =
    riposte > 0 ? `${attacking ? 'leur' : 'notre'} riposte en abat ${riposte}` : 'aucune riposte';
  return `${attacking ? 'notre' : 'leur'} frappe en abat ${strike}, ${answer}`;
};

/**
 * **Ce qu'on a eu en face au feu** (F1) : la nation, puis chaque rôle, en hommes ou en machines
 * (ADR 0014) — les marques se fondent, la phrase compte des rôles.
 */
const facedWords = (faced: Faced): string => {
  const roles = [...new Set(faced.forces.map((force) => force.role))].map((role) => {
    const of = faced.forces.filter((force) => force.role === role);
    const troops = of.reduce((sum, force) => sum + force.troops, 0);
    const strength = of.reduce((sum, force) => sum + force.strength, 0);
    const unit = role === 'infantry' ? 'homme' : 'machine';
    return `${roleLabel(role, 1)} ×${troops} (${strength} ${unit}${plural(strength, '', 's')})`;
  });
  return `${facedNation(faced.nation)} : ${roles.join(', ')}`;
};

const facedNation = (nation: string | null): string =>
  nation !== null && isNation(nation) ? fr.nations[nation] : 'garnison irrégulière';

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

  /** **L'atout d'une nation, en clair** (fiche 06, N3 du 14/10) : un nom et la règle qu'il casse. */
  nationAssets: {
    france: {
      name: 'Le rayon impérial',
      rule: 'vos avant-postes ouvrent un rayon plus large, sans contrainte d’adjacence',
    },
    uk: {
      name: 'Maîtrise des mers',
      rule: 'votre écoute relève tous les mouvements maritimes, sans origine ni destination',
    },
    usa: { name: 'Prêt-bail', rule: 'vos envois de ressources ne sont jamais relevés' },
    ussr: {
      name: 'Évacuation industrielle',
      rule: 'vous démontez un bâtiment et le rebâtissez ailleurs, à coût réduit',
    },
    germany: {
      name: 'Guerre éclair',
      rule: 'deux mouvements offensifs s’enchaînent sans attendre de slot',
    },
    japan: { name: 'Banzaï', rule: 'votre infanterie capture à pleine vitesse, même entamée' },
    italy: {
      name: 'Mare Nostrum',
      rule: 'un mouvement maritime part d’un avant-poste côtier, sans port',
    },
    china: {
      name: 'Terre brûlée',
      rule: 'un bâtiment chinois capturé est détruit au lieu d’être pris',
    },
  } satisfies Record<Nation, { name: string; rule: string }>,

  roles: {
    infantry: { one: 'infanterie', many: 'infanterie' },
    armor: { one: 'blindé', many: 'blindés' },
    landTransport: { one: 'transport terrestre', many: 'transports terrestres' },
    artillery: { one: 'artillerie', many: 'artilleries' },
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
    artillery: 'f',
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
    artillery: 'ART',
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

  /** Le mouvement d'un avion qui largue (ADR 0028 §4) : une marche pour le serveur, un largage
   *  pour le joueur. */
  airdropMovement: 'largage',

  resources: {
    food: 'vivres',
    steel: 'acier',
    coal: 'charbon',
    oil: 'pétrole',
    ammunition: 'munitions',
  } satisfies Record<ResourceKey, string>,

  deposits: {
    food: 'terres',
    iron: 'fer',
    coal: 'charbon',
    oil: 'pétrole',
  } satisfies Record<DepositKey, string>,

  buildings: {
    hq: 'Quartier général',
    farm: 'Ferme',
    mine: 'Mine',
    oilWell: 'Puits de pétrole',
    arsenal: 'Arsenal',
    barracks: 'Caserne',
    airfield: 'Aérodrome',
    port: 'Port',
    listening: 'Station d’écoute',
    warehouse: 'Entrepôt',
    depot: 'Entrepôt',
    city: 'Ville',
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
    mine: 'f',
    oilWell: 'm',
    arsenal: 'm',
    barracks: 'f',
    airfield: 'm',
    port: 'm',
    listening: 'f',
    warehouse: 'm',
    depot: 'm',
    city: 'f',
  } satisfies Record<BuildingKey, 'm' | 'f'>,

  buildingEffects: {
    hq: 'unique et chez soi — plafonne les autres, porte la recherche ; son niveau est le nombre de chantiers en même temps',
    farm: 'exploite des terres',
    mine: 'tire du charbon ou de l’acier, selon le gisement : charbon ou fer',
    oilWell: 'exploite un gisement de pétrole',
    arsenal: 'charbon + acier → munitions, ou 3 charbon → 1 pétrole après recherche, sur commande',
    barracks: 'ouvre le domaine terrestre et forme l’infanterie et les véhicules',
    airfield: 'ouvre le domaine aérien et assemble les avions',
    port: 'ouvre le domaine maritime et construit les navires — région côtière',
    listening: `relève les mouvements adverses qui passent à moins de ${LISTENING_STATION_RADIUS_KM} km`,
    warehouse: 'relève le plafond des cinq ressources — se pille',
    depot: 'relève le plafond des cinq ressources — se pille',
    city: 'verse des fonds chaque minute à qui la tient — Blitz seulement',
  } satisfies Record<BuildingKey, string>,

  playableRegions: {
    europe: 'Europe',
    'europe-med': 'Europe + Méditerranée + Moyen-Orient',
    world: 'Monde',
  } satisfies Record<PlayableRegion, string>,

  /** L'économie de la Blitz (lot 4) : une ressource, les fonds — jamais « argent ». */
  blitz: {
    funds: 'fonds',
    neutral: 'neutre',
    unguarded: 'personne ne la tient — l’infanterie la capture',
    perMinute: (perMinute: number) => `+${num(perMinute)}/min`,
    siteIncome: (perMinute: number) => `verse ${num(perMinute)} fonds par minute`,
    fundsHeld: (funds: number) => `${num(funds)} fonds en caisse`,
    price: (funds: number) => `${num(funds)} fonds`,
    terms: (funds: number, duration: string) => `${num(funds)} fonds · prêt en ${duration}`,
    recruit: (funds: number) => `former — ${num(funds)} fonds`,
    short: (missing: number) => `il manque ${num(missing)} fonds`,
    mend: 'soin',
    formsIn: (sites: ReadonlyArray<string>) =>
      `se forme dans ${sites.join(' ou dans ')}, contre des fonds`,
    mending: (count: number) =>
      count > 1 ? `${num(count)} troupes reprennent des forces` : 'reprend des forces',
    mendingHere: (count: number) => (count > 1 ? `${num(count)} en soin` : 'une en soin'),
    mendNote: (share: number, seconds: number) =>
      `une troupe entamée posée sur un bâtiment à soi reprend ${num(Math.round(share * 100))} % de sa force toutes les ${num(seconds)} secondes, contre des fonds`,
    clock: 'fin',
    clockLabel: (left: string) => `fin de la Blitz dans ${left} — le plus gros revenu l’emporte`,
    clockEnded: 'terminée',
    clockOut: 'éliminé',
    ending: {
      won: 'VICTOIRE',
      lost: 'DÉFAITE',
      draw: 'ÉGALITÉ',
      eliminated: (time: string) => `ÉLIMINÉ À ${time} — votre quartier général est tombé`,
      home: 'retour à l’accueil',
      watch: 'regarder la carte',
      observe: 'observer',
      outcome: { winner: 'vainqueur', loser: 'vaincu', out: 'éliminé', draw: 'égalité' },
    },
    fundsLabel: (stock: number, perMinute: number) =>
      `fonds : ${num(Math.floor(stock))}, ${num(perMinute)} de plus chaque minute`,
  },

  modes: {
    blitz: { name: 'Blitz' },
    mondiale: { name: 'Mondiale' },
    theatres: {
      europe: 'Europe',
      mediterranean: 'Méditerranée',
      pacific: 'Pacifique',
      americas: 'Amériques',
    } satisfies Record<TheatreId, string>,
    theatrePlayers: (min: number, max: number) =>
      min === max ? `${min} joueurs` : `${min} à ${max} joueurs`,
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
    buildingSite: (building: string, region: string) => `${building} ${ofName(region)}`.trim(),
    outpostSite: (level: number, country: string) =>
      `l’avant-poste de niveau ${level} — ${country}`,
    /** Le tampon sur le site, et la ligne sous l'anneau — « 14 h 20 » est l'heure de fin. */
    stamp: 'capture',
    endsAt: (percent: number, hour: string) => `${percent} % · fin vers ${hour}`,
    lostAt: (percent: number, hour: string, hq = false) =>
      `${percent} % · ${hq ? 'QG perdu' : 'perdu'} vers ${hour}`,
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
  /**
   * **Les points stratégiques** (P1-P12) : un nom de 1940, une règle cassée pour qui le tient.
   */
  points: {
    names: {
      tangier: 'Tanger',
      istanbul: 'Istanbul',
      rangoon: 'Rangoun',
      hongKong: 'Hong Kong',
      halifax: 'Halifax',
      narvik: 'Narvik',
      lisbon: 'Lisbonne',
      baku: 'Bakou',
      dakar: 'Dakar',
      singapore: 'Singapour',
    } satisfies Record<StrategicPointKey, string>,
    rules: {
      tangier:
        'Vous seul commercez avec le comptoir neutre : trois d’une ressource contre une d’une autre, une fois par édition.',
      istanbul:
        'Une fois par jour, vous lisez le dernier télégramme privé entre deux joueurs — tamponné « lu à Istanbul » chez eux.',
      rangoon:
        'Vos tournées de ravitaillement ne se relèvent jamais : aucune détection ne les voit.',
      hongKong:
        'Vous lisez la dépêche de chaque capture, où que ce soit — points, bâtiments et avant-postes, même ceux que vous ne voyez pas : qui prend quoi, et où.',
      halifax: 'Vos mouvements maritimes ne prennent pas de slot.',
      narvik: 'Vos exploitations produisent même hors réseau.',
      lisbon: 'Vous lisez la nation de tout ce que vous relevez.',
      baku: 'Vos troupes à l’arrêt font le plein sur le plateau personnel, où qu’elles soient : comme si elles étaient ancrées.',
      dakar:
        'Vos réserves ne se pillent pas, et un dépôt d’avant-poste capturé chez vous brûle avec son contenu.',
      singapore: 'Vos camions et vos cargos roulent sans plein.',
    } satisfies Record<StrategicPointKey, string>,
    kicker: 'point stratégique',
    site: (key: StrategicPointKey) => `le point stratégique de ${fr.points.names[key]}`,
    neutral: 'neutre — personne ne le tient',
    heldBy: (nation: string, since: string, total: string) =>
      `tenu par ${nation} depuis ${since} · ${total} en tout`,
    yoursSince: (since: string, total: string) => `à vous depuis ${since} · ${total} en tout`,
    readAtLisbon: (nation: string) => `${nation} — lu à Lisbonne`,
    istanbul: {
      title: 'Lire un télégramme',
      between: 'entre',
      and: 'et',
      read: (from: string, to: string, text: string) =>
        `LU À ISTANBUL — ${from} à ${to} : « ${text} »`,
      overheard: (from: string, to: string) =>
        `Un télégramme de ${from} à ${to} a été lu à Istanbul.`,
      act: 'lire le dernier — une fois par jour',
      nothing: 'Aucun télégramme privé entre eux : la lecture du jour a servi pour rien.',
      stamp: 'lu à Istanbul',
    },
    tangier: {
      title: 'Le comptoir',
      give: 'céder',
      get: 'recevoir',
      act: (give: number, get: number) => `échanger ${give} contre ${get} — une fois par édition`,
      done: (got: number) => `Comptoir de Tanger : ${got} reçus.`,
    },
    contested: 'contesté — une capture est en cours',
    how: 'Il se prend comme un bâtiment : une infanterie le tient six heures. Son teneur le garde sans garnison.',
    needsAColumn: 'Levez une colonne d’infanterie, puis visez le point pour le capturer.',
    race: {
      title: 'La course aux Sept',
      chapo:
        'Sept lieux réels de 1940. Qui en tient quatre, vingt-quatre heures d’affilée, prend la saison.',
      waiting: 'Les Sept attendent leurs teneurs.',
      count: (held: number) => `${num(held)} sur 7`,
      countdown: (nation: string, left: string) =>
        `${nation} tient quatre des Sept : victoire dans ${left} si rien ne bouge.`,
      contested: 'contesté',
      palmares: 'Le palmarès — qui a tenu chaque lieu le plus longtemps',
      neverHeld: 'jamais tenu',
    },
    hongKong: {
      dispatch: (nation: string, key: StrategicPointKey, from: string | null) =>
        `DÉPÊCHE DE HONG KONG — ${nation} prend ${fr.points.names[key]}${
          from === null ? ', jusque-là neutre' : ` à ${from}`
        }.`,
      /** Qui, quoi, où — la région ou le pays est dans le site. */
      captured: (nation: string, site: string, from: string | null) =>
        `DÉPÊCHE DE HONG KONG — ${nation} prend ${site}${from === null ? '' : ` à ${from}`}.`,
    },
    taken: (nation: string, key: StrategicPointKey) => `${nation} prend ${fr.points.names[key]}.`,
    drawn: (keys: ReadonlyArray<StrategicPointKey>) => {
      const names = keys.map((key) => fr.points.names[key]);
      return `LES SEPT SONT TIRÉS — ${names.slice(0, -1).join(', ')} et ${names.at(-1)}. Qui en tient quatre vingt-quatre heures d’affilée prend la saison.`;
    },
    /** **Dakar** : le dépôt capturé au teneur brûle ; les deux camps l'apprennent. */
    depotBurned: (side: 'capturer' | 'holder', country: string, lost: string) =>
      side === 'capturer'
        ? `Le dépôt d’avant-poste de ${country} a brûlé à la capture, Dakar le garde : ${lost} perdu.`
        : `Votre dépôt d’avant-poste de ${country} a brûlé plutôt que de passer à l’ennemi (Dakar) : ${lost} perdu.`,
    nothing: 'rien',
  },

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
    REGISTER_TOO_FAST: () => 'trop d’inscriptions à la fois — réessayez dans un instant',
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
      'la Mondiale est lancée — elle se joue entre ceux qui étaient au départ',
    UNKNOWN_GAME_CODE: () => 'code inconnu — vérifiez les six caractères',
    NO_FREE_GAME_CODE: () => 'impossible de tirer un code de partie libre — réessayez',
    LOBBY_FULL: (d) => `salon complet (${num(d.maximum)} joueurs)`,
    BLITZ_STARTED: () => 'la Blitz est lancée — elle se joue entre ceux qui étaient là',
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
    PLAYERS_ABSENT: (d) =>
      `pas à la table : ${(d.nicknames as string[] | undefined)?.join(', ') ?? '—'} — à l’heure dite, vous pourrez lancer sans les attendre`,
    SETTING_NOT_IN_MODE: () => 'ce réglage n’existe pas dans ce mode',
    INVALID_CAPTURE_HOURS: () => 'la capture d’un QG dure 12 ou 24 heures',
    INVALID_DURATION: () => 'une Mondiale dure 3, 5, 7, 10 ou 14 jours',
    UNKNOWN_STRATEGIC_POINT: () => 'ce point stratégique n’existe pas dans cette saison',
    POINT_NOT_HELD: () => 'il faut tenir ce point stratégique pour user de sa règle',
    POWER_SPENT: () => 'la règle de ce point a déjà servi — elle revient à la période suivante',
    SAME_RESOURCE: () => 'le comptoir échange une ressource contre une autre',
    STORAGE_FULL: (d) =>
      `vos magasins ne peuvent pas recevoir ${num(Number(d.needed))} de ${resourceName(d.resource)} — bâtissez un entrepôt ou videz-les d’abord`,
    RENDEZVOUS_PAST: () => 'ce rendez-vous est déjà passé',
    SEATS_OUT_OF_RANGE: () =>
      'nombre de places impossible — ni sous le nombre d’assis, ni au-delà de ce que la table tient',
    THEATRE_TOO_SMALL: () => 'ce théâtre n’assoit pas tous ceux qui sont déjà à table',
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
    /** **Hors de son sol et de ses rayons** (ADR 0029) : la phrase dit ce qu'il faut amener —
     *  un cercle jusqu'au point visé —, et le plus large des siens pour mesurer l'écart. */
    OUT_OF_OUTPOST_REACH: (d) =>
      d.hasOutposts === true
        ? `hors de votre sol et du rayon de vos avant-postes — le plus large porte à ${num(d.reachKm)} km`
        : `hors de votre sol, et aucun avant-poste n’y porte son rayon`,
    DEPOSIT_REQUIRED: (d) =>
      `${buildingName(d.building)} se pose sur un gisement de ${depositNames(d.expected)} — visez son point`,
    DEPOSIT_TAKEN: () => 'ce gisement porte déjà une exploitation',
    NOT_COASTAL: () => 'un port se pose sur la côte',
    POINT_OUTSIDE_REGION: () => 'ce point n’est pas dans la région visée',
    /** « Trop près de l'usine : 30 km au moins » — le voisin nommé, et l'écart à tenir. */
    BUILDING_TOO_CLOSE: (d) => `trop près ${ofTheBuildingName(d.near)} : ${num(d.km)} km au moins`,
    ALREADY_QUEUED_HERE: () => 'un chantier est déjà en file sur ce bâtiment',
    RESEARCH_REQUIRED: (d) => researchRequired(d.card as ResearchCard),
    RESEARCH_DONE: (d) => `${cardName(d.card)} est déjà acquise`,
    RESEARCH_AFTER: (d) => `cherchez d’abord ${cardName(d.card)}`,
    RESEARCH_BUSY: (d) => `le QG cherche déjà ${cardName(d.card)} — une carte à la fois`,
    RESEARCH_NEEDS_HQ: () => 'posez d’abord votre quartier général — c’est lui qui cherche',
    MAX_LEVEL_REACHED: (d) => `niveau maximal atteint (${num(d.maximum)})`,
    HQ_ALREADY_BUILT: () => 'le quartier général est unique',
    /** **Le QG d'abord** (décision 1b du 13/09) : rien ne se bâtit avant lui, et la phrase dit
     *  l'ordre plutôt qu'un palier. */
    HQ_FIRST: () => 'posez d’abord votre quartier général — rien ne se bâtit avant lui',
    UNKNOWN_BUILDING: () => 'bâtiment inconnu',
    NOT_YOURS: () => 'ce bâtiment n’est pas à vous',
    /** **Le QG ne se rase pas** (question 39, 15/09) : sa destruction serait une révision de
     *  « jamais éliminé », et elle n'est pas tranchée. */
    HQ_NEVER_DEMOLISHED: () => 'le quartier général ne se rase pas',
    WRONG_PROJECTION_BUILDING: (d) =>
      `ce rôle se forme dans ${buildingName(d.expected)}, pas dans ${buildingName(d.found)}`,
    SINGLE_TIER_ROLE: () => 'ce rôle n’a qu’un seul palier',
    QUEUE_FULL: () => 'la file de ce site est pleine',
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
    /** Le remède est la recherche ; le nombre vient de `movementSlots`, servi par le serveur. */
    MOVEMENT_IN_FLIGHT: (d) =>
      `slots de mouvement tous engagés (${num(d.maximum)}) — chaque carte Transmissions en ouvre un`,
    NO_LAND_ROUTE: (d) => `aucune route terrestre de ${str(d.from)} à ${str(d.to)}`,
    NOT_ENOUGH_FUEL: (d) =>
      `plein trop court : ${d.roundTrip === true ? 'l’aller-retour de ' : ''}${num(d.km)} km demande${d.roundTrip === true ? '' : 'nt'} ${num(d.needed)} cran${plural(Number(d.needed), '', 's')} de plein, ${roleLabel(str(d.role) as UnitRole, 1).toLowerCase()} n’en porte que ${num(d.held)} — rechargez-la à l’ancre`,
    NOT_A_TRANSPORT: () => 'seuls un camion, un cargo ou un avion de transport se chargent',
    LOAD_NOT_A_SUPPLY: () =>
      'un transport ne prend ni vivres ni acier : munitions, pétrole, charbon',
    LOAD_AMOUNT_INVALID: () => 'on charge au moins un jeton, en nombre entier',
    FIRST_STEPS_INVALID: () => 'premiers pas illisibles',
    TRANSPORT_UNDERWAY: () => 'ce transport est en route : il se charge à l’arrêt',
    TRANSPORT_ON_TOUR: () => 'ce transport est en tournée : rappelez-le d’abord',
    LOAD_NOT_HERE: (d) =>
      d.role === 'cargo'
        ? 'un cargo se charge au port, ou au dépôt d’un avant-poste'
        : d.role === 'airTransport'
          ? 'un avion se charge à l’aérodrome, ou au dépôt d’une escale'
          : 'un camion se charge au QG ou à un entrepôt, ou au dépôt d’un avant-poste',
    NO_AIR_STOP: (d) =>
      `l’avion se pose à une escale : un avant-poste de niveau ${num(d.level)} au moins`,
    LOAD_FULL: (d) =>
      Number(d.room) <= 0
        ? `le transport est plein : ${num(d.capacity)} sur ${num(d.capacity)}`
        : `plus que ${num(d.room)} de place à bord, sur ${num(d.capacity)}`,
    NOTHING_TO_DELIVER: () => 'le transport est vide : chargez-le d’abord',
    DEPOT_NOT_STANDING: () => 'le point est encore en chantier : son dépôt n’existe pas',
    DEPOT_FULL: (d) => `le dépôt est plein : ${num(d.capacity)} au total`,
    AIRDROP_AIR_ONLY: () => 'seul un avion de transport largue : camions et cargos se posent',
    NO_SQUAD_THERE: () => 'aucune de vos escouades ne se tient là',
    SQUAD_ANCHORED: () => 'cette escouade est ancrée : elle se recharge seule, sans paquet',
    SQUAD_SUPPLIED: () =>
      'rien à reprendre : coups et plein de l’escouade sont au complet, ou le paquet n’est pas de ce qui lui manque',
    TOUR_NOT_AT_LOADING_POINT: (d) =>
      `une tournée part d’un point de chargement : amenez ${
        d.role === 'cargo'
          ? 'le cargo au port'
          : d.role === 'airTransport'
            ? 'l’avion à l’aérodrome'
            : 'le camion au QG ou à un entrepôt'
      }, ou au dépôt d’un avant-poste`,
    TOUR_NO_STOP: () =>
      'une tournée passe par un dépôt au moins : lâchez le transport sur un de vos avant-postes',
    TOUR_TOO_LONG: (d) => `une tournée compte ${num(d.maximum)} arrêts au plus`,
    TOUR_STOP_TWICE: () => 'ce dépôt est déjà un arrêt de la tournée',
    NOT_ON_TOUR: () => 'ce transport n’est pas en tournée',
    NO_ROUNDS: () =>
      'à sec : plus un coup dans la colonne — elle marche, elle n’attaque pas ; elle se recharge à l’ancre',
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
    SEALED: () => 'Dakar garde ces réserves : elles ne se pillent pas',
    CAPTURE_NEEDS_INFANTRY: () => 'seule l’infanterie capture : il en faut au moins une troupe',
    CAPTURE_ON_FOOT: () => 'l’infanterie capture à pied : débarquez-la d’abord',
    INSUFFICIENT_FUNDS: (d) =>
      d.needed === undefined
        ? 'les fonds ne suffisent pas'
        : `il faut ${num(d.needed)} fonds — on en tient ${num(d.held)}`,
    TROOP_BOUND_REACHED: () => 'l’état-major ne peut en suivre davantage',
    NOT_IN_BLITZ: () => 'en Blitz on ne bâtit rien : on capture',
    BLITZ_MAP_UNFAIR: () =>
      'aucune carte équitable sur ce théâtre pour ce nombre de joueurs — la partie revient au salon',
    BLITZ_MAP_FAILED: () => 'la carte de départ n’a pas pu se poser — la partie revient au salon',
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
    TRUCK_SEATS_INFANTRY: () => 'un camion ne porte que l’infanterie',
    NOT_ABOARD: () => 'cette troupe n’est à bord d’aucun transport',
    DISEMBARK_AT_SEA: () => 'on ne débarque pas au large — gagnez une côte ou un port',
    NOT_A_SQUAD: () => 'une escouade, ce sont plusieurs pièces au même point du plateau',
    NO_SQUADS_IN_BLITZ: () => 'pas d’escouade en Blitz : une pièce par unité',
    SQUAD_CARRIES_LOOT: () => 'l’escouade porte un butin posé : elle le garde, et reste ensemble',
    NO_ROOM_TO_DISBAND: () =>
      'trop près de la côte pour se disperser — éloignez l’escouade du rivage',
    STILL_ABOARD: () => 'cette troupe est à bord : débarquez-la d’abord',
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
    ONE_UNIT_ONLY: () => 'en Blitz, une unité part seule',
    OUTSIDE_THEATRE: () => 'hors du théâtre : la partie se joue dans son cadre',
    UNIT_TARGET_ONLY: () => 'en Blitz, une attaque vise une unité ennemie, pas un point',
    RELOADING: () => 'en rechargement : elle peut bouger, pas encore attaquer',
    BUILDING_OCCUPIED: () => 'une de vos unités tient déjà ce bâtiment — une seule par bâtiment',
    SITE_OCCUPIED: () =>
      'ce bâtiment n’est pas libre : une de vos unités s’y tient ou s’y forme — faites-la sortir pour recruter',
    ONE_GUN_ONLY: () => 'une pièce tire à la fois : levez une seule pièce d’artillerie',
    OUT_OF_GUNS_REACH: () => 'rien que l’artillerie puisse toucher : elle ne tire pas en l’air',
    ARTILLERY_ONLY: () => 'seule l’artillerie bombarde',
    INDIRECT_FIRE_ONLY: () => 'l’artillerie ne tire qu’à distance : bombardez',
    NOT_EMPLACED: (details) =>
      typeof details.seconds === 'number' && details.seconds > 0
        ? `pas encore en batterie : prête dans ${details.seconds} s`
        : 'pas encore en batterie : elle doit rester immobile un instant',
    TOO_CLOSE: (details) =>
      `trop près : ${num(details.km)} km, la zone morte en fait ${num(details.minimum)}`,
    ON_THE_MOVE: () => 'en route : l’artillerie ne tire qu’à l’arrêt',
    ABOARD: () => 'à bord d’un transport : une pièce transportée ne tire pas',
    OUT_OF_RANGE: (details) =>
      `hors de portée : ${num(details.km)} km pour ${num(details.maximum)}`,
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
    tabs: 'accès au dossier',
    haveFile: 'J’ai un dossier',
    openFile: 'Ouvrir un dossier',
    cardTitle: 'Carte d’accréditation',
    requestTitle: 'Demande d’accréditation',
    newCorrespondent: 'nouveau correspondant',
    cardNumber: (length: number) => `n° ${length === 0 ? '····' : String(length * 731 + 1940)}`,
    portraitCaption: 'photographie non exigée',
    nicknameLabel: 'nom de guerre',
    nicknamePlaceholder: 'le pseudo que la table lira',
    nicknameNote: '3 à 16 caractères — public, il signe vos télégrammes',
    nicknameFree: 'libre à l’écriture — le serveur tranchera',
    nicknameRule: '3 à 16 caractères visibles',
    passwordLabel: 'mot de passe',
    passwordPlaceholder: '••••••••',
    /** **Il n'y a pas d'e-mail** (ADR 0022), donc pas de « mot de passe oublié » : la phrase
     *  le dit avant la perte, pas après. */
    passwordNote:
      'aucun e-mail : un mot de passe perdu se remet à zéro par le tenancier du serveur',
    passwordRule: '8 caractères au moins',
    loginSubmit: 'entrer',
    registerSubmit: 'ouvrir le dossier',
    loginAndJoin: 'entrer et répondre présent',
    registerAndJoin: 'ouvrir le dossier et répondre présent',
    accredited: 'accrédité',
    fileOpened: 'dossier ouvert',
    pending: 'en ligne…',
    after:
      'Un compte, des places : vos parties vous suivent d’un appareil à l’autre. Une invitation reçue ? Ouvrez son lien, il mène droit à la table.',
    signedIn: (nickname: string) => `dossier ${ofName(nickname)}`,
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
  /** **Le télégramme d'invitation** (`/rejoindre/CODE`) : qui invite, la table, l'ordre, la
   *  réponse. Les refus sont des télégrammes « regrettons » (`fr.table.refusals`). */
  invitation: {
    opening: 'Ouverture de l’invitation…',
    tagline: 'une place vous attend à la table',
    readOrder: 'lire l’ordre d’opérations complet',
    setBy: (founder: string) => `réglé par ${founder} — il peut encore changer`,
    blitzOrder: (
      theatre: string | null,
      when: string | null,
    ): ReadonlyArray<readonly [string, string]> => [
      ['mode', 'Blitz — 2 h, tous ensemble'],
      ['théâtre', theatre ?? 'tiré au sort au lancement'],
      [
        'rendez-vous',
        when === null ? 'dès que la table est complète' : `${when}, dans votre heure`,
      ],
      ['nations', 'identiques : drapeau et figurines'],
      ['victoire', 'prendre le QG adverse ; à 2 h, le plus gros revenu'],
    ],
    mondialeOrder: (
      capture: number,
      durationHours: number,
    ): ReadonlyArray<readonly [string, string]> => [
      ['mode', `Mondiale — ${clockLabel(durationHours)}, deux ou trois visites par jour`],
      ['terrain', 'le monde entier'],
      ['capture d’un QG', `${capture} heures, suspendue pendant le repos du défenseur`],
      ['vos engagements', 'une plage de repos de 7 h, publique'],
      ['nations', 'une chacune, avec son atout'],
    ],
    reply: 'répondre',
    takeSeat: (founder: string) =>
      founder === '' ? 'Prendre place à la table' : `Prendre place à la table ${ofName(founder)}`,
    alreadySeated: 'déjà à table',
    yourSeat: (others: number) =>
      others === 0
        ? 'votre place, si vous la prenez'
        : `votre place, si vous la prenez — et ${others === 1 ? 'une autre libre' : `${num(others)} autres libres`}`,
    signedIn: (nickname: string) => `Vous entrez sous le nom ${ofName(nickname)}.`,
    notYou: 'Ce n’est pas vous ?',
    join: 'répondre présent — rejoindre la table',
    resume: 'reprendre ma place',
    oneFile:
      'Un dossier suffit : un nom de guerre et un mot de passe, sans e-mail. Vous arriverez droit au salon.',
    addRendezvous: 'ajouter le rendez-vous à l’agenda',
    chooseAtLobby: 'Vous choisirez votre nation et votre plage de repos au salon.',
    toHome: 'retour à l’accueil',
    bureauAnswer: 'réponse du bureau des dépêches',
    bureau: 'bureau des dépêches',
    doorClosed: 'la porte est fermée',
    myGames: 'à mes parties',
    retype: 'ressaisir le code',
    /** Le compte est né, la place non : le salon s'est rempli entre-temps. Le dossier est gardé. */
    accountKept: 'Votre dossier est ouvert et gardé — il vous attend à l’accueil.',
  },

  /** **La une de mon édition** (`/accueil`) : mes parties en articles, triés par urgence. */
  home: {
    edition: (nickname: string) => `le monde en jeu — édition ${ofName(nickname)}`,
    tagline: 'deux façons de faire la guerre entre amis — une soirée, ou une semaine',
    gamesCount: (count: number) => `${num(count)} partie${plural(count, '', 's')}`,
    onTheFront: 'à la une',
    emptyHeadline: 'Aucune partie à votre nom',
    emptyStand: 'Composez la vôtre, ou ouvrez le code qu’on vous a envoyé.',
    adsLabel: 'petites annonces',
    adCorner: 'petite annonce',
    foundEyebrow: 'I · fonder',
    foundTitle: 'Composer une partie',
    foundNote: 'Une soirée en Blitz, ou une semaine en Mondiale.',
    foundSubmit: 'composer l’ordre',
    joinEyebrow: 'II · rejoindre',
    joinTitle: 'J’ai un code',
    codeLabel: 'code de partie',
    codePlaceholder: 'K7P2QX',
    codeNote: 'Six caractères, reçus avec l’invitation.',
    joinSubmit: 'ouvrir le télégramme',
    compose: 'composer',
    haveCode: 'j’ai un code',
    othersHeader: 'vos autres parties',
    othersNote: 'de la plus pressante à la plus ancienne',
    atTable: 'à table',
    freeSeats: (count: number) => (count === 1 ? 'une place libre' : `${num(count)} places libres`),
    blitzLobbyHeadline: (at: number | null, now: number, theatre: string, seats: number) =>
      at === null
        ? `La Blitz ${ofPlace(theatre)} se jouera à ${spelled(seats)}, dès que la table est complète`
        : `${upperFirst(fr.table.dayWord(at, now))} à ${fr.table.shortHour(at)}, la Blitz ${ofPlace(theatre)} se joue à ${spelled(seats)}`,
    keptForYou: (founder: string, free: number) =>
      `${founder} vous a gardé une place.${free > 0 ? ` ${upperFirst(fr.home.freeSeats(free))}.` : ''}`,
    yourTable: (free: number) =>
      free === 0
        ? 'Votre table est complète.'
        : `Vous tenez la table : ${fr.home.freeSeats(free)}.`,
    lobbyCode: (code: string) => `salon ${code}`,
    lobbyHeadline: (seated: number, cap: number, ready: number, waiting: string) =>
      `${upperFirst(spelled(seated))} à table sur ${spelled(cap)}, ${ready === 0 ? 'aucun prêt' : `${spelled(ready)} prêt${plural(ready, '', 's')}`} : ${waiting}`,
    waitingNation: (blitz: boolean) =>
      blitz ? 'on attend votre drapeau' : 'on attend votre nation',
    waitingReady: 'on attend votre « prêt »',
    waitingLaunch: 'on vous attend pour lancer',
    waitingOthers: 'on attend les autres',
    blitzRunning: (theatre: string) => `La Blitz ${ofPlace(theatre)} est en cours`,
    mondialeRunning: (nation: string) => `La guerre court : ${nation} attend vos ordres`,
    observing: (nation: string) => `Défaite : vous observez la fin, depuis ${nation}`,
    endsIn: (left: string) => `fin dans ${left}`,
    dayOf: (launchedAt: number, now: number, durationHours: number) => {
      const days = Math.ceil(durationHours / 24);
      return `jour ${num(Math.min(days, Math.floor((now - launchedAt) / 86_400_000) + 1))} sur ${num(days)}`;
    },
    day: (at: number) =>
      new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(at)),
    joinTable: 'rejoindre la table',
    toLobby: 'au salon',
    resumeAs: (nation: string) => `reprendre — ${nation}`,
    observe: 'observer',
    readBack: 'relire la partie',
    concluded: 'conclue',
    concludedNoWinner: 'Saison close, sans vainqueur',
    won: (nation: string) => `${nation} l’emporte`,
    youWereDefeated: 'vous aviez déposé les armes',
    moreMenu: 'plus…',
    addToCalendar: 'ajouter à l’agenda',
    calendarTitle: (theatre: string) => `${fr.masthead.title} — Blitz ${ofPlace(theatre)}`,
    footerLeft: 'entre amis · sur invitation',
    footerRight: (date: string) => `édition ${date}`,
  },

  lobby: {
    preparingMap: 'L’état-major prépare la carte…',
    opening: 'Ouverture du salon…',
    quit: 'quitter',
    founder: 'fondateur',
    toBalance: 'à équilibrer',
    destroy: 'supprimer la partie',
    destroyConfirm: 'confirmer — tout est effacé',
    destroyCancel: 'annuler',
    destroyNote: 'la partie disparaît pour tous les joueurs, sans retour.',
    pace: (hours: number) =>
      hours < 72 ? `${num(hours)} heures` : `${num(Math.round(hours / 24))} jours`,
    paceNone: 'sans horloge',
  },

  /** **L'ordre d'opérations** (`/fonder`) : la fondation d'une partie, et le télégramme en face. */
  found: {
    back: '← à la une',
    number: 'ordre n° ····',
    title: 'Ordre d’opérations',
    sub: 'Le télégramme d’invitation s’écrit en face, mot pour mot. Tout se reprend au salon jusqu’au lancement.',
    modeTitle: 'Le mode',
    modeNote:
      'Le même jeu, deux façons de le jouer : l’horloge, l’économie et la victoire en découlent.',
    modes: {
      blitz: {
        span: 'une soirée',
        facts: [
          ['horloge', '2 h, tous présents à l’heure dite'],
          ['table', '2 à 4 joueurs, nations identiques'],
          ['terrain', 'un théâtre'],
          ['victoire', 'prendre le QG adverse ; à 2 h, le plus gros revenu'],
        ],
      },
      mondiale: {
        span: 'quelques jours',
        facts: [
          ['horloge', '3 à 14 jours, deux ou trois visites par jour'],
          ['table', '2 à 8 joueurs, une nation et son atout'],
          ['terrain', 'le monde entier'],
          ['victoire', 'quatre des Sept tenus 24 h, ou tous les QG adverses'],
        ],
      },
    } satisfies Record<
      SeasonMode,
      { span: string; facts: ReadonlyArray<readonly [string, string]> }
    >,
    theatreTitle: 'Le théâtre',
    theatreNote: 'On le traverse en vingt minutes. Il se change encore au salon.',
    theatreTag: {
      europe: 'plaines et détroits',
      mediterranean: 'une mer à tenir',
      pacific: 'des îles, des flottes',
      americas: 'deux continents, un canal',
    } satisfies Record<TheatreId, string>,
    drawNote: 'tiré au lancement',
    whenTitle: 'Le rendez-vous',
    whenNote: 'Tout le monde à table en même temps ; chacun lit l’heure dans son fuseau.',
    custom: 'autre heure',
    toChoose: 'à choisir',
    full: 'table complète',
    noHour: 'sans heure',
    customLabel: 'date et heure du rendez-vous',
    localTime: 'votre heure locale',
    remind: 'prévenir chaque joueur quinze minutes avant (notification)',
    durationTitle: 'La durée',
    durationNote:
      'L’horloge sert de filet : qui tient quatre points stratégiques vingt-quatre heures l’emporte avant.',
    captureTitle: 'La capture d’un QG',
    captureNote:
      'Le temps de capturer un quartier général à pleine force. Elle s’arrête pendant le repos du défenseur.',
    hours: (hours: number) => `${num(hours)} heures`,
    days: (days: number) => `${num(days)} jours`,
    captureTag: (hours: number) =>
      hours === 12 ? 'par défaut — la semaine bouge' : 'une journée pour répondre',
    seatsTitle: 'Les places',
    seatsNote: (blitz: boolean, max: number) =>
      blitz
        ? `Jusqu’à ${spelled(max)}. La table se ferme au lancement.`
        : `Jusqu’à ${spelled(max)}. Le monde entier ; vous lancez quand la table est prête.`,
    seats: (count: number) => `${num(count)} places`,
    nothingLeaves: 'Rien ne part avant que vous partagiez le lien.',
    submit: 'fonder — obtenir le code',
    preview: 'ce que vos invités recevront',
    previewLabel: 'aperçu de l’invitation',
    previewNote:
      'Le même texte ouvre la page d’invitation, au-dessus de la table et de qui y est déjà assis.',
  },

  /** **La table d'état-major** (`/salon`) et ce qu'elle partage avec la une et le télégramme. */
  table: {
    you: 'vous',
    draw: 'Au sort',
    world: 'Le monde',
    world1940: 'Le monde, 1940',
    generalMap: 'carte générale',
    worldSheet: 'carte générale',
    theatreSheet: 'théâtre',
    staffSheet: (sheet: string) => `état-major · ${sheet}`,
    worldKm: '0 · 2500 · 5000 km',
    worldSeas: [
      ['Océan Pacifique', -128, 4, 1],
      ['Atlantique', -38, 30, 1],
      ['Océan Indien', 78, -20, 1],
    ] as ReadonlyArray<readonly [string, number, number, number]>,
    sheets: {
      europe: {
        title: 'Théâtre d’Europe',
        sheet: 'feuille I',
        km: '0 · 250 · 500 km',
        seas: [
          ['Atlantique', -7, 47, 1],
          ['mer du Nord', 3.2, 56.5, 0.8],
          ['Méditerranée', 18, 35.6, 0.8],
          ['Baltique', 19.5, 57.8, 0.7],
        ],
      },
      mediterranean: {
        title: 'Théâtre de la Méditerranée',
        sheet: 'feuille II',
        km: '0 · 200 · 400 km',
        seas: [
          ['Méditerranée', 17, 34.2, 1],
          ['mer Noire', 34, 43.3, 0.7],
          ['Atlantique', -8, 33, 0.7],
        ],
      },
      pacific: {
        title: 'Théâtre du Pacifique',
        sheet: 'feuille III',
        km: '0 · 1000 · 2000 km',
        seas: [
          ['Océan Pacifique', 185, 10, 1.1],
          ['mer de Corail', 156, -18, 0.7],
          ['mer de Chine', 114, 14, 0.7],
        ],
      },
      americas: {
        title: 'Théâtre des Amériques',
        sheet: 'feuille IV',
        km: '0 · 1000 · 2000 km',
        seas: [
          ['Atlantique', -45, 25, 1],
          ['Pacifique', -112, 2, 1],
          ['mer des Caraïbes', -76, 14.5, 0.7],
        ],
      },
    } satisfies Record<
      TheatreId,
      {
        title: string;
        sheet: string;
        km: string;
        seas: ReadonlyArray<readonly [string, number, number, number]>;
      }
    >,
    shortNation: {
      france: 'France',
      uk: 'R.-Uni',
      usa: 'É.-Unis',
      ussr: 'URSS',
      germany: 'Allemagne',
      japan: 'Japon',
      italy: 'Italie',
      china: 'Chine',
    } satisfies Record<Nation, string>,
    lobbyOf: (mode: string, pace: string) => `salon · ${mode}, ${pace}`,
    codeLabel: 'code de partie',
    rendezvous: 'rendez-vous',
    rendezvousOn: (theatre: string) => `rendez-vous · ${theatre}`,
    rendezvousAria: (when: string, left: string) => `Rendez-vous ${when}, dans ${left}`,
    in: 'dans',
    whenFull: 'dès que la table est complète',
    hour: (at: number) =>
      new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(at)),
    shortHour: (at: number) => {
      const date = new Date(at);
      const minutes = date.getMinutes();
      return `${date.getHours()} h${minutes === 0 ? '' : ` ${String(minutes).padStart(2, '0')}`}`;
    },
    clock: (minutes: number) =>
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
    /** « ce soir », « demain », ou le jour en toutes lettres. */
    dayWord: (at: number, now: number) => {
      const day = (instant: number) => {
        const date = new Date(instant);
        return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
      };
      const gap = day(at) - day(now);
      if (gap === 0) return new Date(at).getHours() >= 18 ? 'ce soir' : 'aujourd’hui';
      if (gap === 1) return 'demain';
      return new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date(at));
    },
    worldClock: (durationHours: number) => `le monde · ${clockLabel(durationHours)}`,
    captureLine: (hours: number) => `capture d’un QG en ${num(hours)} heures`,
    invite: (free: number) => `inviter · ${num(free)} place${plural(free, '', 's')}`,
    inviteLabel: 'inviter',
    full: 'table complète',
    onlySecret: 'code de partie — le seul secret',
    copyLink: 'copier le lien',
    copyCode: 'copier le code',
    linkCopied: 'Lien d’invitation copié.',
    codeCopied: (code: string) => `Code ${code} copié.`,
    sections: 'sections du salon',
    tabs: { table: 'table', ordre: 'ordre', wire: 'télégraphe' },
    tableLabel: 'la table',
    freeSeat: 'place libre',
    offerLink: 'offrir le lien',
    toChoose: (blitz: boolean) => (blitz ? 'drapeau à choisir' : 'nation à choisir'),
    atTable: 'à la table',
    away: 'absent',
    awayFor: (minutes: number) =>
      minutes < 1 ? 'vient de quitter la table' : `parti il y a ${num(minutes)} min`,
    ready: 'prêt',
    restRange: (start: number, end: number) =>
      `repos ${fr.table.clock(start)}–${fr.table.clock(end)}`,
    seatAria: (seat: {
      nickname: string;
      mine: boolean;
      founder: boolean;
      nation: string | null;
      blitz: boolean;
      presence: string;
      ready: boolean;
    }) =>
      [
        `${seat.nickname}${seat.mine ? ' (vous)' : ''}${seat.founder ? ', fondateur' : ''}`,
        seat.nation ?? (seat.blitz ? 'sans drapeau' : 'sans nation'),
        seat.presence,
        seat.ready ? 'prêt' : 'pas prêt',
      ].join(' — '),
    postsDrawn: 'postes de départ tirés au lancement',
    nationsInk: 'chaque nation retenue s’encre sur la carte',
    yourFlag: 'votre drapeau',
    yourNation: 'votre nation',
    identical: 'en Blitz, les nations sont identiques : drapeau et figurines',
    firstCome: 'premier arrivé, premier servi',
    takenBy: (nickname: string) => `prise par ${nickname}`,
    restFrom: 'repos dès',
    restLabel: 'début de votre plage de repos, heure locale',
    restUntil: (end: string) => `jusqu’à ${end} · publique`,
    readyStamp: 'tamponner « prêt »',
    readyLift: '× prêt — lever',
    chooseFirst: (blitz: boolean) => (blitz ? 'choisir un drapeau' : 'choisir une nation'),
    launchBlitz: 'lancer la partie — irréversible',
    launchSeason: 'lancer la saison — irréversible',
    allReadyYou: 'Toute la table est prête : à vous de lancer.',
    allReadyFounder: (founder: string) => `Toute la table est prête : ${founder} peut lancer.`,
    waitYourNation: (blitz: boolean) => (blitz ? 'votre drapeau' : 'votre nation'),
    waitNationOf: (nickname: string, blitz: boolean) =>
      `${blitz ? 'le drapeau' : 'la nation'} ${ofName(nickname)}`,
    waitAtTable: (nickname: string) => `${nickname} à la table`,
    waitReady: (count: number) => `${spelled(count)} « prêt »`,
    waitSecond: 'un deuxième joueur',
    waitingFor: (parts: ReadonlyArray<string>) =>
      parts.length === 0 ? '' : `On attend ${parts.join(', ')}.`,
    withoutAbsents: (hour: string) =>
      ` À ${hour}, vous pourrez lancer sans attendre les absents : ils vous rejoindront en route.`,
    hourCome: ' L’heure est passée : lancez, les absents vous rejoindront en route.',
    setAnHour: ' Fixez une heure : passée, vous lancerez sans attendre les absents.',
    orderChanged: (what: string) => `${what} : l’ordre a changé, les « prêt » sont levés.`,
    edit: 'modifier',
    done: 'terminer',
    by: (founder: string) => `par ${founder}`,
    theatre: 'théâtre',
    onTheMap: 'se choisit sur la carte',
    seatsTerm: 'places',
    seatsOf: (seated: number, cap: number) => `${num(seated)} sur ${num(cap)}`,
    seatLess: 'une place de moins',
    seatMore: 'une place de plus',
    victory: 'victoire',
    blitzVictory: 'prendre le QG adverse',
    duration: 'durée',
    durationNet: 'l’horloge sert de filet : quatre points tenus 24 h l’emportent avant',
    hqCapture: 'capture d’un QG',
    captureRest: 'suspendue pendant le repos du défenseur',
    remindShort: 'rappel 15 min avant',
    remindOn: 'Rappel 15 min avant',
    remindOff: 'Sans rappel',
    liftsReady: 'Chaque modification lève les « prêt ».',
    wholeOrder: 'tout l’ordre',
    blitzMore: [
      ['horloge', '2 h, tous ensemble'],
      ['nations', 'identiques : drapeau et figurines'],
      ['départ', 'un QG, une caserne, un fantassin chacun ; postes tirés au lancement'],
      ['à 2 h', 'le plus gros revenu l’emporte'],
      [
        'absent à l’heure',
        'le fondateur peut lancer sans l’attendre ; il garde sa place et rejoint en route',
      ],
      ['après le lancement', 'la table se ferme'],
    ] as ReadonlyArray<readonly [string, string]>,
    mondialeMore: (
      founder: string | null,
      durationHours: number,
    ): ReadonlyArray<readonly [string, string]> => [
      ['horloge', `${clockLabel(durationHours)}, deux ou trois visites par jour`],
      ['terrain', 'le monde entier'],
      ['nations', 'une chacune, avec son atout'],
      ['victoire', 'quatre des Sept tenus 24 h, ou tous les QG adverses'],
      ['après le départ', 'la table se ferme'],
      ['départ', founder === null ? 'quand vous lancez' : `quand ${founder} lance`],
    ],
    generalChannel: 'canal général',
    privateWith: (nickname: string) => `conversation privée avec ${nickname}`,
    fold: 'replier',
    foldWire: 'replier le télégraphe',
    open: 'ouvrir',
    openWire: (unread: number) =>
      unread === 0 ? 'ouvrir le télégraphe' : `ouvrir le télégraphe, ${num(unread)} non lus`,
    wireSilent: 'La ligne est muette — personne n’a encore télégraphié.',
    telegram: {
      title: 'TÉLÉGRAMME',
      number: (code: string) => `n° ${code}`,
      stop: 'STOP',
      service: 'la manchette · service des dépêches',
      label: (text: string) => `Télégramme : ${text.replace(/ STOP/g, '.')}`,
      origin: 'origine',
      words: 'mots',
      filed: 'déposé',
      link: 'lien',
      answer: 'réponse',
      none: 'aucune',
      paid: 'indications de service : réponse payée',
      regrets: 'indications de service : regrets',
      valid: 'valable jusqu’au lancement',
      file: 'à classer',
      tableOf: (founder: string) => `table ${ofName(founder)}`,
      filedAt: (at: number) =>
        new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
          .format(new Date(at))
          .replace('/', '·')
          .replace(' ', ' '),
      blitzLines: ({
        from,
        theatre,
        when,
        seats,
      }: {
        from: string;
        theatre: string | null;
        when: string | null;
        seats: { taken: number | null; cap: number };
      }) => [
        `${from} vous convie à sa table`,
        theatre === null
          ? 'Blitz STOP théâtre tiré au sort STOP deux heures de jeu'
          : `Blitz — ${theatre} STOP deux heures de jeu`,
        when === null ? 'Rendez-vous dès que la table est complète' : `Rendez-vous ${when}`,
        seats.taken === null
          ? `${spelled(seats.cap)} places STOP nations identiques`
          : `${spelledFeminine(seats.taken)} place${plural(seats.taken, '', 's')} prise${plural(seats.taken, '', 's')} sur ${spelled(seats.cap)}`,
        'Soyez présent à l’heure',
      ],
      mondialeLines: ({
        from,
        capture,
        days,
        seats,
      }: {
        from: string;
        capture: number;
        days: number;
        seats: { taken: number | null; cap: number };
      }) => [
        `${from} vous convie`,
        `Mondiale STOP ${spelled(days)} jours STOP le monde entier`,
        'Départ quand la table est prête',
        `Capture d’un QG en ${capture === 24 ? 'vingt-quatre' : 'douze'} heures`,
        seats.taken === null
          ? `Jusqu’à ${spelled(seats.cap)} places STOP choisissez votre nation`
          : `${spelledFeminine(seats.taken)} place${plural(seats.taken, '', 's')} prise${plural(seats.taken, '', 's')} sur ${spelled(seats.cap)}`,
      ],
    },
    /** **Chaque refus de `joinRefusalOf` a son télégramme et son issue** (choix 19). */
    refusals: {
      BLITZ_FULL: (c: RefusalContext) => ({
        title: 'Table complète',
        lines: [
          'Regrettons',
          `La table${c.founder === null ? '' : ` ${ofName(c.founder)}`} est complète`,
          `${spelled(c.maximum)} joueurs sur ${spelled(c.maximum)}`,
        ],
        paragraph:
          'Les chaises sont prises. Rien n’est perdu : composez la vôtre, avec les mêmes réglages.',
        found:
          c.theatre === null
            ? 'fonder une Blitz à mon tour'
            : `fonder une Blitz ${ofPlace(c.theatre)} à mon tour`,
      }),
      LOBBY_FULL: (c: RefusalContext) => ({
        title: 'Salon complet',
        lines: [
          'Regrettons',
          `Le salon${c.founder === null ? '' : ` ${ofName(c.founder)}`} est complet`,
          `${spelled(c.maximum)} joueurs sur ${spelled(c.maximum)}`,
        ],
        paragraph: 'Toutes les places de cette Mondiale sont prises.',
        found: 'composer une Mondiale',
      }),
      BLITZ_STARTED: (c: RefusalContext) => ({
        title: 'Partie commencée',
        lines: ['Regrettons', 'La Blitz a commencé', 'Elle ne se rejoint pas en cours'],
        paragraph:
          'Une Blitz se joue ensemble, du premier ordre au dernier : la table s’est fermée au lancement.',
        found: c.theatre === null ? 'fonder une Blitz' : `fonder une Blitz ${ofPlace(c.theatre)}`,
      }),
      REGISTRATION_CLOSED: () => ({
        title: 'Partie commencée',
        lines: ['Regrettons', 'La Mondiale a commencé', 'Elle ne se rejoint pas en cours'],
        paragraph:
          'Une Mondiale se joue entre ceux qui étaient au départ : la table s’est fermée au lancement.',
        found: 'composer une Mondiale',
      }),
      SEASON_CONCLUDED: () => ({
        title: 'Saison conclue',
        lines: ['Regrettons', 'Cette saison est conclue'],
        paragraph:
          'Elle se relit, elle ne se joue plus — et seuls ceux qui y avaient une place la relisent.',
        found: null,
      }),
      UNKNOWN_GAME_CODE: () => ({
        title: 'Code inconnu',
        lines: ['Code inconnu', 'Vérifiez les six caractères', 'Ni O ni 0 ni I ni 1'],
        paragraph:
          'Aucune partie ne porte ce code. Une faute de frappe, ou une partie mise au rebut par son fondateur.',
        found: null,
      }),
    } satisfies Record<
      Exclude<JoinRefusal, 'SEAT_TAKEN'> | 'UNKNOWN_GAME_CODE',
      (c: RefusalContext) => {
        title: string;
        lines: string[];
        paragraph: string;
        found: string | null;
      }
    >,
  },

  /** Le film de 30 s, à la demande : un lien discret sur les deux pages d'entrée. */
  film: {
    open: 'voir le film d’annonce — 30 s',
    title: 'le film d’annonce',
    unavailable: 'Le film n’est pas disponible pour l’instant.',
  },

  /** **La une** (`/` sans session, page publique du 14/10/2026) : une édition qu'on déplie — la
   *  une, puis sa photographie, qui est la table, et des coupures que la table joue. On entre sur
   *  invitation (marque-1c) : un code, ou un compte déjà ouvert. */
  front: {
    /** La date du jour en tête de page, longue au bureau, abrégée sur téléphone. */
    date: (at: Date) =>
      new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(at),
    dateline: 'le monde en jeu',
    datelineLong: ' — édition de guerre',
    onInvitation: 'sur invitation',
    film: 'voir le film (30 s)',
    unfold: 'dépliez l’édition',
    engraving: 'gravure de la carte…',
    caption:
      'Notre photographie : la table, ce matin, au-dessus de la Manche. Rien n’y est retouché : c’est le jeu.',
    headline: 'Une soirée ou sept jours pour refaire le monde',
    lede: 'Huit nations de 1940 sur la carte du monde réel, des ordres qui partent et ne reviennent pas. Deux éditions, une même table.',
    editions: [
      {
        kicker: 'L’édition du soir',
        name: 'Blitz',
        meta: '1 à 2 h · 2 à 4 joueurs présents · un théâtre',
        text: 'On prend des villes, on forme ses troupes, on tombe le quartier général d’en face.',
      },
      {
        kicker: 'L’hebdomadaire',
        name: 'Mondiale',
        meta: '7 jours · 2 à 8 joueurs · le monde',
        text: 'Deux ou trois visites par jour, sept points à tenir, une presse toutes les trois heures.',
      },
    ],
    haveCode: 'j’ai un code',
    signIn: 'se connecter',
    briefs: [
      {
        kicker: 'Le front',
        text: 'Les pièces se lèvent et se posent comme aux échecs.',
        page: 'Page 2',
      },
      {
        kicker: 'Renseignement',
        text: 'Ce que vous savez de l’ennemi pâlit à l’encre.',
        page: 'Page 3',
      },
      {
        kicker: 'L’assaut',
        text: 'On frappe le premier ; l’infanterie capture Berne.',
        page: 'Page 4',
      },
      { kicker: 'La course', text: 'Sept lieux réels, une règle cassée chacun.', page: 'Page 5' },
    ],

    /** La feuille d'Europe : ce qui y est gravé, au crayon et à l'encre de mer. */
    sheet: {
      cartouche: 'ÉTAT-MAJOR  ·  FEUILLE  D’EUROPE',
      seas: {
        atlantic: 'Océan Atlantique',
        mediterranean: 'Méditerranée',
        northSea: 'Mer du Nord',
        channel: 'La Manche',
        blackSea: 'Mer Noire',
      },
      km: (km: number) => `${km} km`,
      north: 'N',
    },

    pieces: {
      pile: 'pile · la mienne',
      infantry: 'Infanterie',
      post: 'avant-poste · le mien',
      postLevel: 'Niv. 3',
      reach: 'portée',
      reachKm: '240 km',
      surveyedAgo: (time: string, hours: number) =>
        hours === 0 ? `relevé · ${time}` : `relevé de ${time} · il y a ${hours} h`,
      estimatedHeading: 'cap estimé',
      southWest: 'sud-ouest',
      atContact: (time: string) => `au contact · ${time}`,
      infantryOne: 'infanterie ×1',
      men: (count: number) => `${count} hommes`,
      armorOne: 'blindé ×1',
      panzer: 'Panzer IV',
      openField: 'rase campagne',
      unsheltered: 'sans abri',
      berne: 'Berne',
      town: 'ville',
      townMine: 'ville · la mienne',
      capture: 'capture · infanterie',
      capturing: 'En cours',
      taken: 'Capturée',
      forces: 'forces',
      forcesValue: '10 / 10',
      forceInField: 'la force devant Berne',
      enemyForce: 'force relevée',
    },

    /** La carte d'envoi au point posé : ce que le serveur daterait, en jeu. */
    send: {
      toward: (place: string) => `vers ${place}`,
      here: 'le point visé',
      arrival: (time: string) => `arrivée ${time}`,
      slots: '1 mouvement sur 2',
    },

    founded: 'fondé',

    /** Les lieux où la compagnie se pose, et les villes que la nuit allume. */
    places: {
      verdun: 'Verdun',
      metz: 'Metz',
      nancy: 'Nancy',
      reims: 'Reims',
      strasbourg: 'Strasbourg',
      saarbrucken: 'Sarrebruck',
      brussels: 'Bruxelles',
      lille: 'Lille',
      lyon: 'Lyon',
      paris: 'Paris',
    },
    cities: {
      paris: 'Paris',
      london: 'Londres',
      berlin: 'Berlin',
      rome: 'Rome',
      madrid: 'Madrid',
      moscow: 'Moscou',
      warsaw: 'Varsovie',
      cairo: 'Le Caire',
      istanbul: 'Istanbul',
      stockholm: 'Stockholm',
    },

    pages: {
      front: {
        folio: 'Page 2 · le front',
        time: '14:05',
        title: 'On lève la pièce, on la pose, l’ordre part',
        chapo: 'Pas de menu : le mouvement s’ordonne sur la carte, et nulle part ailleurs.',
        body: 'Levée, la compagnie suit la main ; posée, la rose dit ce qu’on peut faire là. La route et l’heure d’arrivée viennent du serveur. On envoie, un mouvement est pris — et c’est irréversible.',
        steps: ['lever', 'poser', 'choisir', 'envoyer', 'arriver'],
        legend: 'À vous : cliquez la compagnie, puis un point de la carte.',
      },
      fog: {
        folio: 'Page 3 · renseignement',
        time: '09:40',
        title: 'L’ennemi n’a pas de visage, seulement une date',
        chapo: 'Vous ne voyez de l’autre que ce que vos postes relèvent, et le relevé vieillit.',
        body: 'Une colonne traverse la portée de votre avant-poste : on en garde le tronçon, le cap, une heure. Jamais la destination, la composition ni la nation — une annotation à l’encre, qui pâlit.',
        age: 'âge du relevé',
        ageNow: 'à jour',
        ageAgo: (hours: number) =>
          `il y a ${hours} h${hours >= 6 ? ' · dernière position connue' : ''}`,
        statesLabel: 'Les trois états d’une région',
        states: ['vierge, au crayon', 'relevée, gravée', 'à jour, à l’encre'],
      },
      battle: {
        folio: 'Page 4 · l’assaut',
        time: '15:12',
        title: 'Berne change de main',
        chapo:
          'L’attaquant frappe le premier ; le défenseur riposte avec ce qui lui reste. À l’abri d’une garnison il encaisserait moins — en rase campagne, rien ne le couvre. Puis l’infanterie entre dans la ville, et la capture.',
        steps: ['ordre', 'frappe', 'riposte', 'repli', 'capture'],
        dispatch:
          '15:12 — DEVANT BERNE. Notre assaut a frappé le premier ; l’adversaire a riposté puis s’est replié. 15:54 — BERNE EST À NOUS.',
        legend:
          'Seule l’infanterie capture, au rythme de ses forces. Au feu, on voit qui l’on affronte : rôles, effectifs, nation.',
        replay: 'rejouer',
        takenAt: '15:54',
      },
      race: {
        folio: 'Page 5 · la course aux Sept',
        day: (day: number) => `jour ${day}`,
        title: 'La course aux Sept',
        chapo:
          'Sept lieux réels de 1940, tirés au sort à chaque saison. Qui en tient quatre, vingt-quatre heures d’affilée, prend la saison.',
        tableLabel: 'Points tenus',
        belligerent: 'Belligérant',
        points: 'points',
        held: 'tenus',
        waiting: 'Les Sept attendent leurs teneurs.',
        takes: (nation: string, point: string) => `${nation} prend ${point}.`,
        three: (nation: string) =>
          `${nation} tient trois des Sept. Il lui en faut quatre, vingt-quatre heures durant.`,
        winsIn: (nation: string) => `${nation} prend Malte et tient quatre des Sept. Victoire dans`,
        ifNothingMoves: 'si rien ne bouge.',
        countdown: (minutes: number) =>
          `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`,
        legend: 'Chaque lieu casse une règle pour qui le tient. Survolez ou touchez un jalon.',
        /** Les nations de la course, avec leur article, en tête de phrase. */
        nations: {
          uk: 'Le Royaume-Uni',
          germany: 'L’Allemagne',
          italy: 'L’Italie',
          ussr: 'L’U.R.S.S.',
        } satisfies Partial<Record<Nation, string>>,
        sites: {
          gibraltar: ['Gibraltar', 'Le détroit est fermé à vos rivaux, sauf à qui vous l’ouvrez.'],
          malta: ['Malte', 'Vos garnisons tirent avant l’assaillant.'],
          suez: ['Suez', 'Une fois par jour, un de vos mouvements partis change de destination.'],
          istanbul: [
            'Istanbul',
            'Une fois par jour, vous lisez le dernier télégramme entre deux joueurs.',
          ],
          narvik: ['Narvik', 'Vos exploitations produisent même hors réseau.'],
          baku: ['Bakou', 'Vos motorisés font le plein partout.'],
          lisbon: ['Lisbonne', 'Vous lisez la nation de tout ce que vous relevez.'],
        } satisfies Record<RacePoint, readonly [string, string]>,
      },
      night: {
        folio: 'Page 6 · chronique',
        title: 'La nuit tombe sur l’Europe',
        chapo: 'Le jour suit le vrai soleil : il fait nuit à Paris quand il fait nuit à Paris.',
        body: 'Faites défiler : l’ombre gagne d’est en ouest, chaque ville s’allume à son crépuscule. Du décor — et l’heure à laquelle dorment vos adversaires.',
        clock: (at: number, zone: string) =>
          new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: zone })
            .format(at)
            .replace(':', ' h '),
        cities: { london: 'Londres', paris: 'Paris', moscow: 'Moscou' },
      },
      press: {
        folio: 'Page 7 · la presse',
        edition: 'édition de 15:00',
        title: 'La presse tient les comptes',
        chapo: 'Toutes les trois heures, une édition. Entre deux, le classement ne bouge pas.',
        tableLabel: 'Classement de l’édition',
        rank: 'rang',
        nation: 'nation',
        territory: 'territoire',
        general: 'général',
        rows: [
          { nation: 'uk', pseudo: 'Brisquard', territory: '31 %', general: '4 820' },
          { nation: 'ussr', pseudo: 'Colonel Plume', territory: '27 %', general: '4 410' },
          { nation: 'germany', pseudo: 'Mlle Sextant', territory: '24 %', general: '3 960' },
          { nation: 'italy', pseudo: 'Le Doyen', territory: '18 %', general: '2 705' },
        ] satisfies ReadonlyArray<{
          nation: Nation;
          pseudo: string;
          territory: string;
          general: string;
        }>,
        telegraph: 'télégraphe · canal général',
        wires: [
          ['Brisquard', 'Malte tombera avant l’édition de 18 h.'],
          ['Mlle Sextant', 'On en reparle à Gibraltar.'],
          ['Colonel Plume', 'Je ne dis rien. STOP.'],
        ],
      },
    },

    /** Les deux portes, au bout de l'édition : on n'entre pas seul. */
    bureau: {
      folio: 'Bureau des engagements',
      title: 'Prenez votre place à la table',
      chapo: 'On n’entre pas seul : un ami vous a envoyé un lien, ou un code.',
      codeTitle: 'J’ai un code d’invitation',
      codeHint: 'Six caractères, reçus avec l’invitation.',
      open: 'ouvrir l’invitation',
    },
    footer: 'La Manchette · le monde en jeu, édition de guerre · Fond de carte : Natural Earth',
    staged: 'Les scènes sont jouées : aucune partie réelle n’y figure.',
    credits: 'crédits',
    /** Le chemin inverse, au pied de la connexion et de l'invitation (`SheetExit`). */
    back: 'retour à la une',
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
    /** Décor seulement : aucune règle ne lit le terrain (fiche 08, « ni grille, ni terrain »). */
    regionTerrain: (terrain: string) => `terrain : ${terrain}`,
    regionCoastal: 'côtière',
  },

  banner: {
    home: 'retour à l’accueil — vos parties',
    unread: (count: number) =>
      `${count} dépêche${plural(count, '', 's')} non lue${plural(count, '', 's')}`,
    slotsCount: (used: number, total: number) => `${used} / ${total}`,
    slotsTitle: (used: number, total: number, cards: ReadonlyArray<ResearchCard> = []) =>
      `mouvements en vol : ${used} / ${total}. Deux slots au départ, un de plus par carte Transmissions.${cards.map((card) => ` ${RESEARCH_NAMES[card]} : +1.`).join('')}`,
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
    /** Cinq colonnes sur un téléphone : l'étiquette tient à peu près dans la sienne. */
    drySoonShort: (hours: number) => `à sec ${num(hours)} h`,
    /** **Trois lettres par colonne sous le seuil** (passe 2, A1) : cinq colonnes sur un téléphone,
     *  et le nom entier revient au toucher, dans la même carte que le plafond et le débit. */
    abbreviations: {
      food: 'viv',
      coal: 'cha',
      oil: 'pét',
      steel: 'aci',
      ammunition: 'mun',
    } satisfies Record<ResourceKey, string>,
    slots: 'mouvements',
  },

  /**
   * **Le ticket d'une réserve** (issue #121) : la production, la consommation et le solde, avec le
   * détail par catégorie. Le solde est le débit net du bandeau, jamais un second chiffre.
   */
  ledger: {
    title: (resource: string) => `Registre : ${resource}`,
    pin: (resource: string) => `Épingler le registre : ${resource}`,
    unpin: 'Décrocher',
    production: 'Production',
    consumption: 'Consommation',
    balance: 'Solde',
    perHour: (value: number) => `${value > 0 ? '+' : ''}${tenths(value)} / h`,
    dryIn: (hours: number) => `À sec dans ${Math.max(1, Math.round(hours))} h.`,
    dry: 'À sec.',
    fullIn: (hours: number) => `Plein dans ${Math.max(1, Math.round(hours))} h.`,
    steady: 'Stable.',
    sections: {
      buildings: 'Bâtiments',
      troops: 'Troupes',
      outposts: 'Avant-postes',
      listening: 'Écoutes',
      factory: 'Usine',
    },
    empty: {
      buildings: 'Aucun gisement exploité.',
      troops: 'Aucune troupe à nourrir.',
      outposts: 'Aucun avant-poste debout.',
      listening: 'Aucune écoute ne brûle.',
      factory: 'Aucune chaîne n’y touche.',
    },
    site: (building: string, region: string, level: number, linked: boolean) =>
      `${building} ${ofName(region)} · niv. ${level}${linked ? '' : ' · coupé'}`,
    chain: (building: string, level: number) => `${building} · niv. ${level}`,
    ranks: (from: number, to: number, rate: number, outside: boolean) =>
      `${from === to ? `Rang ${from}` : `Rangs ${from} à ${to}`}${outside ? ', hors ancrage' : ''}` +
      ` · ${outside ? `2 × ${rate}` : rate} par troupe`,
    /** Sous les traits de l'armée : le coût de la prochaine troupe et du palier d'après. */
    tallyNote: (rate: number, nextAt: number | null, nextRate: number | null) =>
      `Un trait par troupe, plus haut à chaque palier ; hachuré, hors ancrage, ×2. Pointillé : la prochaine, ${rate} / h${
        nextAt === null || nextRate === null ? '' : `, puis ${nextRate} / h dès la ${nextAt}ᵉ`
      }.`,
    outpost: (region: string | null, level: number) =>
      `${region === null ? 'Avant-poste' : `Avant-poste ${ofName(region)}`} · niv. ${level}`,
    station: (region: string | null, outpost: boolean) =>
      `${outpost ? 'Avant-poste d’écoute' : 'Station d’écoute'}${region === null ? '' : ` ${ofName(region)}`}`,
    /** Ce qui arrête une réserve, et ce qui la répare (`ledgerNotesOf`). */
    starving:
      'À sec : les files de recrutement sont à l’arrêt. Rien n’est perdu, aucune troupe ne meurt — elles repartent dès que les vivres reviennent.',
    starvedChain: (building: string, resource: string, a: string) =>
      `${building} à sec de ${lowerFirst(resource)} — bâtissez ou élevez ${a}.`,
    listeningSilent:
      'Écoutes muettes — plus de charbon. Une mine sur du charbon, ou du charbon livré, les fera entendre de nouveau.',
    noProducer: (none: string) =>
      `${none.charAt(0).toUpperCase()}${none.slice(1)} : rien ne remplit cette réserve.`,
    allSupplied: 'Toutes ravitaillées : sol national ou rayon d’un avant-poste.',
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
    economy: { title: 'Plateau personnel — stocks, tuiles et pièces', label: 'écon.' },
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
    open: (waiting: number, blitz = false) =>
      `${waiting > 0 ? `${num(waiting)} à faire — ` : ''}ouvrir le menu : à faire, ${blitz ? '' : 'chantiers, '}journal, ${blitz ? '' : 'presse, '}télégraphe, réglages`,
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
      cause,
      attacking,
      won,
      mine,
      theirs,
      outpostDisabled,
      shock = false,
      faced,
    }: {
      where: string;
      cause: 'arrival' | 'interception' | 'bombardment';
      attacking: boolean;
      won: boolean;
      mine: { troops: number; lost: number; routed: number; destroyed: number };
      theirs: { troops: number; lost: number; routed: number; destroyed: number };
      outpostDisabled: boolean;
      shock?: boolean;
      faced?: Faced | undefined;
    }) => {
      /** **Un bombardement** (B20) : une frappe à distance, sans riposte possible. La salve bornée
       *  (ADR 0028 §6) dit combien de troupes elle touche ; la cible ne sait pas d'où elle vient. */
      if (cause === 'bombardment') {
        const { lost, troops, destroyed } = attacking ? theirs : mine;
        const salvo = troops > 1;
        const target = attacking ? 'cible' : 'unité';
        const fell =
          destroyed === 0
            ? ''
            : salvo
              ? ` · ${destroyed} détruite${destroyed > 1 ? 's' : ''}`
              : ` · ${target} détruite`;
        if (attacking)
          return `bombardement ${where} — ${faced ? `sur ${facedWords(faced)}, ` : ''}${salvo ? `notre salve touche ${troops} troupes et en abat` : 'notre tir en abat'} ${lost}, sans riposte possible${fell}`;
        return `bombardés ${where} — ${salvo ? `une salve venue d’on ne sait où touche ${troops} de nos troupes et en abat` : 'leur tir en abat'} ${lost}, aucune riposte possible${fell}`;
      }
      const opening =
        cause === 'interception'
          ? attacking
            ? `interception ${where}`
            : `colonne interceptée ${where}`
          : attacking
            ? `engagement ${where}`
            : `attaque reçue ${where}`;
      const forces = `${mine.troops} contre ${theirs.troops}${faced ? ` — en face, ${facedWords(faced)} —` : ','}`;
      const toll = combatBeats(attacking, mine.lost, theirs.lost, shock);
      const after = [
        won ? 'terrain tenu' : 'terrain perdu',
        mine.routed > 0 ? `${mine.routed} déroute${plural(mine.routed, '', 's')} chez moi` : null,
        theirs.routed > 0
          ? `${theirs.routed} déroute${plural(theirs.routed, '', 's')} en face`
          : null,
        outpostDisabled ? 'avant-poste désactivé' : null,
      ].filter((piece): piece is string => piece !== null);
      return `${opening} — ${forces} ${toll} · ${after.join(' · ')}`;
    },
    disabledUntil: (time: string) => `désactivé — retour à ${time}`,
    beats: combatBeats,
    faced: facedWords,
    facedNation,
  },

  /** **Comment une saison se gagne** : quatre des Sept tenus 24 h, tous les QG, ou l'horloge. */
  victory: {
    concluded: (nation: string) => `LA SAISON EST CONCLUE — ${nation} l’emporte`,
    /** **La fin d'une partie dit pourquoi** (B10, B11, M1, M12) : le journal et l'édition finale. */
    verdictConcluded: (reason: VerdictReason, nation: string | null, perMinute: number | null) =>
      reason === 'draw'
        ? perMinute === null
          ? 'LA SAISON EST CONCLUE À L’HORLOGE — égalité : heures de points et territoire se valent, personne ne l’emporte'
          : 'LA BLITZ EST CONCLUE À DEUX HEURES — égalité : revenu et caisse se valent, personne ne l’emporte'
        : `LA PARTIE EST CONCLUE — ${nation ?? '?'} l’emporte : ${fr.victory.verdictWhy(reason, perMinute)}`,
    verdictWhy: (reason: VerdictReason, perMinute: number | null) =>
      reason === 'hqTaken'
        ? 'son infanterie a capturé le dernier quartier général adverse'
        : reason === 'lastStanding'
          ? 'seul belligérant encore debout'
          : reason === 'income'
            ? `le plus gros revenu à deux heures, ${num(perMinute ?? 0)} fonds par minute`
            : reason === 'points'
              ? 'quatre des Sept tenus vingt-quatre heures d’affilée'
              : reason === 'clock'
                ? 'à l’horloge, le plus d’heures de points stratégiques tenus'
                : reason === 'territory'
                  ? 'à l’horloge, à heures égales, le plus grand territoire'
                  : 'revenu et caisse se valent',
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
      pointTaken: 'point stratégique',
      depotBurned: 'dépôt brûlé',
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
      supply: 'ravitaillement',
      supplyDelivered: 'ravitaillement livré',
      airdrop: 'largage',
      research: 'recherche',
      foundNothing: 'bredouille',
      surrender: 'capitulation',
      elimination: 'QG tombé',
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
    /** Un paquet descendu sous parachute (4.8). */
    airdropped: 'largué',
    /** **Les échanges de la Mondiale**, tamponnés à la réponse du serveur ou à la dépêche. */
    exchange: {
      built: 'bâti',
      raised: 'élevé',
      delivered: 'livré',
      full: 'plein',
    },
    engaged: 'engagé',
    shelled: 'bombardé',
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
    /** Une entrée de la file annulée à son tour : le droit avait disparu entre la mise en file
     *  et le démarrage. La dépêche dit la restitution, sinon le joueur cherche sa matière. */
    constructionCancelled: (
      building: string,
      region: string,
      reason?: 'depositTaken' | 'tooClose',
    ) =>
      reason === 'depositTaken'
        ? `Chantier abandonné : ${lowerFirst(building)} en ${region} — un autre exploitait déjà ce gisement ; son tenant est relevé. Matières remboursées.`
        : reason === 'tooClose'
          ? `Chantier abandonné : ${lowerFirst(building)} en ${region} — un de vos bâtiments se tient désormais trop près. Matières remboursées.`
          : `Chantier abandonné : ${lowerFirst(building)} en ${region} — le droit d’y bâtir a disparu avant son tour. Matières remboursées.`,
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
      playerEliminatedAside: (nation: string, irregulars = false) =>
        `${nation.toUpperCase()} HORS DE COMBAT — son quartier général est tombé.${irregulars ? ' Ce qu’il tenait passe aux irréguliers : chacun peut le prendre ou le piller.' : ''}`,
      playerEliminated: (nation: string, by: string, irregulars = false) =>
        irregulars
          ? `${nation.toUpperCase()} HORS DE COMBAT — son quartier général est tombé aux mains de ${by}, avec ses réserves au-dessus du seuil scellé. Le reste passe aux irréguliers : chacun peut le prendre ou le piller.`
          : `${nation.toUpperCase()} HORS DE COMBAT — son quartier général est tombé aux mains de ${by}. Ses bâtiments passent au vainqueur, ses troupes sont dissoutes.`,
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
      expeditionFoundNothing: (
        building: string,
        region: string,
        reason: 'gone' | 'disabled' | 'sealed',
      ) =>
        reason === 'gone'
          ? `Expédition bredouille — ${region} : ${building} relevé n’est plus debout. La colonne rentre à vide.`
          : reason === 'sealed'
            ? `Expédition bredouille — ${region} : ${building} est gardé par Dakar, ses réserves ne se pillent pas. La colonne rentre à vide.`
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
        `Notre avant-poste est passé au niveau ${num(level)} — ${place} : ${num(OUTPOST_REACH_KM_BY_LEVEL[level] ?? 0)} km de portée.`,
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
        `${upperFirst(site)} est en cours de capture : perdu vers ${until} si personne ne l’en chasse.`,
      hqThreat: (site: string, until: string) =>
        `${upperFirst(site)} est en cours de capture : QG perdu vers ${until}, et sa chute nous élimine. Chassez l’infanterie qui le tient.`,
      captured: (site: string) => `${upperFirst(site)} est à nous : capture achevée.`,
      siteLost: (site: string) => `${upperFirst(site)} a été capturé — il n’est plus à nous.`,
      captureAbandoned: (site: string) =>
        `Capture ${ofSite(site)} abandonnée : plus aucune infanterie à nous sur place.`,
      captureLifted: (site: string) => `La capture ${ofSite(site)} est levée.`,
      captureVoid: (site: string) =>
        `Capture ${ofSite(site)} sans objet : le site n’est plus à celui qu’on visait.`,
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
      pursuitLost: (country: string) =>
        `Cible perdue de vue — ${country} : notre unité s’arrête à sa dernière position connue.`,
      tourWaiting: (role: string, why: 'stock' | 'full' | 'road', resource: string) =>
        why === 'stock'
          ? `Tournée en attente — ${role} : il manque ${resource} au chargement pour sa consigne. Elle repart quand il y en a.`
          : why === 'full'
            ? `Tournée en attente — ${role} : tous ses dépôts sont pleins. Elle repart quand l’un d’eux se vide.`
            : `Tournée en attente — ${role} : sa route est refusée, le plein manque au chargement.`,
      tourEnded: (role: string, why: TourEnd) =>
        why === 'recalled'
          ? `Tournée arrêtée — ${role} : rappelé, il reste au chargement.`
          : why === 'road'
            ? `Route refusée, tournée arrêtée — ${role} : le plein manque au chargement ; il rentre seul.`
            : `Tournée coupée — ${role} : chargement ou dépôts perdus, ou repli ; il rentre seul.`,
      supplyDelivered: (country: string, delivered: string, kept: string) =>
        delivered === ''
          ? `Livraison sans place — ${country} : le dépôt était plein, ${kept} encore à bord. Le transport rentre.`
          : `Livré — ${country} : ${delivered} au dépôt${kept === '' ? '' : `, ${kept} à bord faute de place`}. Le transport rentre.`,
      researchDone: (card: ResearchCard) =>
        `Recherche achevée — ${cardName(card)} : ${RESEARCH_UNLOCKS[card]}, désormais à vous.`,
      airdropped: (country: string, delivered: string, kept: string, squad: boolean) =>
        delivered === ''
          ? `Largué pour rien — ${country} : ${squad ? 'l’escouade n’avait rien à reprendre, ou n’était plus là' : 'le dépôt était plein'}, ${kept} encore à bord. L’avion rentre.`
          : `Largué — ${country} : ${delivered} ${squad ? 'repris par l’escouade' : 'au dépôt'}${kept === '' ? '' : `, ${kept} à bord`}. L’avion rentre.`,
      firedDry: (country: string, troops: number) =>
        `${troops === 1 ? 'Une de nos troupes était à sec' : `${troops} de nos troupes étaient à sec`} — ${country} : sans coups, ni frappe ni riposte. Elles se rechargent à l’ancre.`,
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
  /** **Coups et plein** (ADR 0028 §3) : une cartouche et un jerrican, en crans. */
  supplies: {
    rounds: 'coups',
    fuel: 'plein',
    steps: (count: number) => `${count} cran${plural(count, '', 's')}`,
    roundsTitle: (held: number, full: number) =>
      `Coups : ${held} sur ${full} — un cran par passe tirée ; à sec, ni attaque ni riposte`,
    fuelTitle: (held: number, full: number, km: number, coal: boolean) =>
      `Plein : ${held} sur ${full} crans de ${coal ? 'charbon' : 'pétrole'}, ≈ ${km} km de route — payé au départ`,
    reload:
      'Ancrée, elle se recharge (10 par cran) : sur le plateau personnel chez soi, au dépôt dans le rayon d’un avant-poste ; ailleurs, elle vit sur ce qu’elle porte.',
    formed: 'Part pleine, coups et plein.',
    /** **Bakou** : le plein repris hors de toute ancre, sur le plateau personnel. */
    viaBaku: 'plein repris à Bakou, sur le plateau personnel',
    /** **Singapour** : les camions et les cargos de la colonne ne consomment rien. */
    freedBySingapore: 'camions et cargos sans plein (Singapour)',
    route: (steps: number, roundTrip = false) =>
      `plein : ${roundTrip ? 'l’aller-retour' : 'la route'} coûte ${steps} cran${plural(steps, '', 's')}`,
  },
  /** **La logistique** (ADR 0028 §4) : dépôts, charge des transports, livraisons, tournées. */
  logistics: {
    chargeTitle: (said: string, total: number, capacity: number) =>
      `${said === '' ? 'Vide' : said} — ${total} sur ${capacity}, une seule charge partagée`,
    depot: 'Dépôt',
    dropOnTransport: 'Lâchez les jetons sur un camion, un cargo ou un avion de transport',
    fromDepot: 'À un avant-poste, le transport se charge à son dépôt : glissez depuis le dépôt',
    atThisDepot: 'Ce dépôt charge les transports qui se tiennent à son point',
    loadHint: (amount: number, resource: string, after: number, capacity: number) =>
      `Charger ${amount} ${resource} · ${after} sur ${capacity}`,
    loaded: (amount: number, resource: string) => `${amount} ${resource} à bord`,
    grab: 'Glisser sur un transport : 10, l’appui maintenu en prend davantage',
    tourLine: (tour: TagTour): string =>
      `${fr.logistics.tourState(tour)}${tour.veiled === true ? ' · invisible, Rangoun' : ''}`,
    tourState: ({ state, stops, waiting }: TagTour): string =>
      state === 'tracing'
        ? `tournée à tracer · ${stops} arrêt${plural(stops, '', 's')}`
        : state === 'recalled'
          ? 'tournée rappelée · finit au chargement'
          : waiting === null
            ? `tournée · ${stops} arrêt${plural(stops, '', 's')}`
            : `tournée · attend : ${
                waiting.why === 'full'
                  ? 'dépôts pleins'
                  : waiting.why === 'road'
                    ? 'route refusée'
                    : `${waiting.resource === undefined ? 'stock' : fr.resources[waiting.resource]} à sec au chargement`
              }`,
    launch: 'lancer',
    clear: 'effacer',
    recall: 'rappeler',
    tourStarted: 'Tournée lancée',
  },
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
     * et le plateau personnel le décompose par nation ; ici c'est la ligne d'une seule troupe —
     * le seul endroit où le surcoût du hors-ravitaillement se lit à côté de qui le paie.
     */
    upkeepRate: (perHour: number) => `entretien ${tenths(perHour)} vivres / h`,
    upkeepRaised: (perHour: number, factor: number) =>
      `entretien ${tenths(perHour)} vivres / h — hors ravitaillement ×${factor}`,
    /**
     * **La punition doit se voir là où le joueur regarde la troupe** (ADR 0019 §4). Un surcoût
     * qu'on ne lit que sur un écran de comptabilité est une punition invisible, exactement ce
     * que D3 refusait pour l'attrition.
     */
    unsupplied: (factor: number) => `hors ravitaillement — entretien ×${factor}`,
    /** Ce que la pile est, d'un coup d'œil (prototype de la table) : le compte, ou la troupe seule
     *  et si elle est entamée. */
    sheetKicker: (troops: number, worn: boolean) =>
      troops > 1 ? `pile · ${troops} troupes` : worn ? 'troupe seule · entamée' : 'troupe seule',
    sheetHealth: (health: number) => `${health} / 100`,
    sheetLoad: (carried: number) => (carried > 0 ? 'charge' : 'à vide'),
    sheetLoadOf: (carried: number, capacity: number) => `${num(carried)} / ${num(capacity)}`,
    /** La charge de butin, pas les passagers : ceux-là ont leur jeton (15/10). */
    sheetNothingAboard: 'aucun butin',
    sheetCount: (troops: number) => `×${troops}`,
    /** Le jeton d'un transport chargé (15/10) : ses passagers ne se dessinent pas. */
  },

  /**
   * **La pièce en main** (ADR 0026 §6) : la fiche posée au bord pendant qu'on cherche où poser, et
   * l'heure que la route du serveur rend quand le pointeur s'arrête. Le bouton qui lève et pose
   * est le gauche, qu'aucun mappage ne déplace.
   */
  hand: {
    kicker: (place: string) => `en main · ${place}`,
    scouting: (radiusKm: number) => `relève à ${num(radiusKm)} km`,
    hint: 'clic gauche sur la carte, ou glisser : poser · sur un transport : embarquer · échap : reposer',
    hintFinger: 'touchez la carte pour poser, la pièce pour la reposer — appui long pour la porter',
    found: 'fonder un avant-poste ici',
    aboard: 'à bord',
    disembark: 'débarquer',
  },

  /**
   * **« À faire maintenant » — la carte qui a remplacé l'inventaire** (décision Pierre, 30/08).
   * Une ligne par chose qui attend le joueur, jamais une ligne par chose qu'il possède. Le
   * vocabulaire est celui d'une dépêche : ce qui manque, où, et rien d'autre — la ligne mène au
   * geste, elle ne l'explique pas.
   */
  /** **Les premiers pas** (ADR 0027 §2) : l'ordre de route d'une première Mondiale. */
  firstSteps: {
    header: 'premiers pas',
    progress: (done: number, total: number) => `${done} / ${total}`,
    fold: 'replier',
    unfold: 'déplier',
    skip: 'passer',
    doneLabel: 'fait :',
    resume: 'Reprendre les premiers pas',
    resumeNote: 'Cinq gestes, dans la vraie partie : la liste revient en tête de « à faire ».',
    steps: {
      hq: 'Poser le quartier général : sa tuile, du plateau à la carte',
      move: 'Lever une pièce et la poser plus loin : l’ordre part au lâcher',
      form: 'Former une pièce : la lâcher sur une caserne',
      research: 'Poser une carte de recherche sur le QG',
      deliver: 'Charger un camion, puis le lâcher sur un avant-poste',
      /** Le même pas, tant qu'aucun avant-poste n'est à vous : on le fonde d'abord. */
      outpost: 'Fonder un avant-poste, puis y livrer un camion chargé',
    },
    /** Ce que dit la bulle, là où le geste se fait. */
    cue: {
      /** La bande repliée : on la déplie d'abord. */
      unfold: 'Dépliez le plateau personnel',
      hq: 'La tuile du QG, lâchée sur votre sol',
      tiles: 'D’abord une caserne : sa tuile sur la carte',
      pieces: 'Une pièce, lâchée sur la caserne',
      research: 'Une carte, lâchée sur le QG',
      move: 'Levez-la, posez-la plus loin',
      truck: 'Un camion, lâché sur la caserne',
      load: 'Des jetons du plateau sur lui, lui sur un avant-poste',
      outpost: 'Envoyez-la fonder un avant-poste',
    },
  },

  nextActions: {
    header: 'à faire maintenant',
    count: (count: number) => `${count} en attente`,
    toMap: 'carte',
    toPersonalBoard: 'économie',
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
    neutralCities: (count: number) =>
      count > 1 ? `${count} villes neutres à prendre` : 'une ville neutre à prendre',
    /** **Une ligne par sorte** (décision Pierre, 05/10) : le lieu n'est dit qu'à une seule
     *  adresse, le total seul quand il y en a plusieurs. */
    troopWithoutOrder: (count: number, place: string | null) =>
      `${count} troupe${plural(count, '', 's')} sans ordre${place === null ? '' : ` — ${place}`}`,
    unsupplied: (count: number, place: string | null) =>
      `${count} troupe${plural(count, '', 's')} hors ravitaillement${place === null ? '' : ` — ${place}`}`,
    /** Où le prochain clic mène, parmi les occurrences d'une même sorte. */
    rank: (word: string, rank: number, total: number) => `${word} ${rank} / ${total}`,
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
    column: (count: number, slot = true) =>
      `pile : ${count} troupe${plural(count, '', 's')}${slot ? ' · 1 slot' : ''}`,
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
    raiseCarries: (reachKm: number) => `rayon ${num(reachKm)} km`,
    raiseAtMaximum: (maximum: number) => `Niveau maximal atteint (${num(maximum)}).`,
    raiseDisabled: 'Hors service : on ne monte pas un avant-poste sous le feu.',
    raiseQueued: 'Élévation déjà en file — elle se lit au plateau personnel.',
  },

  /** **L'ordre transmis** (refonte mobile, 1d) : la feuille s'est refermée, la boucle se dit. */
  /** Blitz (B19) : après une frappe, une unité bouge mais n'attaque pas encore. */
  reload: {
    label: 'rechargement',
    prefix: 'rechargement ',
  },
  /** **La mise en batterie** (B20) : l'artillerie immobile ne tire qu'au bout de son attente. */
  battery: {
    label: 'en batterie dans',
    prefix: 'en batterie dans ',
  },

  sent: {
    stamp: 'transmis',
    title: (order: string, destination: string) => `${order} — ${destination}`,
    line: (time: string, used: number, total: number) =>
      `arrivée ${time} · mouvements ${used} / ${total}`,
    arrival: (time: string) => `arrivée ${time}`,
    follow: 'suivre',
  },

  /**
   * **La dépêche d'un combat, ouverte depuis sa notification** (lot mobile-3, §6). Elle dit ce
   * que le journal dit déjà, en lignes — et ne nomme pas l'assaillant : le compte rendu ne le
   * nomme pas (ADR 0005).
   */
  dispatchSheet: {
    kicker: (time: string) => `dépêche · ${time}`,
    title: (
      attacking: boolean,
      cause: 'arrival' | 'interception' | 'bombardment',
      where: string,
    ) =>
      cause === 'bombardment'
        ? attacking
          ? `Bombardement — ${where}`
          : `Bombardés — ${where}`
        : cause === 'interception'
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
    faced: 'au feu',
    theirs: 'en face',
    theirsValue: (lost: number) =>
      `${lost} homme${plural(lost, '', 's')} perdu${plural(lost, '', 's')}`,
    pass: 'la passe',
    dry: 'à sec',
    /** **Une troupe à sec ne tire pas** (ADR 0028 §1), des deux côtés : la nôtre n'a pas pu
     *  répondre, la leur n'a pas riposté — la dépêche le dit, sinon la passe se lit en défaite. */
    dryValue: (mine: number, theirs: number, attacking: boolean) =>
      [
        mine > 0
          ? `${mine} des nôtres sans coups, ${plural(mine, 'n’a', 'n’ont')} pas ${attacking ? 'frappé' : 'riposté'}`
          : null,
        theirs > 0
          ? `${theirs} des leurs sans coups, ${plural(theirs, 'n’a', 'n’ont')} pas ${attacking ? 'riposté' : 'frappé'}`
          : null,
      ]
        .filter((piece): piece is string => piece !== null)
        .join(' · '),
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
   * secondes, et un cartouche à la fin — chez nous par rôle, en face par rôle sous sa nation (F1),
   * ou des totaux sur un compte rendu d'avant le 14/10.
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
    /**
     * **L'allure, à côté du milieu.** Une colonne dont l'infanterie tient dans ses transports
     * roule (note « le transport terrestre et l'allure ») : c'est le seul effet du transport
     * terrestre, et la seule façon de le voir avant de payer.
     */
    paces: { motorized: 'motorisé', foot: 'à pied' } satisfies Record<LandPace, string>,
    noRoute: 'Aucune route terrestre vers cette destination.',
    restBite: (time: string) => `mord la fenêtre de repos — libre à ${time}`,
    pointAt: (lon: number, lat: number) =>
      `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'O'}`,
    arrival: (time: string) => `arrivée ${time}`,
    pursuit: 'poursuite',
    /**
     * **Ce que les relais ont pris sur le trajet.** Une route plus courte que prévu sans rien à
     * l'écran pour l'expliquer se lit comme une panne, pas comme une récompense — et c'est
     * précisément ce qu'on a acheté en spécialisant l'avant-poste.
     */
    /** Ce que l'expédition tient sur place avant de repartir : la seule durée du pillage que le
     *  joueur décide, et elle se dit avant qu'il paie le slot. */
    capture: (duration: string) => `capture — ${duration} à la force de la pile`,
    /** Une estimation depuis le relevé possédé, jamais un stock adverse : la caisse a pu bouger,
     *  et c'est le sujet. */
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
    /**
     * **L'allure, à côté du milieu.** Une colonne dont l'infanterie tient dans ses transports
     * roule (note « le transport terrestre et l'allure ») : c'est le seul effet du transport
     * terrestre, et la seule façon de le voir avant de payer.
     */
    /**
     * **This label promises nothing** (ADR 0019 §6). It does not say an adversary is there, and
     * above all it does not say recognised ground would be safe — a posted force is invisible
     * everywhere, at home included. It says one thing, and the note underneath repeats it so it
     * cannot be read the other way round: nothing of yours watches this ground.
     */
    submit: 'envoyer — irréversible',
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
    before: (garrisonDamageTaken: number, blitz: boolean) =>
      `L’attaquant frappe en premier, le défenseur riposte avec ce qui lui reste — au moins un abattu s’il touche ; une garnison n’encaisse que ×${factor(garrisonDamageTaken)} des coups.${blitz ? '' : ' Chaque passe tirée coûte un cran de coups : une troupe à sec n’attaque ni ne riposte.'}`,
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
      cost: {
        name: 'coût',
        note: 'Ce que la troupe coûte à former, prélevé au lancement du lot : de l’acier, plus la ressource de sa famille — vivres pour les hommes, pétrole pour les machines de terre et les avions, charbon pour les navires.',
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
    } satisfies Record<'cost' | 'training' | 'strength' | 'range', { name: string; note: string }>,
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
     * caserne, le port et l'aérodrome — former, la file, la garnison en onglets, le décompte collé
     * sous eux. Ce qu'une carte de recherche tient encore descend dessous avec elle.
     */
    sheet: {
      tabs: { form: 'former', queue: 'file', garrison: 'garnison' },
      capLine: (inService: number, queued: number) => `${inService} en service · ${queued} en file`,
      siteKicker: (level: number) => `le site · niveau ${level}`,
      /** **Un niveau rend** (ADR 0028 §5) : il ne débloque plus rien. */
      lanes: (level: number) =>
        level === 1 ? 'Forme une troupe à la fois' : `Forme ${level} troupes à la fois`,
      formHeader: 'former ici',
      formNote: 'un toucher, une troupe',
      lockedHeader: 'Derrière une carte',
      lockedNote: 'la recherche se pose sur le QG',
      /** La raison à la place du bouton, jamais un bouton grisé (ADR 0015). */
      queueFull: 'File pleine.',
      short: (missing: number, resource: string) => `Il manque ${missing} ${resource}.`,
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
    /** Aucun plafond affiché (ADR 0027 §5) : la borne de la file ne se dit qu'au refus. */
    queueOf: (region: string, count: number) =>
      `${region} — ${count} lot${plural(count, '', 's')} en file`,
    /** La seconde phrase envoyait vers le sélecteur de site, mort avec l'onglet (59a) : dans une
     *  modale de site il n'y a plus qu'un site, et les rôles sont juste au-dessus. */
    queueEmpty: 'Aucune troupe en chaîne. Enfilez un rôle ci-dessus.',
    atWaking: 'au réveil',
    wakingNote:
      'Les files continuent pendant la plage de repos, comme les chantiers. Chaque bâtiment tient sa propre file : une seconde caserne forme en parallèle. Une troupe déjà commencée ne s’annule plus ; les suivantes sont remboursées intégralement.',
    inService: 'en service',
    inQueue: 'en file',
    /** The two halves of a card's ledger. Kept as eyebrows, never as sentences. */
    costLabel: 'coût',
    trainingLabel: 'formation',
    strongAgainst: 'fort contre',
    weakAgainst: 'faible contre',
    supportNote: 'Ne combat pas, mais peut se faire détruire ou intercepter.',
    /** **Derrière sa carte** (ADR 0028 §5) : dit avant le clic, la carte nommée. */
    /** **La condition en toutes lettres, et la même dans les deux cadres** (contrats 03 et 06) :
     *  l'abaque la dit sans rien posséder, la modale de site la dit sur la carte qu'elle laisse
     *  affichée. */
    formsIn: (building: string) => `se forme dans ${building}`,
    tierLabel: (tier: number) => `palier ${tier}`,
    enqueueTitle: (role: string, tier: string, site: string) => `enfiler ${role} ${tier} — ${site}`,
    enqueue: '+ 1 troupe',
    inChain: 'en chaîne',
    pending: 'en attente',
    cancelStarted: 'une troupe commencée ne s’annule plus',
    cancelRefund: 'annuler et rembourser',
    cancel: 'annuler',
  },

  /** **La ligne d'élévation d'un site au téléphone** (`RaiseControl`) : son bouton et sa facture. */
  works: {
    raise: (level: number, duration: string) => `▲ niv ${level} · ${duration}`,
    raiseTitle: (name: string, level: number) =>
      `mettre ${lowerFirst(name)} en file pour le niveau ${level}`,
    underway: (time: string) => `en chantier · ${time}`,
    queued: (rank: number) => `en file · ${rank}ᵉ`,
    lacking: (amount: number, resource: string) => `il manque ${num(amount)} ${resource}`,
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
    alreadyQueued: 'un chantier vise déjà ce bâtiment — annulez-le ou attendez son tour',
  },

  /**
   * **Le plateau personnel** (ADR 0028 §7) : un panneau à soi, sous la table au bureau, en tiroir
   * au téléphone. Toujours nommé en entier — « le plateau » seul désigne la table.
   */
  personalBoard: {
    header: 'Plateau personnel',
    /** Les deux onglets du plateau à tuiles, et ce que fait chacun au survol. */
    tabs: { buildings: 'Bâtiments', troops: 'Troupes' },
    previous: 'précédentes',
    next: 'suivantes',
    /** Un bac : son nombre exact sur son plafond, et son débit réel. */
    ofCap: (cap: number) => `/ ${num(cap)}`,
    rate: (perHour: number) => `${perHour >= 0 ? '+' : '−'}${tenths(Math.abs(perHour))} / h`,
    harvest: (hours: number) =>
      hours < 1
        ? 'Récolte depuis que vous avez quitté le plateau personnel'
        : `Récolte · ${num(hours)} h depuis que vous avez quitté le plateau personnel`,
    harvestNone: 'Rien n’est entré ni sorti depuis votre dernière visite.',
    harvestFirst: 'Ce qui entre se lira ici à votre prochaine visite.',
    /** La récolte pliée dans la bande : depuis quand, puis l'écart de chaque bac. */
    harvestSince: (hours: number) => (hours < 1 ? 'depuis peu' : `depuis ${num(hours)} h`),
    harvestReplay: 'revoir la récolte',
    harvestHeader: 'récolte',
    lost: (amount: number) => `${num(amount)} perdus : bac plein`,
    delta: (amount: number) => `${amount > 0 ? '+' : '−'}${num(Math.abs(amount))}`,
    tilesNote: 'glissez une tuile sur la carte pour bâtir, sur sa pareille pour l’élever',
    tileCount: (count: number) => `×${count}`,
    piecesNote: 'glissez une pièce sur une caserne, un port ou un aérodrome',
    piecesNone: 'Aucun site de projection debout : bâtissez une caserne pour former.',
    /** Où une pièce se forme. */
    pieceSite: (building: string) => `sur ${lowerFirst(building)}`,
    /** Ce que dit la main au-dessus d'une cible. */
    raise: (building: string, level: number) => `Élever ${lowerFirst(building)} au niveau ${level}`,
    form: (role: string, building: string) =>
      `Former ${lowerFirst(role)} — ${lowerFirst(building)}`,
    dropOnSite: 'Lâchez sur une caserne, un port ou un aérodrome',
    dropBack: 'Relâchée ici, elle rentre',
    formed: (role: string) => `${role} en file de formation`,
    raised: (building: string, level: number) => `${building} : niveau ${level} en file`,
    worksHeader: (lanes: number) =>
      lanes > 1 ? `chantiers · ${lanes} avancent à la fois` : 'chantiers · un seul avance',
    /** Ce que le niveau suivant du QG ajouterait, dit sous la file. */
    nextLane: (level: number) => `le QG niveau ${level} en ajouterait un`,
    worksFold: 'chantiers',
    noWorks: 'aucun chantier',
    /** Le chantier en tête, plié en une ligne : son nom, son lieu, ce qui lui reste, la file. */
    work: (name: string, level: number) => `${name} niv. ${level}`,
    workAt: (name: string, level: number, region: string) => `${name} niv. ${level} · ${region}`,
    workTail: (time: string, running: number, queued: number) =>
      ` · reste ${time}${running > 1 ? ` · ${running} en cours` : ''}${queued > 0 ? ` · ${queued} en file` : ''}`,
    /** Le rang d'un chantier dans la file : « 1. Caserne niv. 2 ». */
    workRank: (rank: number, work: string) => `${rank}. ${work}`,
    left: (time: string) => `reste ${time}`,
    queuedLine: (time: string) => `${time}, en file`,
    /** Une tuile dont la pareille est debout : elle l'élève, au prix de l'élévation. */
    raiseTo: (level: number) => `élever au niv. ${level}`,
    /** Le bouton de la recherche dans la bande repliée du téléphone. */
    researchShort: 'rech.',
    starvedChain: (building: string, resource: string) =>
      `${building} à sec de ${lowerFirst(resource)}`,
  },

  /** **Les cartes de recherche** (ADR 0028 §5) : sur le plateau personnel, sur le QG. */
  research: {
    header: 'recherche',
    note: 'glissez une carte sur votre QG : payée à la pose, elle avance en heures de jeu et débloque à la fin — une à la fois',
    names: RESEARCH_NAMES,
    unlocks: RESEARCH_UNLOCKS,
    branches: { land: 'terre', sea: 'mer', air: 'air', industry: 'industrie' },
    hours: (hours: number) => `${num(hours)} h`,
    after: (cards: string) => `après ${cards}`,
    and: ' et ',
    counters: (cards: string) => `contre ${cards}`,
    counteredBy: (cards: string) => `son contre : ${cards}`,
    /** Un contre qu'on forme sans carte : `l'infanterie, au départ`. */
    atStart: (role: UnitRole) => `${fr.roles[role].one}, au départ`,
    done: 'acquise',
    left: (time: string) => `reste ${time}`,
    waiting: 'attend son QG',
    dropOnHq: 'Lâchez la carte sur votre quartier général',
    start: (card: string, hours: number) => `Chercher ${card} — ${num(hours)} h`,
    started: (card: string) => `${card} posée sur le quartier général`,
    /** La ligne du mât du QG, et celle de « en cours ». */
    onHq: (card: string) => `recherche ${card}`,
  },

  economy: {
    constructionNone:
      'Aucun chantier. La file est illimitée et se paie à la mise en file — le niveau du QG dit combien avancent à la fois.',

    queueCancel: 'annuler',
    queueCancelTitle: 'annuler et rembourser intégralement',

    /** La condition d'un maillon manquant — jamais un texte en dur : elle sort de la règle de
     *  placement que le serveur refuse avec (`placementOf`). */
    condition: {
      foundation: 'pose de fondation offerte',
      locked: (card: ResearchCard | null) =>
        card === null
          ? 'posez d’abord votre quartier général'
          : `demande la recherche ${cardName(card)}`,
      deposit: (deposits: ReadonlyArray<string>) =>
        `demande un gisement libre de ${deposits.join(' ou ')} sur votre sol ou dans vos rayons`,
      free: 'à poser — choisissez la clé, puis visez un lieu sur la carte',
    },

    /** The lot, in its four readings: awaiting an order, being sized, running, delivered. */
    lot: {
      awaiting: 'en attente d’ordre',
      keepsAvailable: (resource: string) =>
        `${startsWithVowel(resource) ? 'L’' : 'Le '}${resource} reste disponible pour les bâtiments et les troupes.`,
      commandsItself: 'se commande',
      line: 'ligne',
      activeLine: 'ligne active',
      /** `− 3 charbon / + 1 pétrole` : ce que la ligne prend pour un de ce qu'elle rend. */
      flow: (inputs: ReadonlyArray<{ resource: string; quantity: number }>, output: string) =>
        `${inputs.map(({ resource, quantity }) => `− ${quantity} ${resource}`).join(' ')} / + 1 ${output}`,
      order: 'commander un lot',
      launch: 'lancer le lot',
      empty: 'un lot de zéro ne se lance pas — tirez la réglette',
      cancel: 'annuler le lot',
      close: 'refermer',
      quantity: (output: string) => output,
      maxOf: (maximum: number, resource: string) => `max ${maximum} — le stock d’${resource}`,
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

    /** A listening post with no coal left, said on the piece with what mends it. */
    listeningSilent: 'muette — plus de charbon',
    listeningSilentFix:
      'Une mine sur du charbon, ou du charbon livré, la fera entendre de nouveau.',

    cappedByHq: 'plafonné par le QG',
    inRegion: (region: string) => `en ${region}`,
  },

  /**
   * **La fondation** — la dette du format, rendue visible. Le jeu répond toujours à « et
   * maintenant ? » sans tutoriel : la ligne se retire d'elle-même quand la fondation est
   * soldée, et ne revient jamais. Son en-tête est passé à `nextActions`, qui la porte
   * désormais ; ce qui reste ici est ce qu'on lit **dans** le dépli.
   */
  mobilization: {
    pick: 'Choisissez une clé, puis visez un lieu.',
    aim: 'visez un lieu',
    chooseRegion: (condition: string) => `Visez un lieu — ${condition}`,
    highlighted:
      'Le fantôme suit le pointeur et s’aimante sur un gisement libre ; cliquez pour poser.',
    cancel: 'annuler la sélection de clé',
    /** **Une dette de socle est un couple** : deux mines dues se liraient sinon comme deux fois
     *  la même ligne, alors que l'une ne s'acquitte que sur du fer et l'autre que sur du
     *  charbon. */
    onDeposit: (building: string, deposit: string) => `${building} — ${deposit}`,
    /** **La dette que le sol ne nomme pas** : le quartier général (décision 1b du 13/09). La
     *  ligne dit l'absence de condition plutôt qu'un gisement vide — c'est la liberté qui est
     *  l'information. */
    anywhereAtHome: (building: string) => `${building} — à poser sur votre sol`,
    /** Ce que la clé demande à une région — dit avant même qu'elle soit choisie, jamais après
     *  coup : rien d'affiché sans sa condition. */
    wants: {
      deposit: (deposits: ReadonlyArray<string>) => `gisement de ${deposits.join(' ou ')} requis`,
      coastal: 'côte requise',
      any: 'tout lieu tenu',
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
    artillery: 'pièces',
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
    /** **Le recensement** : le QG et ce qu'il porte, puis chaque bâtiment debout et ce qu'il fait. */
    censusHeader: 'recensement',
    hqLine: (level: number, maximum: number, lanes: number) =>
      `niveau ${level} sur ${maximum} · ${lanes} chantier${lanes > 1 ? 's' : ''} à la fois`,
    hqMissing: 'Aucun quartier général debout — rien d’autre ne peut se bâtir.',
    listeningUnfigured: 'rayon de révélation non chiffré',
    listeningTemporary:
      'La station d’écoute est ici en attendant l’espionnage : un jalon inerte serait pire.',
    overflowing: 'débordé — bac plein',
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
    lobbyChannel: 'canal du salon — effacé au lancement',
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
    tableSoundLabel: 'Bruits de la table',
    tableSoundNote: 'Le bois des pièces qu’on lève, pose ou embarque, le tampon, la volée.',
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
      blitz = false,
    ) => {
      const act = hand.finger
        ? 'toucher net'
        : fr.mapUi.mouse.click[buttonOfRole(hand.mapping, 'act')];
      const regions = blitz
        ? 'Les régions n’apparaissent qu’au zoom rapproché : c’est là qu’on désigne un sol.'
        : 'Les régions n’apparaissent qu’au zoom rapproché : c’est là qu’on bâtit et qu’on désigne un sol.';
      return [
        hand.finger
          ? {
              title: 'La carte et le doigt',
              lines: [
                'Toucher net : ouvrir la rose et lire ce qui est touché. Un doigt glissé déplace la carte ; deux doigts pincent pour zoomer et tournent pour orienter.',
                'La rose des vents propose ce que ce point accepte, et rien d’autre.',
                'Touchez une de vos piles pour la lever, ou tenez-la appuyée pour la porter. Touchez la carte pour la poser : l’ordre part — s’il y en a plusieurs, une rose réduite laisse choisir. Touchez la pile pour la reposer.',
                regions,
              ],
            }
          : {
              title: 'La carte et la souris',
              lines: [
                `Orienter et incliner la vue : ${fr.mapUi.mouse.drag[buttonOfRole(hand.mapping, 'orient')]}. Sélectionner le pays visé : clic gauche net.`,
                `Zoomer : molette. Déplacer la carte : ${fr.mapUi.mouse.drag[buttonOfRole(hand.mapping, 'pan')]}, ou espace maintenu avec le clic gauche.`,
                `La rose des vents : ${act} sur un point. Elle propose ce que ce point accepte, et rien d’autre.`,
                `Une de vos piles : glissez-la et lâchez-la — l’ordre part au lâcher, la pastille sous le pointeur dit lequel (Tab ou 1, 2, 3 pour en changer). Appui long sur une escouade : une seule troupe. Lâchée sur un transport, elle embarque ; l’étiquette d’un transport chargé fait descendre. Échap ou ${fr.mapUi.mouse.button.right} annule. ${fr.mapUi.mouse.click.left} la lève aussi, un second la pose.`,
                'Ces trois métiers — orienter, déplacer, agir — se permutent sur les trois boutons dans les Réglages.',
                regions,
                'Le « ? » en bas à droite rouvre les commandes à tout moment.',
              ],
            },
        {
          title: 'Lire le terrain',
          lines: [
            ...(blitz
              ? []
              : [
                  'Les gisements ne sont le secret de personne : la géologie de 1940 est fixe. La carte les montre sur les terres où vous pouvez bâtir.',
                ]),
            blitz
              ? 'Vous voyez ce que vous tenez. Le reste dort dans le brouillard — ni bâtiments adverses, ni colonnes au-delà de votre portée.'
              : 'Vous voyez ce que vous tenez. Le reste dort dans le brouillard — ni bâtiments, ni avant-postes adverses.',
            `Une troupe posée observe : elle relève les mouvements qui passent à moins de ${scoutRadiusKm} km. Un fil, un cap, une heure estimée — jamais le type, jamais la nation.`,
            `Une pile à vous porte deux cercles : le trait plein est ce qu’elle touche — ${contactRadiusKm} km, la portée de contact ; le tireté est ce qu’elle voit.`,
            ...(blitz
              ? []
              : [
                  `Un avant-poste ouvre ${outpostReachKm} km autour de son point : on y bâtit comme chez soi. Un raid le désactive ; seule l’infanterie le capture.`,
                  'Un avant-poste se monte, jusqu’au niveau 3 : son panneau porte l’élévation — le rayon suivant, payé dans la file de chantier.',
                  `${upperFirst(act)} sur un avant-poste à vous : l’élever, choisir son métier — relais ou écoute — ou le démanteler. Le démantèlement emporte le sol qu’il colore et les bâtiments qu’il ancre.`,
                ]),
          ],
        },
        hand.phone
          ? {
              title: 'Vos bureaux',
              lines: [
                `Dans le coin bas droit, le rapporteur : ${blitz ? '' : 'chantiers, '}journal, « à faire », ${blitz ? '' : 'presse, '}télégraphe, réglages. Une entrée ouverte se referme d’un second toucher.`,
                `Le drapeau de la réglette ouvre le dossier de la nation : sa fiche, l’abaque de tir, ${blitz ? '' : 'les calques de la carte, '}les réglages, et cette feuille.`,
                '« En cours », sous la réglette : chaque compte à rebours, du plus proche au plus lointain. Un toucher y recentre la carte.',
                blitz
                  ? '« À faire » : tout ce qui attend un ordre.'
                  : '« À faire » : vos poses offertes et tout ce qui attend un ordre.',
              ],
            }
          : {
              title: 'Vos bureaux',
              lines: [
                ...(blitz
                  ? []
                  : [
                      'Économie, dans la colonne de gauche : tout ce qui se pose et tout ce qui coule — chantier, filière, projection.',
                    ]),
                `« À faire maintenant », au carré « N à faire » en tête de la colonne de gauche : tout ce qui attend un ordre${blitz ? '' : ', l’ordre de mobilisation en tête'} — chaque ligne recentre la carte. Vos troupes se lèvent sur la carte, et leur liste complète est dans la fenêtre Nation.`,
                'Journal, dans la colonne de gauche : tout ce qui s’est passé depuis votre dernier passage.',
                'Télégraphe, dans la colonne de gauche : le canal général de la saison — tout le monde y lit tout le monde.',
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
      lift: ` glisser une pile, ou ${fr.mapUi.mouse.click.left} puis ${fr.mapUi.mouse.click.left} : l’ordre part à la pose`,
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
      {
        gesture: 'glisser une pile',
        effect: 'la porter ; la lâcher la pose — sur un transport, elle embarque',
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
      { gesture: 'maj + glisser', effect: 'entourer plusieurs piles (Mondiale)' },
      { gesture: 'maj + clic', effect: 'ajouter ou retirer une pile de la sélection' },
      { gesture: 'g · u', effect: 'former une escouade · la dissoudre' },
    ],
    /** **Le doigt ne lit pas le mappage** (décision mobile-1c) : trois lignes, toujours les mêmes. */
    fingerGestures: [
      { gesture: 'toucher net', effect: 'ouvrir la rose et lire ce qui est touché' },
      { gesture: 'toucher une pile', effect: 'la lever ; toucher la carte la pose' },
      { gesture: 'appui long sur une pile', effect: 'la porter du doigt ; la lâcher la pose' },
      { gesture: 'appui long sur la carte', effect: 'choisir plusieurs piles, puis les toucher' },
      { gesture: 'un doigt glissé', effect: 'déplacer la carte' },
      { gesture: 'deux doigts', effect: 'pincer pour zoomer, tourner pour orienter' },
    ],
    routeScale: 'échelle du trajet',
    dock: 'quai',
  },

  /** **La pastille sous la pièce portée** (POC « Manipuler les pions », 16/10) : ce que le lâcher
   *  ferait, et comment changer d'ordre quand la cible en accepte plusieurs. */
  /** **L'étiquette d'un transport chargé** (POC « Manipuler les pions », 16/10). */
  cargo: {
    seats: (used: number, seats: number) => `${used}/${seats}`,
    pull: (role: string) => `${role} — tirer ou cliquer pour débarquer`,
    all: 'tout débarquer',
    release: 'débarquer',
  },
  /** **Plusieurs piles prises ensemble** (#130) : la barre au-dessus d'elles, et ce que leur
   *  lâcher dit. */
  selection: {
    piles: (count: number) => `${count} pile${plural(count, '', 's')}`,
    troops: (count: number) => `${count} troupe${plural(count, '', 's')}`,
    cost: (count: number, free: number) =>
      `${count} slot${plural(count, '', 's')} · ${free} libre${plural(free, '', 's')}`,
    slots: (count: number, free: number) =>
      `${count} mouvements pour ${free} slot${plural(free, '', 's')} libre${plural(free, '', 's')}`,
    partRefused: (unable: number, count: number, why: string | null) =>
      `${unable} pile${plural(unable, '', 's')} sur ${count} ne ${unable > 1 ? 'peuvent' : 'peut'} pas y aller${why === null ? '' : ` : ${why}`}`,
    form: 'Former une escouade',
    disband: 'Dissoudre',
    clear: 'Désélectionner',
    done: 'Terminer',
    /** Au doigt, après l'appui long sur le plateau : les touchers ajoutent. */
    picking: 'touchez vos piles',
    noSquadHere: 'aucune de ces piles ne se tient sur le plateau',
    reread: 'la sélection a changé sous la main — reprenez-la et lâchez-la de nouveau',
    atLeastTwo: 'choisissez au moins deux piles — Maj + clic, ou le lasso (Maj + glisser)',
    label: 'Sélection',
  },
  drop: {
    choice: (index: number, count: number, next: string) => `${index}/${count} · Tab : ${next}`,
    release: 'relâcher pour ordonner · Échap annule',
    refused: 'relâcher : la pièce revient · Échap',
    still: 'relâcher · rien ne change',
    putBack: 'Reposer',
    putBackDetail: 'rien ne bouge',
    boardRefused: 'Embarquement impossible',
    /** The chip's verbs, in the infinitive as in the prototype. */
    verbs: {
      attack: 'Attaquer',
      raid: 'Lancer le raid',
      form: 'Former une escouade',
      join: 'Rejoindre l’escouade',
      board: 'Embarquer',
      deliver: 'Livrer',
      airdrop: 'Larguer',
      tour: 'Tracer une tournée',
      sea: 'Marcher',
      inland: 'Faire route',
      air: 'Voler',
    },
    pieces: (count: number) => `${count} pièces ensemble`,
    strike: 'vous frappez en premier',
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
    enemyColumn: 'colonne ennemie',
    /** **Livrer** (ADR 0028 §4) : le transport décharge et rentre seul. */
    deliver: 'livrer',
    deliverConsequence:
      'Décharge au dépôt ce qui y tient, garde le reste à bord, puis rentre seul.',
    /** **Larguer** (ADR 0028 §4) : l'avion ne se pose pas, et paie le plein de l'aller-retour. */
    airdrop: 'larguer',
    airdropOutpostConsequence:
      'Largue un paquet sous parachute sur le dépôt, sans se poser : ce qui ne tient pas reste à bord. Paie le plein de l’aller-retour, puis rentre seul.',
    airdropSquadConsequence:
      'Largue un paquet sous parachute : l’escouade reprend ses coups et son plein, dans la limite de ce que chaque troupe porte. Le reste reste à bord. Paie le plein de l’aller-retour, puis rentre seul.',
    tour: 'tracer une tournée',
    tourStop: (count: number) => `arrêt ${count} de la tournée`,
    tourConsequence:
      'Une boucle depuis le chargement, quatre dépôts au plus : il recharge sa consigne à chaque tour, saute un dépôt plein, et garde son slot.',
    tracing: (count: number) => `tournée à tracer · ${count} arrêt${plural(count, '', 's')}`,
    traceElsewhere:
      'Une tournée se trace de dépôt en dépôt : lâchez le transport sur un de vos avant-postes, ou lancez-la depuis son étiquette',
    /** **Bombarder** (B20) : le tir part sur-le-champ, et rien ne revient. */
    bombard: 'bombarder',
    bombardConsequence: (km: number) =>
      `Tir indirect à ${km} km, sur-le-champ : la cible ne peut pas répondre. Puis la pièce recharge.`,
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
    /** **Rejoindre une autre de mes piles** (15/10) : une marche jusqu'à son point exact. */
    join: 'rejoindre',
    joinConsequence:
      'Marche jusqu’à cette pile et s’y pose à son point exact : les deux n’en font plus qu’une.',
    /** **En Blitz, pas de groupe d'unités de combat** (règle de Pierre, 15/10). */
    noSquad: 'pas de groupe d’unités de combat — seul un transport en porte d’autres',
    /** **Embarquer** (révision de l'ADR 0025, 15/10) : au point du transport, sur-le-champ et
     *  sans slot ; de plus loin, une marche qui monte à bord en arrivant. */
    board: 'embarquer',
    boardOnto: (transport: string) => `embarquer · ${transport}`,
    boardNow: 'immédiat · sans slot',
    boardOnArrival: 'Marche jusqu’au transport et monte à bord en arrivant, s’il y est encore.',
    boardPlaces: (used: number, capacity: number) =>
      `À bord ensuite : ${used} place${plural(used, '', 's')} sur ${capacity}.`,
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
    captureConsequence: (duration: string, hq = false) =>
      hq
        ? `L’infanterie tient le QG ${duration} à sa force d’aujourd’hui : s’il tombe, son joueur est éliminé.`
        : `L’infanterie tient le site ${duration} à sa force d’aujourd’hui, puis il change de main.`,
    collect: 'ramasser',
    collectConsequence:
      'Marche vers le dernier relevé de la caisse et ramène ce que la pile peut porter.',
    /** **Raser** (demande du 15/09) : en dernière position et en encre rouge, parce que c'est
     *  la seule branche de la rose dont rien ne revient. La confirmation dit le détail. */
    demolish: 'raser',
    demolishConsequence: 'Efface ce bâtiment. Rien de l’acier payé n’est rendu.',
    /**
     * **Un point à soi se commande au clic droit** (décision de Pierre, 16/09, Registre 27). La
     * qualification décisionnelle est son niveau, comme pour un bâtiment : c'est lui qui dit ce
     * que le point porte — son rayon, ses emplacements — et le pays se lit déjà sous le réticule.
     */
    myOutpost: (level: number) => `mon avant-poste · niveau ${level}`,
    raiseConsequence: (level: number) =>
      `Ouvre un chantier : ce point passe au niveau ${level}, avec le rayon qui va avec.`,
    /** Le métier en cours : la branche est marquée, et cliquer ne change rien — il n'y a rien
     *  à changer. La phrase le dit plutôt que de laisser croire à un geste sans effet. */
    specializationHeld: 'Le métier que ce point exerce déjà.',
    specializeConsequence: (name: string) => `Change le métier de ce point : ${name}.`,
    /** **Démanteler** (décision du 16/09) : jumelle de « raser », en dernier et en encre rouge.
     *  Ce qu'elle emporte en plus — la couleur du sol et les bâtiments ancrés — se lit sur la
     *  confirmation, qui a la place de le dire en chiffres. */
    dismantle: 'démanteler',
    dismantleConsequence:
      'Efface ce point, sa couleur et ce qu’il ancre. Rien de l’acier payé n’est rendu.',
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
    noRefund: 'aucun remboursement de l’acier payé',
    freed: (region: string) => `libère ${region}`,
    /** Le chantier repris, et ce que la file en rend : une entrée qui court a déjà consommé son
     *  tour, et elle ne rend rien — la même règle qu'une annulation ordinaire. */
    queueCancelled: 'chantier en file annulé',
    queueRefund: 'remboursé :',
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
    /** Le dépôt (ADR 0028 §4) : il rentre au plateau personnel, dans la limite de l'entrepôt. */
    depot: (returned: number, lost: number) =>
      `le dépôt rend ${returned} au plateau personnel${lost > 0 ? `, ${lost} perdus faute de place` : ''}`,
    noRefund: 'aucun remboursement — ni la fondation, ni les élévations',
    submit: 'démanteler — irréversible',
  },

  /**
   * **Le mode de pose** (ADR 0013, révision du 04/09) : le joueur tient un bâtiment et cherche
   * le point où il le pose. Trois mots — ce qu'on tient, ce qu'on cherche, comment on renonce —
   * parce que c'est un état sans bouton, et qu'un état sans bouton doit dire sa sortie.
   */
  placing: {
    hint: 'cliquez ou lâchez pour poser — Échap pour renoncer',
    noGround: 'visez la terre ferme — rapprochez-vous si les régions ne sont pas dessinées',
  },

  construction: {
    kicker: 'chantier',
    offerHeader: 'à poser',
    depositReason: (deposits: ReadonlyArray<string>) =>
      `sur un gisement libre de ${deposits.join(' ou ')}`,
    coastalReason: 'sur la côte',
    // The blocking reason is written once, at the head of the panel — never as fifteen grey
    // badges. A running site names nothing, since the queue takes
    // everything the player can pay for (25/08).
    heldByMaterials: 'Matières insuffisantes pour les lignes en rouge.',
    /**
     * A launched season whose foundation is not placed is a normal state — so it is said, and
     * said where the placement happens. What the format takes back is the price and the wait;
     * the region stays the player's, and the sentence has to make that difference audible.
     */
    foundationNotice: (owed: string) =>
      `Socle de la saison : ${owed}. Pose gratuite et immédiate — le lieu reste votre choix.`,
    /** **L'effet se produit hors du champ où l'on a cliqué** : le panneau se referme sur la carte
     *  et le chantier part dans un bureau qui vit ailleurs. La phrase nomme les deux, sinon le
     *  joueur ne sait ni que ça a pris, ni où le retrouver. « Commandé » et non « mis en file » :
     *  le premier de la file démarre, et l'avis ne doit pas mentir sur le cas le plus courant. */
    queued: (building: string) => `${building} : chantier commandé — voir Économie.`,
    free: 'offert',
    immediate: 'immédiat',
    /** The rest of the catalogue, below the offer: what the nation cannot order yet. */
    elsewhereHeader: 'pas encore',
    /** After the name, never instead of it: what the nation already stands, all regions
     *  together. Hidden at zero — a column of « 0 déjà bâti » is noise, not a count. */
    built: (count: number) => `${count} déjà bâti${plural(count, '', 's')}`,
    blocked: {
      /** L'avant-poste qui couvrait cette région est détruit : ses bâtisses restent debout,
       *  son ancre est morte (ADR 0020 §10). */
      outOfReach: 'plus aucun avant-poste ne couvre cette région',
      unique: 'un seul quartier général par nation',
      locked: (card: ResearchCard | null) =>
        card === null
          ? 'posez d’abord votre quartier général'
          : `demande la recherche ${cardName(card)}`,
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
    /** The holder of a deposit, as its map label says it: mine (a level once it stands), or known held. */
    depositHeld: ({ mine, level }: { mine: boolean; level: number | null }) =>
      !mine ? 'exploité' : level === null ? 'votre chantier' : `à vous · niveau ${level}`,
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
    artillery: {
      kind: 'combat',
      strongAgainst: ['infanterie', 'blindé'],
      weakAgainst: ['infanterie au contact', 'bombardier'],
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

/** `l’entrepôt`, `le dépôt`, `la caserne` — the building designated rather than counted, for
 *  a sentence that tells the player which one to go and raise. */
export const theBuilding = (key: BuildingKey): string => {
  const name = lowerFirst(fr.buildings[key]);
  return startsWithVowel(name)
    ? `l’${name}`
    : `${fr.buildingGender[key] === 'f' ? 'la' : 'le'} ${name}`;
};

/** `une seconde caserne`, `un second port` — the building a parallel queue would need. */
export const aSecondBuilding = (key: BuildingKey): string =>
  `${fr.buildingGender[key] === 'f' ? 'une seconde' : 'un second'} ${lowerFirst(fr.buildings[key])}`;

/**
 * **Le refus sous le fantôme, dans les mots du serveur** (ADR 0029) : chaque code de
 * `aimVerdict` passe par la phrase même que `constructions.start` renverrait.
 */
export function aimRefusalText(
  refusal: NonNullable<AimVerdict['refusal']>,
  key: BuildingKey,
  reach: { readonly widestKm: number; readonly hasOutposts: boolean },
  lockedBy: ResearchCard | null,
  expected: ReadonlyArray<DepositKey>,
): string {
  const errors = fr.errors;
  switch (refusal.code) {
    case 'NO_GROUND':
      return fr.placing.noGround;
    case 'OUT_OF_REACH':
      return errors.OUT_OF_OUTPOST_REACH({
        reachKm: reach.widestKm,
        hasOutposts: reach.hasOutposts,
      });
    case 'DEPOSIT_REQUIRED':
      return errors.DEPOSIT_REQUIRED({ building: key, expected });
    case 'TOO_CLOSE':
      return errors.BUILDING_TOO_CLOSE({ near: refusal.near, km: refusal.km });
    case 'RESEARCH_REQUIRED':
      return errors.RESEARCH_REQUIRED({ card: lockedBy });
    case 'HQ_FIRST':
    case 'DEPOSIT_TAKEN':
    case 'NOT_COASTAL':
    case 'UNKNOWN_BUILDING':
      return errors[refusal.code]();
  }
}

/** `de l’usine`, `du port`, `de la caserne` — the building a distance is measured from. */
export const ofTheBuilding = (key: BuildingKey): string => {
  const the = theBuilding(key);
  return the.startsWith('le ') ? `du ${the.slice(3)}` : `de ${the}`;
};

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
const modeSummary = (mode: SeasonMode, theatre: string | null): string =>
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
  return durationHours === null ? fr.lobby.paceNone : fr.lobby.pace(durationHours);
}

/** « ce soir, 21:00 » : le rendez-vous d'une Blitz, dans l'heure de qui le lit. */
export const rendezvousLabel = (at: number, now: number): string =>
  `${fr.table.dayWord(at, now)}, ${fr.table.hour(at)}`;

/** « 2 h 14 », « 14 min », « 3 j 06 h » : ce qui reste avant une heure dite, ou ce qu'on a tenu. */
export function countdownLabel(milliseconds: number): string {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)} j ${String(hours % 24).padStart(2, '0')} h`;
}

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
const ofTheBuildingName = (value: unknown): string =>
  typeof value === 'string' && value in fr.buildings
    ? ofTheBuilding(value as BuildingKey)
    : `de ${str(value)}`;
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
