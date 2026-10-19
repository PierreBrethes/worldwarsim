import { describe, expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import {
  abbreviateStack,
  buildLabels,
  cartoucheShown,
  NEUTRAL_FLAG,
  ownerFlags,
  type MapLabel,
  type MapMarker,
} from './labels';
import type { ArcView, PlayerView } from './player-view';
import { directRoute } from './routing';
import { asLocalTime } from './duration';

const LOADED_AT = 1_700_000_000_000;

const mineArc = (override: Partial<Extract<ArcView, { state: 'mine' }>>): ArcView => ({
  state: 'mine',
  id: 'mv-1',
  from: [0, 0],
  to: [1, 1],
  route: directRoute([0, 0], [1, 1], 'land', 10),
  originCountry: 'United Kingdom',
  destinationCountry: 'Italy',
  originLabel: 'Royaume-Uni',
  destinationLabel: 'Italie',
  type: 'attack',
  stack: { infantry: 24, armor: 6 },
  troopIds: [],
  minutesLeft: 30,
  borderWait: null,
  progress: 0.5,
  ...override,
});

const detectedArc = (override: Partial<Extract<ArcView, { state: 'enemyDetected' }>>): ArcView => ({
  state: 'enemyDetected',
  detector: 'troop',
  detectorRegion: null,
  id: 'mv-x',
  from: [0, 0],
  to: [1, 1],
  route: directRoute([0, 0], [1, 1], 'land', 10),
  headingDegrees: 87,
  headingAtMe: false,
  identification: { pierced: false },
  estimatedMinutesLeft: 100,
  watchMinutesLeft: 12,
  since: 0,
  progress: 0.34,
  ...override,
});

const viewWith = (
  arcs: ReadonlyArray<ArcView>,
  captures: PlayerView['captures'] = [],
): PlayerView =>
  ({ arcs, captures, loadedAt: LOADED_AT, me: { ink: '#2f4f78' } }) as unknown as PlayerView;

const OUTPOST: MapMarker = {
  kind: 'outpost',
  id: 'ap-1',
  lonLat: [8.5, 61.4],
  hostCountry: 'Norway',
  station: { kind: 'outpost', outpostId: 'ap-1' },
  specialization: 'relay',
  level: 2,
  standsAt: null,
  garrison: 40,
  reach: null,
  ink: '#4a4f7a',
};

const texts = (lines: ReadonlyArray<{ readonly role: string }>) =>
  lines.map((line) => ('text' in line ? line.text : `countdown:${line.role}`));

describe('buildLabels', () => {
  it('rings the site a capture aims at, on the side that reads it', () => {
    const capture = {
      id: 'c-1',
      side: 'defender' as const,
      target: { kind: 'outpost' as const, id: 'ap-1' },
      site: { kind: 'outpost' as const, hostCountry: 'NOR', level: 2 },
      regionName: null,
      point: [8.5, 61.4] as const,
      clock: { progress: 0, at: LOADED_AT, rate: 1, durationMs: 3_600_000, rest: null },
      completesAt: LOADED_AT + 3_600_000,
      stoppedAt: null,
    };
    const [label, ...others] = buildLabels(viewWith([], [capture]), [OUTPOST]);
    expect(others).toEqual([]);
    expect(label?.lines.at(-1)).toEqual({
      role: 'capture',
      side: 'defender',
      site: capture.site,
      clock: capture.clock,
      completesAt: capture.completesAt,
    });
  });

  it('stands a capture on its own label when no site of the map carries it', () => {
    const capture = {
      id: 'c-2',
      side: 'capturer' as const,
      target: { kind: 'building' as const, id: 'b-9' },
      site: { kind: 'building' as const, building: 'mine' as const, regionId: 'RUS-2335' },
      regionName: 'Pskov',
      point: [28, 57] as const,
      clock: { progress: 0, at: LOADED_AT, rate: 1, durationMs: 3_600_000, rest: null },
      completesAt: LOADED_AT + 3_600_000,
      stoppedAt: null,
    };
    const [label] = buildLabels(viewWith([], [capture]), []);
    expect(label).toMatchObject({ anchor: { kind: 'ground', lonLat: [28, 57] } });
    expect(label?.lines.at(-1)).toMatchObject({ role: 'capture', side: 'capturer' });
  });

  it('prints neither type nor composition of an unidentified enemy movement', () => {
    const [label] = buildLabels(viewWith([detectedArc({})]), []);
    expect(label?.type).toBe('intel');
    expect(label?.identified).toBe(false);
    expect(texts(label!.lines)).toEqual(['countdown:countdown', 'estimé']);
    expect(label?.lines[0]).toEqual({
      role: 'countdown',
      dueAt: LOADED_AT + 100 * 60_000,
      prefix: '~',
    });
  });

  it('says the hold instead of counting down an arrival that will not happen', () => {
    const [label] = buildLabels(
      viewWith([
        mineArc({
          minutesLeft: 0,
          progress: 1,
          borderWait: { resolutionInMinutes: 420 },
        }),
      ]),
      [],
    );
    expect(texts(label!.lines)).toEqual([
      `arrivée retenue · résolution à ${asLocalTime(LOADED_AT + 420 * 60_000)}`,
    ]);
  });

  it('dates the departure of my column, for its bar, from what the view serves', () => {
    const [label] = buildLabels(viewWith([mineArc({ minutesLeft: 30, progress: 0.5 })]), []);
    expect(label?.lines.find((line) => line.role === 'countdown')).toEqual({
      role: 'countdown',
      dueAt: LOADED_AT + 30 * 60_000,
      prefix: '',
      since: LOADED_AT - 30 * 60_000,
    });
    const [done] = buildLabels(viewWith([mineArc({ minutesLeft: 0, progress: 1 })]), []);
    expect(done?.lines.find((line) => line.role === 'countdown')).not.toHaveProperty('since');
  });

  it('keeps the countdown and announces the hold while the column still walks', () => {
    const [label] = buildLabels(
      viewWith([mineArc({ minutesLeft: 30, borderWait: { resolutionInMinutes: 180 } })]),
      [],
    );
    expect(texts(label!.lines)).toEqual([
      'countdown:countdown',
      `retenue à la frontière jusqu’à ${asLocalTime(LOADED_AT + 180 * 60_000)}`,
    ]);
  });

  it('shows the load of my expedition on site in place of its countdown', () => {
    const until = LOADED_AT + 32 * 60_000;
    const [label] = buildLabels(
      viewWith([
        mineArc({
          mission: { kind: 'plunder', phase: 'presence', buildingId: 'b', presenceEndsAt: until },
        }),
      ]),
      [],
    );
    expect(label?.lines[0]).toEqual({ role: 'loading', until });
    expect(label?.lines.some((line) => line.role === 'countdown')).toBe(false);
  });

  it('gives type and composition once intelligence has pierced', () => {
    const [label] = buildLabels(
      viewWith([
        detectedArc({
          headingAtMe: true,
          identification: { pierced: true, type: 'attack', stack: { armor: 30 } },
        }),
      ]),
      [],
    );
    expect(label?.type).toBe('inbound-movement');
    expect(label?.identified).toBe(true);
    expect(texts(label!.lines)).toEqual(['countdown:countdown', 'attaque · 30 BLD']);
  });

  it('never gives national ink to an enemy label', () => {
    const [label] = buildLabels(viewWith([detectedArc({})]), []);
    expect(label?.ink).toBeNull();
  });

  it('ranks priorities from inbound down to the home stack', () => {
    const labels = buildLabels(
      viewWith([
        mineArc({ id: 'mine' }),
        detectedArc({ id: 'at-me', headingAtMe: true }),
        detectedArc({ id: 'elsewhere' }),
      ]),
      [
        OUTPOST,
        {
          kind: 'stack',
          id: 'stack',
          lonLat: [0, 0],
          station: { kind: 'point', lonLat: [0, 0], country: 'FRA', afloat: false, coastal: false },
          stack: { infantry: 4 },
          place: 'France',
          plate: null,
          pieces: { groups: [], troopIds: [], squad: false },
          ink: '#000',
        },
        {
          kind: 'construction',
          id: 'construction',
          lonLat: [0, 0],
          hostCountry: 'United Kingdom',
          name: 'Centre logistique',
          finishedAt: LOADED_AT,
          idle: false,
          ink: '#000',
        },
      ],
    );
    const order = labels
      .slice()
      .sort((first, second) => second.priority - first.priority)
      .map((label) => label.id);
    expect(order).toEqual([
      'at-me',
      'mine',
      'elsewhere',
      'construction',
      'ap-1',
      'stack',
      'arrival-mine',
    ]);
  });

  /** **Le drapeau d'arrivée** (carte-lisible, 03/10) : mes mouvements seuls. Un relevé adverse
   *  ne sert pas de destination (décision 4a), et un souvenir encore moins. */
  it('plants an arrival flag at the end of my movements only', () => {
    const route = directRoute([0, 0], [4, 2], 'land', 10);
    const labels = buildLabels(
      viewWith([
        mineArc({ id: 'mine', route, destinationLabel: 'Ancône' }),
        detectedArc({ id: 'enemy' }),
        {
          state: 'lastKnown',
          detector: 'troop',
          detectorRegion: null,
          id: 'old',
          from: [0, 0],
          to: [1, 1],
          route: directRoute([0, 0], [1, 1], 'land', 10),
          headingDegrees: 10,
          seenMinutesAgo: 5,
          lastSeenAt: 0,
          progress: 0.2,
        },
      ]),
      [],
    );
    const flags = labels.filter((label) => label.type === 'arrival');
    expect(flags.map((flag) => flag.id)).toEqual(['arrival-mine']);
    expect(flags[0]).toMatchObject({
      anchor: { kind: 'ground', lonLat: route.points.at(-1) },
      ink: '#2f4f78',
      lines: [{ role: 'nature', text: 'Ancône' }],
    });
  });

  /** **Un cartouche par pile** : le lieu et le compte, jamais une ligne par troupe. Le poids
   *  voyage à part, pour la rose et pour le regroupement. */
  it('reads a pile as one cartouche, place and headcount', () => {
    const [label] = buildLabels(viewWith([]), [
      {
        kind: 'stack',
        id: 'stack',
        lonLat: [0, 0],
        station: { kind: 'point', lonLat: [0, 0], country: 'ITA', afloat: false, coastal: false },
        stack: { infantry: 2, armor: 1 },
        place: 'Italie',
        plate: null,
        pieces: { groups: [], troopIds: [], squad: false },
        ink: '#000',
      },
    ]);
    expect(texts(label!.lines)).toEqual(['Italie · 3']);
    expect(label?.force).toEqual({ headcount: 3, composition: '2 INF · 1 BLD' });
  });

  /** **Un souvenir se nomme, une maîtrise de la mer non** (ADR 0024 §2) : l'arc figé dit son âge
   *  en toutes lettres, parce que sa seule pâleur ne disait pas s'il datait de dix minutes ou
   *  d'hier soir. */
  it('dates a frozen arc and puts no label on sea control', () => {
    const arcs: ReadonlyArray<ArcView> = [
      {
        state: 'lastKnown',
        detector: 'troop',
        detectorRegion: null,
        id: 'a',
        from: [0, 0],
        to: [1, 1],
        route: directRoute([0, 0], [1, 1], 'sea', 10),
        headingDegrees: 10,
        seenMinutesAgo: 5,
        lastSeenAt: 0,
        progress: 0.2,
      },
      {
        state: 'seaControl',
        id: 'b',
        from: [0, 0],
        to: [1, 1],
        route: directRoute([0, 0], [1, 1], 'sea', 10),
        progress: 0.4,
      },
    ];
    const labels = buildLabels(viewWith(arcs), []);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ type: 'intel', washed: true });
    expect(labels[0]!.lines[0]).toMatchObject({ role: 'mention' });
  });

  it('anchors a movement head on no fixed position', () => {
    const [label] = buildLabels(viewWith([mineArc({})]), []);
    expect(label?.anchor).toEqual({ kind: 'movementHead', arc: 'mv-1' });
  });

  it('names an outpost’s host country, never a stack’s', () => {
    const labels = buildLabels(viewWith([]), [
      OUTPOST,
      {
        kind: 'stack',
        id: 'stack',
        lonLat: [0, 0],
        station: { kind: 'point', lonLat: [0, 0], country: 'FRA', afloat: false, coastal: false },
        stack: { infantry: 4 },
        place: 'France',
        plate: null,
        pieces: { groups: [], troopIds: [], squad: false },
        ink: '#000',
      },
    ]);
    expect(labels[0]?.hostCountry).toBe('Norway');
    expect(labels[1]?.hostCountry).toBeNull();
  });

  /**
   * **Le mât d'un avant-poste ouvre sa garnison** (précision du 04/09) : la colonne qui a fondé
   * y stationne (ADR 0019 §1), et depuis la disparition du widget de troupes plus aucune porte
   * ne l'ouvrait — le seul marqueur cliquable était la pile posée sur un point. L'adresse
   * voyage sur l'étiquette, comme celle d'une pile : c'est elle que le clic gauche ouvre.
   */
  it('carries the address a click opens the garrison of', () => {
    const [label] = buildLabels(viewWith([]), [OUTPOST]);
    expect(label?.station).toEqual({ kind: 'outpost', outpostId: 'ap-1' });
  });

  it('hangs a deposit on its point, without ink, words, or the right to push anything aside', () => {
    const [deposit, building] = buildLabels(viewWith([]), [
      { kind: 'deposit', id: 'deposit-FR-60', lonLat: [2.4, 49.4], deposit: 'coal' },
      {
        kind: 'building',
        id: 'building-FR-60-mine',
        buildingId: 'b-1',
        key: 'mine',
        regionId: 'FR-60',
        regionName: 'Oise',
        lonLat: null,
        hostCountry: 'France',
        name: 'Mine',
        level: 1,
        plate: '/mine.webp',
        works: null,
        reach: null,
        ink: '#2f4f78',
      },
    ]);
    expect(deposit?.anchor).toEqual({ kind: 'ground', lonLat: [2.4, 49.4] });
    expect(deposit?.deposit).toBe('coal');
    expect(deposit?.ink).toBeNull();
    expect(deposit?.lines).toEqual([{ role: 'nature', text: 'charbon' }]);
    expect(deposit?.priority).toBeLessThan(building?.priority ?? 0);
  });

  it('counts down on a mast the battery of the gun garrisoned inside (B20)', () => {
    const [barracks] = buildLabels(viewWith([]), [
      {
        kind: 'building',
        id: 'building-FR-60-barracks',
        buildingId: 'b-1',
        key: 'barracks',
        regionId: 'FR-60',
        regionName: 'Oise',
        lonLat: null,
        hostCountry: 'France',
        name: 'Caserne',
        level: 1,
        plate: '/barracks.webp',
        works: null,
        reach: null,
        emplacedAt: 18_000,
        ink: '#2f4f78',
      },
    ]);
    expect(barracks?.lines).toContainEqual({
      role: 'countdown',
      dueAt: 18_000,
      prefix: fr.battery.prefix,
      clock: true,
    });
  });
});

describe('abbreviateStack', () => {
  it('abbreviates roles and separates with a middle dot', () => {
    expect(abbreviateStack({ infantry: 24, armor: 6 })).toBe('24 INF · 6 BLD');
  });

  it('ignores zeroed roles', () => {
    expect(abbreviateStack({ infantry: 12, armor: 0 })).toBe('12 INF');
  });
});

/**
 * **Les pièces se nomment au survol** (retours de Pierre du 13/10) : au repos la carte montre la
 * planche ou la figurine, le cartouche vient au pointeur — souris qui survole ou doigt qui touche —
 * et reste sur la pièce désignée.
 */
describe('cartoucheShown', () => {
  const named = { role: 'nature', text: 'Arsenal' } as const;
  const rest = { pointed: false, selected: false };

  it('keeps a building, a pile and a neutral objective quiet at rest', () => {
    for (const type of [
      'building',
      'stack',
      'objective',
      'outpost',
      'installation',
      'camp',
    ] as const)
      expect(cartoucheShown({ type, lines: [named] }, rest)).toBe(false);
  });

  it('names the piece the pointer is on, by mouse or by finger', () => {
    expect(cartoucheShown({ type: 'building', lines: [named] }, { ...rest, pointed: true })).toBe(
      true,
    );
  });

  it('keeps naming the selected piece once the pointer has left', () => {
    expect(cartoucheShown({ type: 'stack', lines: [named] }, { ...rest, selected: true })).toBe(
      true,
    );
  });

  it('leaves a running countdown on the board, since it is a duration to watch', () => {
    const due = { role: 'countdown', dueAt: LOADED_AT, prefix: '' } as const;
    expect(cartoucheShown({ type: 'building', lines: [named, due] }, rest)).toBe(true);
    expect(cartoucheShown({ type: 'construction', lines: [named, due] }, rest)).toBe(true);
  });

  it('never quiets a movement head', () => {
    expect(cartoucheShown({ type: 'my-movement', lines: [named] }, rest)).toBe(true);
    expect(cartoucheShown({ type: 'inbound-movement', lines: [named] }, rest)).toBe(true);
  });
});

describe('ownerFlags', () => {
  const label = (over: Partial<MapLabel>): MapLabel =>
    ({ id: 'x', type: 'building', ink: null, installation: null, ...over }) as MapLabel;
  const flagOf = (over: Partial<MapLabel>) =>
    ownerFlags(
      [label(over)],
      (regionId) => (regionId === 'ESP-1' ? '#a83f68' : regionId === 'FRA-1' ? '#2a5ba8' : null),
      '#2a5ba8',
    )[0]!.flag;

  it('plants my ink under my sites and my piles', () => {
    expect(flagOf({ type: 'building', ink: '#2a5ba8' })).toBe('#2a5ba8');
    expect(flagOf({ type: 'stack', ink: '#2a5ba8' })).toBe('#2a5ba8');
  });

  it('plants a neutral white, and the holder my survey saw on a site of another', () => {
    const site = { id: 'b', key: 'city', regionId: 'ESP-1' } as const;
    expect(flagOf({ type: 'installation', installation: { ...site, neutral: true } })).toBe(
      NEUTRAL_FLAG,
    );
    expect(flagOf({ type: 'installation', installation: { ...site, neutral: false } })).toBe(
      '#a83f68',
    );
    expect(
      flagOf({
        type: 'installation',
        installation: { ...site, regionId: 'ESP-2', neutral: false },
      }),
    ).toBeUndefined();
  });

  it('plants none under a site of another whose region my colour holds', () => {
    expect(
      flagOf({
        type: 'installation',
        installation: { id: 'b', key: 'city', regionId: 'FRA-1', neutral: false },
      }),
    ).toBeUndefined();
  });

  it('never plants a flag under an enemy piece', () => {
    expect(flagOf({ type: 'camp', ink: null })).toBeUndefined();
  });
});
