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
import type { ArcView, Composition, PlayerView } from './player-view';
import { directRoute } from './routing';
import { asClockTime, asDayAndTime, asLocalTime } from './duration';

const LOADED_AT = 1_700_000_000_000;
const MINUTE = 60_000;

/** A column out for half an hour, due in `left` minutes, as the server dates it. */
const march = (
  left: number,
  hold: { heldAt?: number; holdUntil?: number } = {},
): Extract<ArcView, { state: 'mine' }>['schedule'] => ({
  departedAt: LOADED_AT - 30 * MINUTE,
  arrivesAt: LOADED_AT + left * MINUTE,
  heldAt: hold.heldAt ?? null,
  holdUntil: hold.holdUntil ?? null,
});

const mineArc = (override: Partial<Extract<ArcView, { state: 'mine' }>>): ArcView => ({
  state: 'mine',
  id: 'mv-1',
  from: [0, 0],
  to: [1, 1],
  route: directRoute([0, 0], [1, 1], 'land', 10),
  originLabel: 'Royaume-Uni',
  destinationLabel: 'Italie',
  type: 'attack',
  stack: { infantry: 24, armor: 6 },
  troopIds: [],
  schedule: march(30),
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
  arrivesAt: LOADED_AT + 100 * MINUTE,
  seenTo: LOADED_AT + 12 * MINUTE,
  since: 0,
  ...override,
});

const viewWith = (
  arcs: ReadonlyArray<ArcView>,
  captures: PlayerView['captures'] = [],
  troops: PlayerView['me']['troops'] = [],
): PlayerView =>
  ({
    arcs,
    captures,
    loadedAt: LOADED_AT,
    me: { ink: '#2f4f78', troops },
  }) as unknown as PlayerView;

const OUTPOST: MapMarker = {
  kind: 'outpost',
  id: 'ap-1',
  lonLat: [8.5, 61.4],
  hostCountry: 'Norway',
  specialty: 'general',
  changingTo: null,
  station: { kind: 'outpost', outpostId: 'ap-1' },
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

  /** **Le compte en anneaux** (#442) : sous le mât de chaque point du meneur ; un point du meneur
   *  qu'on capture empile le compte au-dessus, la jauge de capture dessous. */
  it('rings the leader’s points with the countdown, above the gauge of a capture', () => {
    const mast = (pointId: string): MapMarker => ({
      kind: 'strategic',
      id: `strategic-${pointId}`,
      pointId,
      lonLat: [17.43, 68.44],
      name: 'Narvik',
      ink: '#2b6974',
      state: 'Allemagne',
    });
    const capture = {
      id: 'c-3',
      side: 'defender' as const,
      target: { kind: 'point' as const, id: 'p-1' },
      site: { kind: 'point' as const, key: 'narvik' as const },
      regionName: null,
      point: [17.5, 68.44] as const,
      clock: { progress: 0, at: LOADED_AT, rate: 1, durationMs: 3_600_000, rest: null },
      completesAt: LOADED_AT + 3_600_000,
      stoppedAt: null,
    };
    const rings = {
      leaderNation: 'germany',
      ink: '#2b6974',
      endsAt: LOADED_AT + 86_400_000,
      pointIds: ['p-1'],
      fading: false,
    };
    const [ringed, bare, ...others] = buildLabels(
      { ...viewWith([], [capture]), raceRings: rings },
      [mast('p-1'), mast('p-2')],
    );
    expect(others).toEqual([]);
    expect(ringed!.lines.map((line) => line.role)).toEqual([
      'nature',
      'figures',
      'race',
      'capture',
    ]);
    expect(ringed!.lines[2]).toEqual({
      role: 'race',
      endsAt: rings.endsAt,
      ink: '#2b6974',
      fading: false,
    });
    expect(bare!.lines.map((line) => line.role)).toEqual(['nature', 'figures']);
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
      viewWith([mineArc({ schedule: march(420, { heldAt: LOADED_AT - MINUTE }) })]),
      [],
    );
    expect(texts(label!.lines)).toEqual([
      `arrivée retenue · résolution à ${asLocalTime(LOADED_AT + 420 * 60_000)}`,
    ]);
  });

  /** **Une ronde en route se rappelle de son étiquette** (#376), comme une tournée. */
  it('offers to recall a patrol on its column, and says once it is recalled', () => {
    const patrol = (recalled: boolean) =>
      [
        {
          id: 'p',
          role: 'infantry',
          patrol: { ends: ['a', 'b'], to: 'b', haltUntil: null, recalled, waiting: null },
        },
      ] as unknown as PlayerView['me']['troops'];
    const arc = mineArc({ troopIds: ['p'] });
    const [label] = buildLabels(viewWith([arc], [], patrol(false)), []);
    expect(label?.lines).toContainEqual({ role: 'patrol', text: fr.patrol.title, recall: 'p' });
    const [recalled] = buildLabels(viewWith([arc], [], patrol(true)), []);
    expect(recalled?.lines).toContainEqual({
      role: 'patrol',
      text: fr.patrol.recalledOnLabel,
      recall: null,
    });
    const [plain] = buildLabels(viewWith([mineArc({})]), []);
    expect(plain?.lines.some((line) => line.role === 'patrol')).toBe(false);
  });

  it('dates the departure of my column, for its bar, from what the view serves', () => {
    const [label] = buildLabels(viewWith([mineArc({ schedule: march(30) })]), []);
    expect(label?.lines.find((line) => line.role === 'countdown')).toEqual({
      role: 'countdown',
      dueAt: LOADED_AT + 30 * 60_000,
      prefix: '',
      since: LOADED_AT - 30 * 60_000,
    });
    const [done] = buildLabels(viewWith([mineArc({ schedule: march(0) })]), []);
    expect(done?.lines.find((line) => line.role === 'countdown')).not.toHaveProperty('since');
  });

  it('keeps the countdown and announces the hold while the column still walks', () => {
    const [label] = buildLabels(
      viewWith([mineArc({ schedule: march(30, { holdUntil: LOADED_AT + 180 * MINUTE }) })]),
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

  /** **Le Guet lit la pile, jamais l'ordre** (ADR 0037 §5, décision du 02/11). */
  it('gives the pile a Guet has read, and never the order', () => {
    const [label] = buildLabels(
      viewWith([
        detectedArc({
          headingAtMe: true,
          identification: { pierced: true, stack: { infantry: 3, armor: 1 }, readAt: null },
        }),
      ]),
      [],
    );
    expect(label?.type).toBe('inbound-movement');
    expect(label?.identified).toBe(true);
    expect(texts(label!.lines)).toEqual(['countdown:countdown', '3 INF · 1 BLD']);
  });

  it('says the pile of a camp a Guet has read, and nothing of one it has not', () => {
    const camp = (identification: Composition): MapMarker => ({
      kind: 'camp',
      id: 'camp',
      campId: 'c1',
      lonLat: [0, 0],
      medium: 'land',
      lastKnown: false,
      since: 0,
      seenMinutesAgo: null,
      lastSeenAt: null,
      identification,
    });
    const [read] = buildLabels(viewWith([]), [
      camp({ pierced: true, stack: { infantry: 3, armor: 1 }, readAt: null }),
    ]);
    expect(read?.lines).toContainEqual({ role: 'nature', text: '3 INF · 1 BLD' });
    const [blind] = buildLabels(viewWith([]), [camp({ pierced: false })]);
    expect(blind?.lines.filter((line) => line.role === 'nature')).toHaveLength(1);
  });

  /** **Une pile figée se date** : hors de la vue du Guet, elle a pu changer. */
  it('dates a pile no Guet reads any more, with its day when it is not today', () => {
    const camp = (identification: Composition): MapMarker => ({
      kind: 'camp',
      id: 'camp',
      campId: 'c1',
      lonLat: [0, 0],
      medium: 'land',
      lastKnown: false,
      since: 0,
      seenMinutesAgo: null,
      lastSeenAt: null,
      identification,
    });
    const lineOf = (readAt: number | null) =>
      buildLabels(viewWith([]), [
        camp({ pierced: true, stack: { infantry: 3 }, readAt }),
      ])[0]!.lines.find((line) => line.role === 'nature' && line.text.startsWith('3 INF'));
    const today = LOADED_AT - 60_000;
    expect(lineOf(today)).toEqual({
      role: 'nature',
      text: `3 INF · ${fr.labels.readAt(asClockTime(today))}`,
    });
    const monday = LOADED_AT - 2 * 24 * 3_600_000;
    expect(lineOf(monday)).toEqual({
      role: 'nature',
      text: `3 INF · ${fr.labels.readAt(asDayAndTime(monday))}`,
    });
    expect(lineOf(null)).toEqual({ role: 'nature', text: '3 INF' });
  });

  it('keeps the pile read on the last known position', () => {
    const [label] = buildLabels(
      viewWith([
        {
          state: 'lastKnown',
          detector: 'outpost',
          detectorRegion: null,
          id: 'old',
          from: [0, 0],
          to: [1, 1],
          route: directRoute([0, 0], [1, 1], 'land', 10),
          headingDegrees: 0,
          identification: { pierced: true, stack: { infantry: 2 }, readAt: null },
          lastSeenAt: 0,
        },
      ]),
      [],
    );
    expect(label?.lines).toContainEqual({ role: 'nature', text: '2 INF' });
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
          station: {
            kind: 'point',
            lonLat: [0, 0],
            country: 'FRA',
            afloat: false,
            ground: 'land',
            coastal: false,
          },
          stack: { infantry: 4 },
          place: 'France',
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
          identification: { pierced: false },
          id: 'old',
          from: [0, 0],
          to: [1, 1],
          route: directRoute([0, 0], [1, 1], 'land', 10),
          headingDegrees: 10,
          lastSeenAt: LOADED_AT - 5 * MINUTE,
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
        station: {
          kind: 'point',
          lonLat: [0, 0],
          country: 'ITA',
          afloat: false,
          ground: 'land',
          coastal: false,
        },
        stack: { infantry: 2, armor: 1 },
        place: 'Italie',
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
        identification: { pierced: false },
        id: 'a',
        from: [0, 0],
        to: [1, 1],
        route: directRoute([0, 0], [1, 1], 'sea', 10),
        headingDegrees: 10,
        lastSeenAt: LOADED_AT - 5 * MINUTE,
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
    // Its age runs on the label's own clock, from the instant it was last seen (#183).
    expect(labels[0]!.lines[0]).toEqual({ role: 'age', since: LOADED_AT - 5 * MINUTE });
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
        station: {
          kind: 'point',
          lonLat: [0, 0],
          country: 'FRA',
          afloat: false,
          ground: 'land',
          coastal: false,
        },
        stack: { infantry: 4 },
        place: 'France',
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
  /** **Pendant un changement, le point agit en généraliste** (ADR 0037 §7) : le mât le dit, et dit
   *  ce qu'il deviendra. */
  it('names the trade an outpost acts on, and the one a change is giving it', () => {
    const [store] = buildLabels(viewWith([]), [
      { ...OUTPOST, specialty: 'store', changingTo: null },
    ]);
    expect(store?.lines[0]).toEqual({ role: 'nature', text: 'magasin' });
    const [changing] = buildLabels(viewWith([]), [
      { ...OUTPOST, specialty: 'store', changingTo: 'fort' },
    ]);
    expect(changing?.lines[0]).toEqual({ role: 'nature', text: 'généraliste → fort, en chantier' });
  });

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
    expect(deposit?.ink).toBeNull();
    expect(deposit?.lines).toEqual([{ role: 'nature', text: 'charbon · libre' }]);
    expect(deposit?.priority).toBeLessThan(building?.priority ?? 0);
  });

  it('writes in one line who is known to work a deposit, what the fog lets it say (#239)', () => {
    const said = (held?: { mine: boolean; level: number | null }) =>
      buildLabels(viewWith([]), [
        {
          kind: 'deposit',
          id: 'deposit-FR-60',
          lonLat: [2.4, 49.4],
          deposit: 'iron',
          ...(held === undefined ? {} : { held }),
        },
      ])[0]?.lines;
    expect(said()).toEqual([{ role: 'nature', text: 'fer · libre' }]);
    expect(said({ mine: false, level: null })).toEqual([
      { role: 'nature', text: 'fer · exploité' },
    ]);
    expect(said({ mine: true, level: null })).toEqual([
      { role: 'nature', text: 'fer · votre chantier' },
    ]);
    expect(said({ mine: true, level: 2 })).toEqual([
      { role: 'nature', text: 'fer · à vous · niveau 2' },
    ]);
  });

  it('carries the piece a worked deposit clears, and none for a free one (#445)', () => {
    const [worked, free] = buildLabels(viewWith([]), [
      { kind: 'deposit', id: 'd1', lonLat: [2.4, 49.4], deposit: 'coal', clears: 'building-x' },
      { kind: 'deposit', id: 'd2', lonLat: [2.5, 49.4], deposit: 'coal' },
    ]);
    expect([worked?.clears, free?.clears]).toEqual(['building-x', undefined]);
  });

  it('wakes a deposit a held key calls, in its own ink, and says why the pose would refuse it (#239)', () => {
    const woken = (wake: NonNullable<(MapMarker & { kind: 'deposit' })['wake']>) =>
      buildLabels(viewWith([]), [
        { kind: 'deposit', id: 'deposit-FR-60', lonLat: [2.4, 49.4], deposit: 'coal', wake },
      ])[0];
    expect(woken('open')?.wake).toEqual({ deposit: 'coal', open: true });
    expect(woken('open')?.lines).toEqual([{ role: 'nature', text: 'charbon · libre' }]);
    expect(woken({ code: 'OUT_OF_REACH' })?.wake).toEqual({ deposit: 'coal', open: false });
    expect(woken({ code: 'OUT_OF_REACH' })?.lines).toEqual([
      { role: 'nature', text: 'charbon · hors de portée' },
    ]);
    expect(woken({ code: 'TOO_CLOSE', near: 'arsenal', km: 30 })?.lines).toEqual([
      { role: 'nature', text: 'charbon · trop près de l’arsenal' },
    ]);
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

/** **La Doctrine du porte-avions sur la fiche** (#449) : le cap se dit avant le geste, par la
 *  règle même du serveur (`courseRefusalOf`). */
describe('the course of a fleet at sea', () => {
  const atSea = (schedule = march(30)) =>
    mineArc({ route: directRoute([140, 30], [150, 30], 'sea', 10), schedule });
  const japanese = (arcs: ReadonlyArray<ArcView>) =>
    ({
      ...viewWith(arcs),
      me: { ink: '#6a4796', troops: [], asset: 'carrierDoctrine' },
    }) as unknown as PlayerView;

  it('frees a Japanese course until halfway, and marks halfway on its thread', () => {
    const labels = buildLabels(japanese([atSea(march(90))]), []);
    const fleet = labels.find((label) => label.type === 'my-movement')!;
    const until = asClockTime(LOADED_AT - 30 * MINUTE + 60 * MINUTE);
    expect(fleet.lines).toContainEqual({ role: 'free', text: fr.course.free(until), fold: true });
    expect(fleet.lines).toContainEqual({ role: 'mention', text: fr.course.grab, fold: true });
    const mark = labels.find((label) => label.type === 'course-mark')!;
    expect(texts(mark.lines)).toEqual([fr.course.halfway(until)]);
  });

  it('reads the course at the client’s hour, not at the view’s', () => {
    const halfway = LOADED_AT + 30 * MINUTE;
    const [fleet] = buildLabels(japanese([atSea(march(90))]), [], halfway + MINUTE);
    expect(fleet!.lines).toContainEqual({
      role: 'alarm',
      text: fr.errors.PAST_HALFWAY({ at: asClockTime(halfway) }),
      fold: true,
    });
  });

  it('says why the course no longer changes past halfway, or once changed', () => {
    const [past] = buildLabels(japanese([atSea(march(10))]), []);
    expect(past!.lines).toContainEqual({
      role: 'alarm',
      text: fr.errors.PAST_HALFWAY({ at: asClockTime(LOADED_AT - 10 * MINUTE) }),
      fold: true,
    });
    const turned = mineArc({
      route: directRoute([140, 30], [150, 30], 'sea', 10),
      courseChange: {
        at: LOADED_AT - 5 * MINUTE,
        ran: [
          [139, 31],
          [140, 30],
        ],
      },
    });
    const labels = buildLabels(japanese([turned]), []);
    expect(labels[0]!.lines).toContainEqual({
      role: 'alarm',
      text: fr.course.changed(asClockTime(LOADED_AT - 5 * MINUTE)),
      fold: true,
    });
    expect(
      labels.filter((label) => label.type === 'course-mark').map((l) => texts(l.lines)),
    ).toEqual([[fr.course.elbow(asClockTime(LOADED_AT - 5 * MINUTE))]]);
  });

  it('tells another nation’s fleet that a movement under way is not taken back', () => {
    const labels = buildLabels(viewWith([atSea()]), []);
    expect(labels[0]!.lines).toContainEqual({
      role: 'mention',
      text: fr.errors.NO_CARRIER_DOCTRINE(),
      fold: true,
    });
    expect(labels.some((label) => label.type === 'course-mark')).toBe(false);
  });
});

/** **La Guerre éclair sur la fiche et sur le fil** (ADR 0039 §6, maquette A) : la seconde cible,
 *  à son seul auteur ; la pièce restée dit pourquoi. */
describe('the second target of a blitzkrieg', () => {
  const chained = mineArc({
    then: {
      name: 'Namur',
      points: [
        [1, 1],
        [2, 1],
      ],
    },
  });

  it('says the second target and the one slot on the column, and hangs the gate on its thread', () => {
    const labels = buildLabels(viewWith([chained]), []);
    const column = labels.find((label) => label.type === 'my-movement')!;
    expect(column.lines).toContainEqual({ role: 'free', text: fr.blitzkrieg.then('Namur') });
    expect(column.lines).toContainEqual({ role: 'mention', text: fr.blitzkrieg.oneSlot });
    const gate = labels.find((label) => label.type === 'course-mark')!;
    expect(gate.anchor).toEqual({ kind: 'ground', lonLat: [1, 1] });
    expect(texts(gate.lines)).toEqual([fr.blitzkrieg.gate]);
  });

  it('says nothing of the kind on a plain attack', () => {
    const labels = buildLabels(viewWith([mineArc({})]), []);
    expect(labels.some((label) => label.type === 'course-mark')).toBe(false);
    expect(texts(labels[0]!.lines)).not.toContain(fr.blitzkrieg.oneSlot);
  });

  it('writes on the pile that stayed what its dispatch said, while its troops hold there', () => {
    const pile = (troopIds: ReadonlyArray<string>): MapMarker => ({
      kind: 'stack',
      id: `stack-${troopIds.join('-')}`,
      lonLat: [5.57, 50.63],
      station: {
        kind: 'point',
        lonLat: [5.57, 50.63],
        country: 'BEL',
        afloat: false,
        ground: 'land',
        coastal: false,
      },
      stack: { armor: 3 },
      place: 'Belgique',
      pieces: { groups: [], troopIds, squad: false },
      ink: '#000',
    });
    const stood = {
      text: 'reste à Liège — plus de coups',
      reread: 'relu à 13:10',
      troopIds: ['t1'],
    };
    const view = { ...viewWith([]), journal: [{ place: null, stood }] } as unknown as PlayerView;
    const [stayed, other] = buildLabels(view, [pile(['t1', 't2']), pile(['t3'])]);
    expect(stayed!.lines).toContainEqual({ role: 'alarm', text: stood.text });
    expect(stayed!.lines).toContainEqual({ role: 'mention', text: stood.reread });
    expect(texts(other!.lines)).not.toContain(stood.text);
  });
});
