/**
 * Bakes `public/deposits.json` — the four deposits of the Mondiale (ADR 0028) laid on
 * admin-1 regions, keyed by the `adm1_code` that `regions.json` carries as `id`.
 *
 * The file is **sparse**: a region without a deposit is absent, and a region never holds two.
 * Everything is decided here, offline: no client rule derives a deposit from a region type at
 * runtime, so the map stays a fact the server and the client read, never recompute.
 *
 * Two regimes, on purpose. Coal, oil and iron come **only** from the curated tables below: an
 * oil field cannot be guessed from a latitude, and a procedural pass would put petroleum in
 * Auvergne. Food is drawn, under a per-nation profile rather than one ceiling for everyone — a
 * deposit must be earned, not wallpapered, and a nation is a shape before it is a size.
 * CORRECTIONS then names the mines that give coal and iron their national shape, and enforces
 * the ADR 0015 rule: every playable nation holds three of the four deposits at home, one
 * deliberate gap, never two — unless the profile declares the exception and says why.
 *
 * The iron table is the old ore table renamed (ADR 0028): a few of its mines dug copper or lead
 * in 1940, and they stay as iron because the map's balance is what they are for. What the move
 * to four deposits cost the band was paid in facts (18/10): Norilsk is nickel and left the
 * iron, Vorkuta gave next to nothing before the Pechora railway of 1941 and left the coal, and
 * Japan gained the Nagasaki pits it lost its silk to.
 *
 * The audit at the end guards three things and fails the build on any of them: an id matching
 * no region, a nation short of two resources, and a home count outside the band — presence is
 * not quantity, and the first pass proved a map can satisfy the ADR rule while handing one
 * nation three times another's economy.
 *
 * **Anything computed over the whole world instead of country by country moves a nation when
 * you edit another one.** It has already cost twice — a global spacing radius, then a single
 * shared random stream — and the symptom never points at the edit that caused it, so keep the
 * scope of every global mechanism as small as the fact it encodes.
 *
 * Usage: node scripts/generate-deposits.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { geoNaturalEarth1 } from 'd3-geo';
import polylabel from 'polylabel';

const WIDTH = 400;
const HEIGHT = 208;

/** Fixes the procedural draw. Nothing else in the game reads it — a season seed is another thing. */
const SEED = 19400901;

/**
 * A node script cannot import `src/domain/ids.ts`; reading the ids back out of it keeps the
 * table below from silently drifting away from the vocabulary the game actually offers.
 */
const idsFrom = (name) => {
  const declared = readFileSync('src/domain/ids.ts', 'utf8').match(
    new RegExp(`const ${name} = \\[([^\\]]*)\\]`),
  );
  return [...(declared?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map(([, id]) => id);
};

const DEPOSITS = idsFrom('DEPOSITS');
const NATIONS = idsFrom('NATIONS');

/** The `adm0_a3` each playable nation sits on, for the home audit only. */
const NATION_COUNTRIES = {
  france: 'FRA',
  uk: 'GBR',
  usa: 'USA',
  ussr: 'RUS',
  germany: 'DEU',
  japan: 'JPN',
  italy: 'ITA',
  china: 'CHN',
};

if (
  NATIONS.length !== Object.keys(NATION_COUNTRIES).length ||
  NATIONS.some((nation) => !Object.hasOwn(NATION_COUNTRIES, nation))
) {
  throw new Error(
    `NATION_COUNTRIES does not match NATIONS in src/domain/ids.ts: ${NATIONS.join(', ')}`,
  );
}

const COAL = {
  'DEU-1572': 'Ruhr — the first coalfield of Europe',
  'DEU-1581': 'Saar — the second German basin, disputed for a century',
  'POL-3146': 'Upper Silesia — the other half of the German war effort',
  'CZE-1612': 'Ostrava — the Bohemian coking coal',
  'UKR-327': 'Donbass — the Soviet furnace',
  'UKR-329': 'Donbass east — Voroshilovgrad pits',
  'RUS-2401': 'Kuzbass — the eastern basin, out of bomber reach',
  'FRA-5334': 'Nord-Pas-de-Calais — the French basin',
  'FRA-5328': 'Lorraine coal, next door to the ore',
  'GBR-2764': 'Midlands — Nottinghamshire pits',
  'GBR-2115': 'South Wales — Rhondda steam coal',
  'GBR-2029': 'Durham — the north-east coalfield',
  'BEL-2': 'Borinage — the Walloon basin',
  'USA-3554': 'Appalachia — West Virginia',
  'USA-3560': 'Pennsylvania anthracite',
  'USA-3546': 'Illinois basin',
  'CHN-1805': 'Shanxi — the Chinese basin',
  'CHN-1813': 'Fushun — the Manchurian open pit',
  'JPN-1829': 'Kyūshū — Chikuhō, the Japanese basin',
  'JPN-1847': 'Hokkaidō — Ishikari',
  'IND-3256': 'Jharia — the Indian coal',
  'AUS-2654': 'Hunter Valley — New South Wales',
  'ZAF-1209': 'Witbank — the Transvaal coal',
  'ITA-5371': 'Sulcis — Carbonia, a town built on the pit in 1938',
};

const OIL = {
  'USA-3536': 'East Texas — the largest field in the world in 1940',
  'USA-3533': 'Oklahoma — Cushing and the Seminole fields',
  'USA-3521': 'California — Signal Hill and Kern County',
  'USA-3535': 'Louisiana — the Gulf coast',
  'MEX-2734': 'Poza Rica — the Mexican Golden Lane',
  'VEN-31': 'Maracaibo — Zulia, the second exporter of the era',
  'VEN-46': 'Oriental basin — Monagas',
  'TTO-55': 'Trinidad — Mayaro, the Caribbean refinery',
  'COL-1317': 'Barrancabermeja — Santander',
  'ARG-1274': 'Comodoro Rivadavia — Chubut',
  'CAN-632': 'Turner Valley — Alberta',
  'AZE-1690': 'Baku — the Absheron derricks, the Soviet oil',
  'RUS-2378': 'Bashkiria — the "second Baku" of the Volga-Urals',
  'RUS-2416': 'Grozny — the Caucasian field',
  'RUS-2616': 'Sakhalin — Okha, the Pacific field',
  'ROU-310': 'Ploiești — the Axis refineries',
  'IRQ-3049': 'Kirkuk — the pipeline to the Mediterranean',
  'IRN-3219': 'Khuzestan — Abadan, the largest refinery on earth',
  'SAU-1098': 'Dhahran — the Eastern Province, just opened',
  'KWT-1665': 'Burgan — Al Ahmadi',
  'BHR-4928': 'Bahrain — the first field of the Gulf',
  'IDN-1230': 'Palembang — southern Sumatra',
  'IDN-1185': 'Balikpapan — eastern Borneo',
  'MYS-1187': 'Miri — Sarawak',
};

const IRON = {
  'FRA-5325': 'Lorraine — the minette iron ore',
  'SWE-190': 'Kiruna — Norrbotten magnetite',
  'NOR-1062': 'Sydvaranger — Kirkenes',
  'ESP-5851': 'Biscay — the Bilbao ore',
  'GBR-2139': 'Furness — Cumbrian haematite',
  'DEU-1576': 'Salzgitter — the Lower Saxon ore',
  'ITA-5380': 'Elba — the Tuscan iron, mined since Rome',
  'RUS-2386': 'Urals — Sverdlovsk, the metallurgical heart',
  'RUS-2362': 'Kursk magnetic anomaly',
  'TUR-2295': 'Divriği — the Anatolian iron',
  'USA-3514': 'Mesabi Range — Minnesota',
  'USA-3562': 'Marquette — the Michigan ranges',
  'CAN-682': 'Sudbury — Ontario nickel',
  'BRA-601': 'Itabira — Minas Gerais',
  'CHL-2695': 'Chuquicamata — Antofagasta copper',
  'ZMB-517': 'Copperbelt — Northern Rhodesia',
  'COD-1897': 'Katanga — copper and uranium',
  'ZAF-1188': 'Sishen — Northern Cape iron',
  'IND-2444': 'Odisha — the Indian iron ranges',
  'CHN-1807': 'Daye — the Hubei iron that fed Hanyang',
  'AUS-2651': 'Yampi Sound — Western Australia',
};

const CURATED = { coal: COAL, oil: OIL, iron: IRON };

/**
 * A latitude band alone puts wheat in New Mexico and in the Altai: temperate says nothing
 * about relief. The great plains are therefore named as boxes — countries, latitudes,
 * longitudes — and the draw picks inside them. The zones stay coarse on purpose; naming a
 * region here would make food curated, which it must not be.
 */
const FOOD_ZONES = [
  {
    note: 'North American corn and wheat belt',
    countries: ['USA', 'CAN'],
    latitudes: [37, 53],
    longitudes: [-104, -80],
  },
  { note: 'Pampas', countries: ['ARG', 'URY'], latitudes: [-38, -29], longitudes: [-64, -53] },
  {
    note: 'southern Brazilian plateau',
    countries: ['BRA'],
    latitudes: [-33, -21],
    longitudes: [-57, -45],
  },
  {
    note: 'Beauce, Picardy and Champagne',
    countries: ['FRA'],
    latitudes: [46, 50],
    longitudes: [0.5, 6],
  },
  { note: 'English lowlands', countries: ['GBR'], latitudes: [50.5, 55], longitudes: [-3, 2] },
  {
    note: 'North European plain',
    countries: ['DEU', 'POL', 'NLD', 'BEL', 'DNK'],
    latitudes: [50, 55],
    longitudes: [3, 23],
  },
  {
    note: 'Danubian plains',
    countries: ['HUN', 'ROU', 'BGR', 'SRB', 'HRV', 'AUT'],
    latitudes: [43, 48],
    longitudes: [16, 29],
  },
  {
    note: 'Bavarian and Swabian plateau',
    countries: ['DEU', 'AUT', 'CHE'],
    latitudes: [47.5, 50],
    longitudes: [7, 14],
  },
  { note: 'Po valley', countries: ['ITA'], latitudes: [44.2, 45.9], longitudes: [8, 12.6] },
  {
    note: 'Tavoliere and the Apulian plain',
    countries: ['ITA'],
    latitudes: [40, 41.8],
    longitudes: [14.5, 18.5],
  },
  { note: 'Sicilian wheat', countries: ['ITA'], latitudes: [36.5, 38.1], longitudes: [12, 15.5] },
  {
    note: 'Castile and Andalusia',
    countries: ['ESP', 'PRT'],
    latitudes: [37, 42],
    longitudes: [-8, 0],
  },
  {
    note: 'black earth belt',
    countries: ['UKR', 'RUS'],
    latitudes: [44, 56],
    longitudes: [28, 60],
  },
  {
    note: 'west Siberian grain',
    countries: ['RUS', 'KAZ'],
    latitudes: [52, 57],
    longitudes: [60, 87],
  },
  { note: 'Anatolian plateau', countries: ['TUR'], latitudes: [37, 41], longitudes: [30, 40] },
  { note: 'Mesopotamia', countries: ['IRQ'], latitudes: [30, 36], longitudes: [42, 48] },
  { note: 'Nile valley', countries: ['EGY'], latitudes: [24, 32], longitudes: [29, 34] },
  { note: 'Ganges plain', countries: ['IND', 'PAK'], latitudes: [24, 32], longitudes: [70, 89] },
  { note: 'North China plain', countries: ['CHN'], latitudes: [32, 41], longitudes: [112, 122] },
  {
    note: 'Sichuan basin and middle Yangzi',
    countries: ['CHN'],
    latitudes: [28, 33],
    longitudes: [103, 118],
  },
  { note: 'Manchurian plain', countries: ['CHN'], latitudes: [43, 48], longitudes: [123, 131] },
  {
    note: 'Japanese rice plains',
    countries: ['JPN', 'KOR'],
    latitudes: [33, 44],
    longitudes: [126, 146],
  },
  {
    note: 'Australian wheat belt',
    countries: ['AUS'],
    latitudes: [-38, -28],
    longitudes: [115, 152],
  },
  { note: 'Canterbury plains', countries: ['NZL'], latitudes: [-46, -40], longitudes: [168, 175] },
  {
    note: 'South African maize triangle',
    countries: ['ZAF'],
    latitudes: [-31, -25],
    longitudes: [24, 31],
  },
];

const FOOD = { spacing: 2.5 };

/**
 * One ceiling for everyone bought fairness by spending variety: seven nations out of eight
 * ended at exactly four food, and outside oil the spread between nations fell to 1.33×. The
 * band belongs on the totals; the shape belongs to each nation. So the ceiling becomes a
 * profile — how much of each resource a nation may hold at home — and every departure from
 * the common profile carries the fact it comes from, never a balancing argument.
 *
 * Only food is drawn, so only food is capped here; coal, oil and iron are placed one by one,
 * and a nation's share of them is shaped in CORRECTIONS instead.
 */
const COMMON_PROFILE = { food: 4 };

/**
 * The two ways out of "one deliberate gap, never two" (ADR 0015). Both are declarations, not
 * silences: `noGap` for a nation that lacks nothing, `secondGap: [resource, why]` for a nation
 * whose asset answers precisely that second lack. The reason is carried as data because the
 * audit prints it on every run — a rule bent in a comment is a rule contradicted by the code
 * six months later, which is exactly how the ADR and this script came apart.
 *
 * A second gap earns its exception only when the nation's asset is the way out of it. A nation
 * whose asset answers something else has no claim.
 */
const declaredNoGap = (nation) => typeof PROFILES[nation].noGap === 'string';
const declaredSecondGap = (nation) => PROFILES[nation].secondGap?.[0];

const PROFILES = {
  // Iron, not bread: Lorraine minette, Normandy at Soumont, Anjou at Segré. Oil is the gap.
  france: { food: 3 },
  // The island that imports its bread — the one nation whose lack is what defines it — and
  // pays for it with Wales, the Midlands and Yorkshire.
  uk: { food: 2 },
  // The profile only keeps the United States from topping the food column as well. This is the
  // open 🔴 of the project, not a slip — the most unreachable player is also the least short of
  // anything, and it is the simulator's job to price that, not this script's to hide it.
  usa: {
    food: 3,
    noGap:
      'nothing among these four deposits was short in the United States of 1940 — its real shortages were rubber, tin and chromium, which the game does not name; inventing an American gap would be the one dishonest line of the table',
  },
  // Black earth and the Urals.
  ussr: { food: 6 },
  // Ruhr, Saar and the central lignite; the iron is the gap, which is why it came from Sweden
  // through Narvik.
  germany: { food: 3 },
  // Imported rice and one single iron mine. The nation that went to war because it had nothing — **oil is the gap**, and it is the whole
  // fuse: the carrier exists in this game to go and fetch it. The second gap it used to declare
  // on iron is withdrawn (25/08/2026): a nation that can neither buy nor take iron cannot play,
  // and Kamaishi is what makes the shortage a shape instead of a wall.
  japan: { food: 2 },
  // Sardinia and Elba for iron; the coal is the gap, hence the dependency on German deliveries.
  italy: { food: 4 },
  // Plains on a scale nothing else matches, over almost no coal and less iron.
  china: { food: 6 },
};

const malformed = NATIONS.flatMap((nation) => {
  const { noGap, secondGap } = PROFILES[nation];
  const faults = [];
  if (noGap !== undefined && !declaredNoGap(nation))
    faults.push(`${nation}: noGap must carry the reason it is granted, not a bare flag`);
  if (secondGap !== undefined) {
    const [resource, why] = Array.isArray(secondGap) ? secondGap : [];
    if (!DEPOSITS.includes(resource))
      faults.push(`${nation}: secondGap must name one of ${DEPOSITS.join(', ')}`);
    if (typeof why !== 'string' || why.trim() === '')
      faults.push(`${nation}: secondGap must say why the nation's asset answers that second lack`);
  }
  return faults;
});

if (malformed.length > 0) {
  throw new Error(`an exception is a sentence, not a flag:\n  ${malformed.join('\n  ')}`);
}

const NATION_OF_COUNTRY = new Map(
  Object.entries(NATION_COUNTRIES).map(([nation, country]) => [country, nation]),
);

const capOf = (country, key) => {
  const nation = NATION_OF_COUNTRY.get(country);
  return (nation ? PROFILES[nation] : COMMON_PROFILE)[key];
};

/**
 * Food only: a region is dropped when it is far smaller than its country's usual one, which is
 * how a city district (Shanghai, Paris) tells itself apart from country side without an
 * absolute threshold that would mean nothing across French departments and Australian states
 * alike. The floor catches the countries whose admin-1 set mixes both scales — the United
 * Kingdom lists Yorkshire next to a London borough, so its median says nothing on its own.
 */
const AREA_SHARE_OF_MEDIAN = 0.4;
const AREA_FLOOR = 0.1;

/**
 * The manual pass that turns a realistic map into a playable one (ADR 0015), and the place
 * where coal and iron take their national shape — the draw only handles food, so
 * a profile's mines are named here one by one. Every line carries the deposit it comes from,
 * never a balancing argument. What is *not* corrected matters as much: France has no oil, and
 * that is the canonical deliberate gap of the game.
 */
const CORRECTIONS = {
  add: {
    // France — iron, not bread: the three basins that fed its steel.
    'ITA-5372': ['iron', 'Montevecchio and Ingurtosu, the lead and zinc of the Iglesiente'],
    'FRA-5275': [
      'iron',
      'Soumont and May-sur-Orne, the Normandy iron basin — second to Lorraine, and exported to the Ruhr',
    ],
    'FRA-5321': ['iron', 'Segré in Anjou, worked without interruption through the period'],

    // Japan — the third basin, after Chikuhō and Ishikari: coal is the one thing the archipelago
    // does hold in quantity, which is what makes its lack of oil a shape rather than poverty.
    'JPN-1864': ['coal', 'the Jōban coalfield around Iwaki, which burned in the Tokyo factories'],
    'JPN-3500': ['coal', 'Takashima and Hashima, the Mitsubishi undersea pits off Nagasaki'],
    /**
     * And the one iron. Drawn from nothing, Japan held **no** iron at all, and with looting not
     * coded there is no road to any: at that point the lack stops being a shape and the nation
     * stops being playable — a nation is never annexed, so it cannot even take a mine (ADR
     * 0004). One region and not two: what is corrected here is the unplayable, never the
     * unequal, and the asymmetry still comes from the map.
     */
    'JPN-1865': [
      'iron',
      'Kamaishi in Iwate, the first blast furnace of Japan and the only iron mine of the archipelago',
    ],

    // United Kingdom — coal is the profile, and the iron that goes with Cumbrian haematite.
    'GBR-2032': ['iron', 'Cleveland ironstone, which fed the Teesside furnaces'],
    'GBR-5688': [
      'coal',
      'the South Yorkshire coalfield around Barnsley — the third of the three, with Wales and the Midlands',
    ],

    // Germany — lignite is the other half of its coal, and the feedstock of synthetic fuel.
    'DEU-1600': ['coal', 'the central German lignite of the Halle-Leipzig field, which fed Leuna'],
    'DEU-3487': ['coal', 'the Lusatian lignite of Brandenburg'],

    // Italy — the third iron, and the reason its steel could exist at all.
    'ITA-5442': ['iron', 'Cogne magnetite in the Aosta valley, smelted on the spot'],

    // USSR — the Urals and the Moscow basin, the depth that let it move its industry east.
    'RUS-2379': [
      'iron',
      'Magnitnaya mountain at Magnitogorsk, the largest iron works of the country',
    ],
    'RUS-2368': [
      'coal',
      'the Moscow basin lignite around Tula, which kept the capital working when the Donbass fell',
    ],
  },
  // Nothing to take away yet: the capped procedural pass has not put a deposit anywhere the
  // playable map would be better without. Removals belong here when it does.
  remove: {},
};

/**
 * A country whose draw is **frozen**: the hand it was dealt, written out, and the draw skips it.
 *
 * Germany was dealt on its sixteen Länder. Cutting Bavaria, Baden-Württemberg and Hesse into
 * their districts (07/10/2026) changed the candidates and the shuffle with them, and the draw
 * re-dealt its food deposits — a map edit is not a reason for a nation to wake up with other
 * fields. Each deposit stays on its Land. Its three textile deposits left with the resource
 * (ADR 0028).
 */
const FROZEN_DRAWS = {
  DEU: {
    'DEU-1577': ['food', 'as drawn'],
    'DEU-1580': ['food', 'as drawn'],
    'DEU-3488': ['food', 'as drawn'],
  },
};

const projection = geoNaturalEarth1().fitExtent(
  [
    [0, 0],
    [WIDTH, HEIGHT],
  ],
  { type: 'Sphere' },
);

function mulberry(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(sum / 2);
}

const raw = JSON.parse(readFileSync('public/regions.json', 'utf8'));
const regions = raw.regions.map((region) => {
  const largest = region.p.reduce((a, b) => (ringArea(a) >= ringArea(b) ? a : b));
  const point = polylabel([largest], 0.5);
  const lonLat = projection.invert(point);
  return {
    id: region.id,
    country: region.country,
    name: region.n,
    area: region.p.reduce((sum, ring) => sum + ringArea(ring), 0),
    point,
    longitude: lonLat[0],
    latitude: lonLat[1],
  };
});

const byId = new Map(regions.map((region) => [region.id, region]));
const byCountry = regions.reduce((groups, region) => {
  const group = groups.get(region.country);
  if (group) group.push(region);
  else groups.set(region.country, [region]);
  return groups;
}, new Map());

const medianAreaByCountry = new Map(
  [...byCountry].map(([country, group]) => {
    const areas = group.map((region) => region.area).sort((a, b) => a - b);
    return [country, areas[Math.floor(areas.length / 2)]];
  }),
);

const unknown = [];
const deposits = new Map();

for (const [key, table] of Object.entries(CURATED)) {
  for (const id of Object.keys(table)) {
    if (!byId.has(id)) unknown.push(`${key}: ${id}`);
    else deposits.set(id, key);
  }
}

/**
 * Added before the draw, not after: a correction places a mine, and the procedural pass must
 * see that region as taken. Applied afterwards, the Lusatian lignite would have overwritten a
 * Brandenburg farm and quietly cost Germany a food deposit. Only the removals stay at the end.
 */
for (const [id, [key]] of Object.entries(CORRECTIONS.add)) {
  if (!byId.has(id)) unknown.push(`corrections.add: ${id}`);
  else deposits.set(id, key);
}

for (const [country, hand] of Object.entries(FROZEN_DRAWS)) {
  for (const [id, [key]] of Object.entries(hand)) {
    if (byId.get(id)?.country !== country) unknown.push(`frozen draw ${country}: ${id}`);
    else deposits.set(id, key);
  }
}

const inZone = (region, zone) =>
  zone.countries.includes(region.country) &&
  region.latitude >= zone.latitudes[0] &&
  region.latitude <= zone.latitudes[1] &&
  region.longitude >= zone.longitudes[0] &&
  region.longitude <= zone.longitudes[1];

const worthPlanting = (region) =>
  region.area >=
  Math.max(AREA_FLOOR, AREA_SHARE_OF_MEDIAN * medianAreaByCountry.get(region.country));

const inAnyZone = (zones, { farmland }) =>
  regions.filter(
    (region) => (!farmland || worthPlanting(region)) && zones.some((zone) => inZone(region, zone)),
  );

const hash = (text) => {
  let value = 0;
  for (let i = 0; i < text.length; i++) value = (Math.imul(value, 31) + text.charCodeAt(i)) >>> 0;
  return value;
};

/**
 * Greedy draw, country by country: cap first, then spacing, so a country cannot be covered
 * and two deposits of the same kind never touch.
 *
 * Both the spacing and the draw itself are **local to a country**. Spacing, because what must
 * not clump is one nation's own economy — a French pick has no business blocking the Italian
 * one thirty kilometres across the border, and a global radius did exactly that to Biella.
 * The draw, because one shared stream made every country's result depend on every other one:
 * widening a Chinese zone silently cost Japan a silk district. Seeding per country and per
 * resource keeps an edit where it was made.
 */
function scatter(key, candidates, { spacing }) {
  const byCandidateCountry = new Map();
  for (const region of candidates) {
    const group = byCandidateCountry.get(region.country);
    if (group) group.push(region);
    else byCandidateCountry.set(region.country, [region]);
  }

  for (const [country, group] of byCandidateCountry) {
    if (Object.hasOwn(FROZEN_DRAWS, country)) continue;
    const random = mulberry(SEED + hash(`${key}:${country}`));
    const shuffled = group
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((region) => ({ region, score: random() }))
      .sort((a, b) => b.score - a.score)
      .map(({ region }) => region);

    const cap = Math.min(Math.ceil((byCountry.get(country)?.length ?? 1) / 4), capOf(country, key));
    const placed = [];
    for (const region of shuffled) {
      if (placed.length >= cap) break;
      if (deposits.has(region.id)) continue;
      const tooClose = placed.some(
        (other) =>
          Math.hypot(other.point[0] - region.point[0], other.point[1] - region.point[1]) < spacing,
      );
      if (tooClose) continue;
      placed.push(region);
      deposits.set(region.id, key);
    }
  }
}

scatter('food', inAnyZone(FOOD_ZONES, { farmland: true }), FOOD);

for (const id of Object.keys(CORRECTIONS.remove)) {
  if (!byId.has(id)) unknown.push(`corrections.remove: ${id}`);
  else deposits.delete(id);
}

const output = Object.fromEntries([...deposits].sort(([a], [b]) => (a < b ? -1 : 1)));
writeFileSync('public/deposits.json', JSON.stringify(output));

const total = Object.keys(output).length;
const perKey = DEPOSITS.map(
  (key) => `${key} ${[...deposits.values()].filter((v) => v === key).length}`,
).join(', ');
console.log(`${total} deposits on ${regions.length} regions — ${perKey}\n`);

const home = Object.fromEntries(
  NATIONS.map((nation) => [
    nation,
    DEPOSITS.map(
      (key) =>
        regions.filter(
          (region) =>
            region.country === NATION_COUNTRIES[nation] && deposits.get(region.id) === key,
        ).length,
    ),
  ]),
);

/**
 * A shape is read against the other seven, not against a table repeating itself: a nation is
 * over on a resource when it holds strictly more of it than the median nation, and short when
 * it holds strictly less. Measuring the map that came out beats checking a declaration against
 * itself.
 */
const medians = DEPOSITS.map((_, i) => {
  const column = NATIONS.map((nation) => home[nation][i]).sort((a, b) => a - b);
  return (column[column.length / 2 - 1] + column[column.length / 2]) / 2;
});
const ceilings = DEPOSITS.map((_, i) => Math.max(...NATIONS.map((nation) => home[nation][i])));

const shapeOf = (nation) => ({
  over: DEPOSITS.filter((_, i) => home[nation][i] > medians[i]),
  short: DEPOSITS.filter((_, i) => home[nation][i] < medians[i]),
  atEveryCeiling: DEPOSITS.every((_, i) => home[nation][i] >= ceilings[i]),
});

const column = 9;
console.log(
  `${'nation'.padEnd(9)}${DEPOSITS.map((key) => key.padStart(column)).join('')}${'total'.padStart(column)}   profile`,
);
const starved = [];
const flat = [];
const dominant = [];
const unmet = [];
const homeTotals = [];
for (const nation of NATIONS) {
  const counts = home[nation];
  const homeTotal = counts.reduce((sum, count) => sum + count, 0);
  homeTotals.push({ nation, homeTotal });

  const missing = DEPOSITS.filter((_, i) => counts[i] === 0);
  const excused = declaredSecondGap(nation);
  if (excused !== undefined && !missing.includes(excused))
    unmet.push(`${nation} declares a second gap on ${excused} it does not have`);
  const undeclared = missing.filter((key) => key !== excused);
  if (undeclared.length >= 2) starved.push(`${nation} lacks ${undeclared.join(' and ')}`);

  const { over, short, atEveryCeiling } = shapeOf(nation);
  if (atEveryCeiling) dominant.push(nation);
  if (over.length === 0) flat.push(`${nation} is over on nothing`);
  else if (short.length === 0 && !declaredNoGap(nation)) flat.push(`${nation} is short of nothing`);

  const shortText =
    short.length > 0
      ? `−${short.join(' ')}`
      : declaredNoGap(nation)
        ? '(no gap, declared)'
        : '−nothing';
  // The deliberate gap is an absence, and an absence never reads as "below the median" when
  // six nations out of eight sit at zero oil. It gets its own mark.
  const absent = missing.length > 0 ? `  ∅${missing.join(' ')}` : '';
  console.log(
    `${nation.padEnd(9)}${[...counts, homeTotal].map((count) => String(count).padStart(column)).join('')}   +${over.join(' ')} ${shortText}${absent}`,
  );
}

/**
 * Printed on every run, not kept in a comment: an exception that nobody reads is a rule that
 * has been dropped. Both are read straight from the profiles, so a granted exception and the
 * sentence that grants it cannot drift apart.
 */
console.log('\ndeclared exceptions (ADR 0015):');
for (const nation of NATIONS) {
  const { noGap, secondGap } = PROFILES[nation];
  if (noGap !== undefined) console.log(`  ${nation.padEnd(9)}${'noGap'.padEnd(15)}${noGap}`);
  if (secondGap !== undefined)
    console.log(`  ${nation.padEnd(9)}${`secondGap ${secondGap[0]}`.padEnd(15)}${secondGap[1]}`);
}

/**
 * Presence is not quantity. The ADR 0015 rule validates a start where one nation holds three
 * times another's economy, and a home deposit is acquired for good — a nation is never
 * annexed (ADR 0004), so it can be raided, never taken. Below the band, raiding one German
 * mine costs a fifth of its coal and one American mine an eighth: the same act does not buy
 * the same thing, and the gap runs the wrong way, towards the nation nobody can reach.
 */
const BAND = 2;
const richest = homeTotals.reduce((a, b) => (a.homeTotal >= b.homeTotal ? a : b));
const poorest = homeTotals.reduce((a, b) => (a.homeTotal <= b.homeTotal ? a : b));
const lopsided = richest.homeTotal > BAND * poorest.homeTotal;
console.log(
  `\nhome spread ${poorest.nation} ${poorest.homeTotal} → ${richest.nation} ${richest.homeTotal}, band ${BAND}×`,
);

/**
 * Printed because it is the measure the profiles exist for. With one ceiling for everyone this
 * sat at 1.33×: every nation held roughly the same, and the only asymmetry left on the map was
 * whether you had oil. Oil carries the expansion of the whole game on its own; it must not also
 * carry all of the geography.
 */
const withoutOil = NATIONS.map((nation) => ({
  nation,
  count: home[nation].reduce((sum, count, i) => sum + (DEPOSITS[i] === 'oil' ? 0 : count), 0),
}));
const leanest = withoutOil.reduce((a, b) => (a.count <= b.count ? a : b));
const fullest = withoutOil.reduce((a, b) => (a.count >= b.count ? a : b));
console.log(
  `without oil ${leanest.nation} ${leanest.count} → ${fullest.nation} ${fullest.count}, spread ${(fullest.count / leanest.count).toFixed(2)}×`,
);

if (unknown.length > 0) {
  console.error(`\nids matching no region:\n  ${unknown.join('\n  ')}`);
}
if (dominant.length > 0) {
  console.error(
    `\nat the ceiling of every resource — the flatness the profiles exist to break: ${dominant.join(', ')}`,
  );
}
if (flat.length > 0) {
  console.error(`\nflat profile — a nation is a shape, not a size:\n  ${flat.join('\n  ')}`);
}
if (unmet.length > 0) {
  console.error(`\nan exception granted for a lack that is not there:\n  ${unmet.join('\n  ')}`);
}
if (starved.length > 0) {
  console.error(
    `\nADR 0015 — one deliberate gap, never two unless declared:\n  ${starved.join('\n  ')}`,
  );
}
if (lopsided) {
  console.error(
    `\nhome deposits outside the ${BAND}× band: ${richest.nation} ${richest.homeTotal} against ${poorest.nation} ${poorest.homeTotal}`,
  );
}
if (
  unknown.length > 0 ||
  starved.length > 0 ||
  unmet.length > 0 ||
  lopsided ||
  flat.length > 0 ||
  dominant.length > 0
)
  process.exit(1);
