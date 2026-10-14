/**
 * The game's identifier vocabulary — stable English ids, shared by the Convex functions and
 * the client. Display names live in `src/i18n/fr.ts`; nothing here is ever shown to a player.
 * This module must stay dependency-free: the Convex bundler imports it through relative paths.
 */

export const NATIONS = [
  'france',
  'uk',
  'usa',
  'ussr',
  'germany',
  'japan',
  'italy',
  'china',
] as const;

export type Nation = (typeof NATIONS)[number];

export type UnitRole =
  | 'infantry'
  | 'armor'
  | 'landTransport'
  | 'fighter'
  | 'bomber'
  | 'airTransport'
  | 'escort'
  | 'cargo'
  | 'carrier';

export type UnitTier = 1 | 2;

/**
 * `march` is the plain one, and it was missing until ADR 0019 §7: go to a point and stay there.
 * Every other order comes back — it is the only one whose column has an address at the end of
 * it.
 *
 * `return` is the only one no player ever orders: a routed column and a column that has fought
 * are put on the road home by the resolution itself, outside the slots. It is a movement all
 * the same — it takes time, it can be seen, and it can be intercepted.
 *
 * `recall` is **history**: it was the one order a garrison could give, back when where a column
 * stood decided what it could ask for. ADR 0019 removed that origin and the word with it, but
 * columns recalled before the change are still walking and their documents still say `recall` —
 * so the vocabulary keeps it and `ORDERABLE_TYPES` no longer offers it.
 *
 * **Révision du 29/08/2026 : `decoy` a quitté cette liste.** Le leurre a été retiré du jeu, et
 * c'est la différence avec `recall` : un rappel en vol atterrit encore, un leurre ne fait plus
 * rien nulle part. Le mot reste dans le validateur Convex — et là seulement — le temps que les
 * documents déjà écrits partent au prochain wipe (`convex/validators.ts`).
 */
export type MovementType = 'march' | 'attack' | 'raid' | 'outpost' | 'recall' | 'agent' | 'return';

/**
 * The eight resources of the economy v2 (ADR 0015). The five first are extracted from a
 * deposit, the three last are transformed from them — one step of chain, never two.
 */
export const RESOURCES = [
  'food',
  'textile',
  'coal',
  'oil',
  'ore',
  'alloy',
  'ammunition',
  'bandages',
] as const;

export type ResourceKey = (typeof RESOURCES)[number];

/**
 * The five map resources of the economy v2 (ADR 0015): what a region can hold, one at most.
 * Baked offline into `public/deposits.json` by `scripts/generate-deposits.mjs` — no game rule
 * derives a deposit at runtime.
 */
export const DEPOSITS = ['food', 'textile', 'coal', 'oil', 'ore'] as const;

export type DepositKey = (typeof DEPOSITS)[number];

/**
 * The buildings of the economy v2 (ADR 0015), in family order: command, exploitation,
 * transformation, projection, intelligence, ceiling, storage. Every one of them sits on a
 * region, and none exists before it is built.
 *
 * There are fifteen. The ADR, the design sheet and the prompt all say "fourteen" and then
 * list these fifteen — the count is the typo, the table is the decision.
 */
export const BUILDINGS = [
  'hq',
  'farm',
  'mill',
  'mine',
  'oilWell',
  'foundry',
  'arsenal',
  'quartermaster',
  'barracks',
  'airfield',
  'port',
  'listening',
  'billets',
  'warehouse',
  'depot',
  'city',
] as const;

export type BuildingKey = (typeof BUILDINGS)[number];

// Persisted keys remain valid for old buildings, queues, notices and price readers.
export const canonicalBuildingKey = (key: BuildingKey): Exclude<BuildingKey, 'depot'> =>
  key === 'depot' ? 'warehouse' : key;

/** La ville n'existe qu'en Blitz, posée par la carte de départ : rien ne la bâtit. */
export const BUILDABLE_BUILDINGS = BUILDINGS.filter(
  (key) => key !== 'city' && canonicalBuildingKey(key) === key,
);

/**
 * **Ce qui se tarife au barème des chantiers** — les quinze bâtiments, et l'élévation d'un
 * avant-poste depuis le 15/09 (précision de l'ADR 0020 §10).
 *
 * `outpost` est une **clé de coût**, jamais une clé de bâtiment : rien ne se pose sur une région
 * sous ce nom, il n'a ni gisement, ni côte, ni emplacement, et le tordre en `BuildingKey` aurait
 * fait entrer un seizième bâtiment dans chaque table exhaustive du jeu. Il ne vit que là où l'on
 * demande un prix et une durée (`buildCost`, `buildMinutes`) et dans la file qui les paie.
 */
export type BuildCostKey = BuildingKey | 'outpost';

/** L'élévation d'un avant-poste, distinguée d'un chantier de bâtiment par sa seule clé. */
export const isOutpostWork = (key: BuildCostKey): key is 'outpost' => key === 'outpost';

export type PlayableRegion = 'europe' | 'europe-med' | 'world';

export type RegionType = 'plain' | 'forest' | 'jungle' | 'mountain' | 'desert' | 'tundra';

/**
 * What an outpost is *for*, chosen when it is founded and never changed again (fiche 03).
 *
 * **Extraction is gone** (decision of 18/08): an outpost replaces no building. Extracting
 * abroad is the economy's own buildings (ADR 0015), put up in the reach the outpost opens —
 * counted, capped and lootable like any other, which an outpost was never going to be.
 *
 * The two that remain both do what they sell: the relay speeds up the stretch of its owner's
 * roads that passes inside its reach, the listening post files a sighting against what crosses
 * the same reach. Others are expected — a field pharmacy has been floated — and the union takes
 * them without a migration, which is all they are owed today.
 */
export type Specialization = 'relay' | 'listening';

/** Les deux métiers dans l'ordre où la plate et le panneau les présentent — une seule liste,
 *  pour que la rose des vents et la fenêtre ne puissent pas les ranger différemment. */
export const SPECIALIZATIONS: ReadonlyArray<Specialization> = ['relay', 'listening'];

/**
 * **What caught a movement** (fiche 04), in the order the sheet ranks the four: the ground a
 * player owns, the station he built to hear, the outpost he specialised to listen, and the
 * company he left standing.
 *
 * It travels to the observer and to nobody else. Naming it leaks nothing about what walked
 * past — it is a fact about his own board, and it is the difference between "quelque chose a
 * été vu" and "ma station de Prahova l'a vu", which is the difference between a line of
 * flavour and a reason to build one.
 */
export type Detector = 'territory' | 'station' | 'outpost' | 'troop';

/** Land, sea, sky — the three environments a route can traverse. */
export type Medium = 'land' | 'sea' | 'air';
