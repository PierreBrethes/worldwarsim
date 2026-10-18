import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRun, renderReference } from './exporter-etat-reference.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const french = readFileSync(root + 'src/i18n/fr.ts', 'utf8');

/**
 * L'instantané que le rendu doit savoir mettre en page : une ligne de chaque forme que
 * `playerView` sert, pas une saison plausible. Il tient lieu de contrat — un champ qui change de
 * forme casse ici avant de casser le document.
 */
const snapshot = {
  playerView: {
    loadedAt: 1_757_000_000_000,
    journalReadAt: 1_756_900_000_000,
    season: {
      number: 1,
      durationHours: 48,
      elapsedHours: 21.7,
      players: 3,
      playableRegion: 'world',
      reduction: {
        target: 1,
        concludedAt: null,
        winnerNation: null,
        standings: [
          { nation: 'Japon', nickname: 'pierre', isMine: true, isReduced: false, reduced: 0 },
          { nation: 'URSS', nickname: 'lena', isMine: false, isReduced: true, reduced: 1 },
        ],
      },
    },
    me: {
      nation: 'Japon',
      creator: true,
      defeated: false,
      mayConclude: true,
      founderAbsence: null,
      ink: '#a44a5e',
      progress: 0,
      hqLevel: 2,
      tier2HqLevel: 3,
      starving: false,
      restWindow: { startMinutes: 720, endMinutes: 1140 },
      foundation: ['hq'],
      recruiting: ['b2'],
      resources: {
        food: { stock: 412, ratePerHour: 18.5, cap: 2000 },
        alloy: { stock: 1360, ratePerHour: -4, cap: 5000 },
      },
      chains: [
        {
          by: 'foundry',
          output: 'alloy',
          inputs: [{ resource: 'ore', quantity: 2 }],
          perHour: 6,
          nominalPerHour: 8,
          level: 2,
          state: 'starved',
          missing: ['ore'],
          commanded: false,
          order: null,
          maxOrder: 0,
        },
      ],
      extraction: [{ key: 'mine', regionId: 'JPN.20', level: 1, deposit: 'ore', perHour: 12 }],
      upkeep: {
        troops: 6,
        unsupplied: 1,
        foodPerHour: 9,
        outposts: 1,
        outpostFoodPerHour: 2,
        outpostCoalPerHour: 2,
      },
      regions: [
        {
          id: 'JPN.20',
          name: 'Kanto',
          deposit: 'ore',
          coastal: true,
          point: [139.7, 35.7],
          buildings: [{ key: 'hq', level: 2 }],
          site: { outpostId: null },
        },
        {
          id: 'MNG.4',
          name: 'Dornogovi',
          deposit: null,
          coastal: false,
          point: [109.1, 44.5],
          buildings: [{ key: 'mine', level: 1 }],
          site: { outpostId: 'o1' },
        },
      ],
      buildings: [
        {
          id: 'b1',
          key: 'hq',
          regionId: 'JPN.20',
          point: null,
          level: 2,
          nextLevelCost: { alloy: 900 },
          nextLevelMinutes: 40,
          cappedByHq: false,
        },
        {
          id: 'b2',
          key: 'mine',
          regionId: 'MNG.4',
          point: [109.1, 44.5],
          level: 1,
          nextLevelCost: { alloy: 300 },
          nextLevelMinutes: 20,
          cappedByHq: true,
        },
      ],
      construction: {
        id: 'c1',
        name: 'barracks',
        key: 'barracks',
        regionId: 'JPN.20',
        regionName: 'Kanto',
        point: null,
        minutesLeft: 12.4,
        level: 1,
      },
      constructionQueue: [
        {
          id: 'c2',
          name: 'caserne',
          key: 'barracks',
          regionId: 'JPN.20',
          regionName: 'Kanto',
          level: 1,
        },
      ],
      outposts: [
        {
          id: 'o1',
          hostCountry: 'Mongolia',
          lonLat: [109.1, 44.5],
          regionId: 'MNG.4',
          specialization: 'extraction',
          level: 1,
          garrison: 2,
          disabledMinutesLeft: null,
          isMine: true,
          specializationLocked: false,
        },
      ],
      armyPresent: { infantry: 3 },
      troops: [
        {
          id: 't1',
          role: 'infantry',
          tier: 1,
          strength: 90,
          nominalStrength: 100,
          stationedAt: { kind: 'home' },
          supplied: true,
        },
        {
          id: 't2',
          role: 'infantry',
          tier: 1,
          strength: 100,
          nominalStrength: 100,
          stationedAt: { kind: 'outpost', outpostId: 'o1' },
          supplied: false,
        },
        {
          id: 't3',
          role: 'armour',
          tier: 1,
          strength: 100,
          nominalStrength: 100,
          stationedAt: {
            kind: 'point',
            lonLat: [110.2, 45.1],
            country: 'Mongolia',
            coastal: false,
          },
          supplied: true,
        },
      ],
      slots: { total: 2, used: 1 },
    },
    movements: [
      {
        id: 'm1',
        type: 'attack',
        from: { lon: 139.7, lat: 35.7 },
        to: { lon: 109.1, lat: 44.5 },
        points: [],
        legs: [],
        distanceUnits: 21,
        costUnits: 21,
        landCost: 21,
        originCountry: 'Japan',
        originName: 'Kanto',
        destinationCountry: 'Mongolia',
        destinationName: 'Dornogovi',
        troopIds: ['t1'],
        roles: ['infantry'],
        departedAt: 1_756_990_000_000,
        arrivesAt: 1_757_010_000_000,
        holdUntil: null,
      },
    ],
    detected: [
      {
        id: 'm9',
        from: { lon: 0, lat: 0 },
        to: { lon: 1, lat: 1 },
        points: [],
        legs: [],
        distanceUnits: 40,
        costUnits: 40,
        landCost: 40,
        departedAt: 1_756_980_000_000,
        arrivesAt: 1_757_020_000_000,
        headingAtMe: true,
        seenFrom: 1_756_990_000_000,
        seenTo: 1_756_995_000_000,
        detector: 'troop',
        detectorRegion: null,
      },
    ],
    warEntries: [],
    reports: [],
    buildCatalog: {},
    opponents: [],
    journal: [],
    notices: [
      {
        _id: 'n1',
        _creationTime: 1,
        playerId: 'p1',
        at: 1_756_950_000_000,
        kind: 'constructionFinished',
        building: 'barracks',
        regionId: 'JPN.20',
        regionName: 'Kanto',
        level: 1,
      },
    ],
    press: {
      at: 1_756_980_000_000,
      next: 1_757_000_800_000,
      final: false,
      mine: {
        rank: 1,
        nickname: 'pierre',
        nation: 'Japon',
        defeated: false,
        territory: 0.4,
        industry: 1200,
        military: 800,
        deeds: 3,
        general: 2000,
        since: null,
        delta: null,
      },
      others: [
        {
          playerId: 'p2',
          nickname: 'lena',
          nation: 'URSS',
          rank: 2,
          territory: 0.2,
          general: 900,
          deeds: 1,
          defeated: false,
        },
      ],
    },
  },
  control: [
    {
      playerId: 'p1',
      nation: 'Japon',
      nickname: 'pierre',
      ink: '#a44a5e',
      regions: [
        { id: 'JPN.20', state: 'current' },
        { id: 'MNG.4', state: 'surveyed', seenAt: 1_756_900_000_000 },
      ],
    },
  ],
};

const document = renderReference(snapshot);
const dump = JSON.stringify(snapshot);

/** Les lignes de corps d'un tableau : l'en-tête et son filet nomment des champs, pas des
 *  valeurs, et c'est la valeur qui doit sortir de la vue. */
function valueTokens(markdown) {
  const tokens = [];
  let row = 0;
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) {
      row = 0;
      continue;
    }
    row += 1;
    if (row <= 2) continue;
    for (const cell of line.split('|').slice(1, -1)) {
      for (const token of cell.trim().split(/\s+/)) if (token !== '') tokens.push(token);
    }
  }
  return tokens;
}

const NUMBER = /^[-+]?\d+(\.\d+)?$/;

describe('rendu de l’état de référence', () => {
  /**
   * **Le document ne peut rien dire que la vue n'ait servi.** C'est la règle des contrats de vue
   * portée jusqu'au Markdown : la panne qu'on répare ici est un état de référence qui décrivait
   * des doctrines et de l'acier, un jeu mort depuis le 15/08, parce que son générateur inventait
   * ses propres libellés.
   */
  it('n’imprime aucune valeur absente du JSON servi', () => {
    for (const token of valueTokens(document)) {
      if (token === '—' || NUMBER.test(token)) continue;
      expect(dump.includes(token) || french.includes(token), token).toBe(true);
    }
  });

  /** Chaque section titre le champ dont elle sort, et ce champ existe. */
  it('titre ses sections d’un champ réellement servi', () => {
    const paths = [...document.matchAll(/^#{2,3} .* — `([^`]+)`$/gm)].map((match) => match[1]);
    expect(paths.length).toBeGreaterThan(10);
    for (const path of paths) {
      let value = path === 'control.held' ? snapshot.control : snapshot.playerView;
      for (const step of (path === 'control.held' ? '' : path).split('.').filter(Boolean)) {
        value = step.endsWith('[]') ? value?.[step.slice(0, -2)]?.[0] : value?.[step];
      }
      expect(value, path).not.toBe(undefined);
    }
  });

  it('sert chaque adresse de troupe et chaque site sous son propre titre', () => {
    expect(document).toContain('### `home`');
    expect(document).toContain('### `outpost o1`');
    expect(document).toContain('### site `o1`');
  });

  /** `convex run` journalise avant de rendre : le parseur repart de la première accolade. */
  it('lit le résultat de convex run derrière ses journaux', () => {
    expect(parseRun('log line\n{"a":1}\n')).toEqual({ a: 1 });
    expect(() => parseRun('rien')).toThrow();
  });
});
