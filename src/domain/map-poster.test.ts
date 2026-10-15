import { describe, expect, it } from 'vitest';
import { buildLabels, type MapMarker } from './labels';
import { posterOf, type Poster } from './map-poster';
import type { ArcView, PlayerView } from './player-view';
import { directRoute } from './routing';
import { asClockTime } from './duration';
import type { WorkSite } from './construction';

const LOADED_AT = 1_700_000_000_000;
const route = directRoute([0, 0], [1, 1], 'land', 10);

const me = {
  ink: '#2f4f78',
  troops: [
    {
      id: 't1',
      role: 'infantry',
      tier: 1,
      strength: 50,
      nominalStrength: 100,
      stationedAt: { kind: 'building', buildingId: 'b-mine' },
      supplied: true,
    },
  ],
  stationedCargo: [],
  buildings: [
    { id: 'b-mine', key: 'mine', regionId: 'r-coal', level: 2, nextLevelMinutes: 60 },
    { id: 'b-foundry', key: 'foundry', regionId: 'r-plain', level: 1, nextLevelMinutes: 60 },
    { id: 'b-barracks', key: 'barracks', regionId: 'r-plain', level: 1, nextLevelMinutes: 60 },
  ],
  extraction: [
    { key: 'mine', regionId: 'r-coal', level: 2, deposit: 'coal', perHour: 12, linked: true },
  ],
  chains: [
    {
      by: 'foundry',
      output: 'alloy',
      perHour: 3,
      level: 1,
      order: { ordered: 40, produced: 10 },
    },
  ],
  regions: [
    { id: 'r-coal', linked: true },
    { id: 'r-plain', linked: false },
  ],
} as unknown as PlayerView['me'];

const view = (override: Partial<PlayerView> = {}): PlayerView =>
  ({ arcs: [], camps: [], captures: [], loadedAt: LOADED_AT, me, ...override }) as PlayerView;

const building = (
  id: string,
  key: string,
  regionId: string,
  works: WorkSite | null = null,
  level = 2,
) =>
  ({
    kind: 'building',
    id: `m-${id}`,
    lonLat: null,
    buildingId: id,
    key,
    regionId,
    regionName: 'Marne',
    hostCountry: 'France',
    name: key,
    level,
    plate: null,
    works,
    reach: null,
    ink: '#2f4f78',
  }) as MapMarker;

const posterFor = (v: PlayerView, markers: ReadonlyArray<MapMarker>, id: string): Poster | null => {
  const label = buildLabels(v, markers).find((candidate) => candidate.id === id);
  if (label === undefined) throw new Error(`no label ${id}`);
  return posterOf(label, v, LOADED_AT);
};

const texts = (poster: Poster | null) => JSON.stringify(poster);

const capture = (side: 'capturer' | 'defender', id: string): PlayerView['captures'][number] => ({
  id: `c-${side}`,
  side,
  target: { kind: 'building', id },
  site: { kind: 'building', building: 'foundry', regionId: 'r-plain' },
  regionName: 'Marne',
  point: [0, 0],
  clock: { progress: 0.5, at: LOADED_AT, rate: 1, durationMs: 3_600_000, rest: null },
  completesAt: LOADED_AT + 1_800_000,
  stoppedAt: null,
});

describe('a capture on the poster', () => {
  it('tells the defender how far it went and when the site is lost', () => {
    const poster = posterFor(
      view({ captures: [capture('defender', 'b-foundry')] }),
      [building('b-foundry', 'foundry', 'r-plain')],
      'm-b-foundry',
    );
    expect(poster?.lines).toContainEqual({
      kind: 'chip',
      label: 'capture',
      chip: `50 % · perdu vers ${asClockTime(LOADED_AT + 1_800_000)}`,
      tone: 'cut',
    });
  });

  it('tells the capturer on the pile that holds the site', () => {
    const pile: MapMarker = {
      kind: 'stack',
      id: 'pile',
      lonLat: [0, 0],
      station: { kind: 'building', buildingId: 'b-mine' },
      stack: { infantry: 1 },
      place: 'Marne',
      plate: null,
      pieces: { groups: [], more: 0, troopIds: [], spread: [] },
      ink: '#2f4f78',
    };
    const held = {
      ...pile,
      station: { kind: 'point', lonLat: [0, 0], country: 'FRA', afloat: false, coastal: false },
    } as MapMarker;
    const troops = [{ ...me.troops[0]!, stationedAt: (held as { station: unknown }).station }];
    const poster = posterFor(
      view({ captures: [capture('capturer', 'b-x')], me: { ...me, troops } as PlayerView['me'] }),
      [held],
      'pile',
    );
    expect(poster?.lines).toContainEqual(expect.objectContaining({ label: 'capture', tone: 'ok' }));
  });
});

describe('posterOf', () => {
  it('reads my posted pile off the troops at its address, titled by its place', () => {
    const pile: MapMarker = {
      kind: 'stack',
      id: 'pile',
      lonLat: [0, 0],
      station: { kind: 'building', buildingId: 'b-mine' },
      stack: { infantry: 1 },
      place: 'Marne',
      plate: null,
      pieces: { groups: [], more: 0, troopIds: [], spread: [] },
      ink: '#2f4f78',
    };
    const poster = posterFor(view(), [pile], 'pile');
    expect(poster?.title).toBe('Marne · 1');
    expect(poster?.eyebrow).toBe('troupe seule · entamée');
    expect(poster?.pile?.capacity).toBe(20);
    expect(posterFor(view({ mode: 'blitz' }), [pile], 'pile')?.pile?.capacity).toBeNull();
    expect(poster?.pile?.lines).toEqual([
      expect.objectContaining({ role: 'infantry', troops: 1, health: 50, notches: 5 }),
    ]);

    const empty = { ...pile, station: { kind: 'building', buildingId: 'b-foundry' } } as MapMarker;
    expect(posterFor(view(), [empty], 'pile')).toBeNull();
  });

  it('says on its kicker what the pile is: how many troops, or one, whole or worn', () => {
    const at = { kind: 'point', lonLat: [3, 3] } as const;
    const troop = (id: string, strength: number) => ({
      id,
      role: 'infantry',
      tier: 1,
      strength,
      nominalStrength: 100,
      stationedAt: at,
      supplied: true,
    });
    const pile = {
      kind: 'stack',
      id: 'pile',
      lonLat: [3, 3],
      station: at,
      stack: { infantry: 1 },
      place: 'Aisne',
      plate: null,
      pieces: { groups: [], more: 0, troopIds: [], spread: [] },
      ink: '#2f4f78',
    } as unknown as MapMarker;
    const holding = (...troops: ReturnType<typeof troop>[]) =>
      view({ me: { ...me, troops } as unknown as PlayerView['me'] });

    expect(posterFor(holding(troop('a', 100)), [pile], 'pile')?.eyebrow).toBe('troupe seule');
    expect(
      posterFor(
        holding(troop('a', 100), troop('b', 40), troop('c', 100), troop('d', 100)),
        [pile],
        'pile',
      )?.eyebrow,
    ).toBe('pile · 4 troupes');
  });

  it('counts down the reload of a Blitz troop that struck', () => {
    const pile: MapMarker = {
      kind: 'stack',
      id: 'pile',
      lonLat: [0, 0],
      station: { kind: 'building', buildingId: 'b-mine' },
      stack: { infantry: 1 },
      place: 'Marne',
      plate: null,
      pieces: { groups: [], more: 0, troopIds: [], spread: [] },
      ink: '#2f4f78',
    };
    const reloading = {
      ...me,
      troops: [{ ...me.troops[0]!, reloadUntil: LOADED_AT + 42_000 }],
    } as PlayerView['me'];
    expect(posterFor(view({ me: reloading }), [pile], 'pile')?.lines).toContainEqual({
      kind: 'chip',
      label: 'rechargement',
      chip: '0:42',
      tone: 'cut',
    });
    expect(posterFor(view(), [pile], 'pile')?.lines).toEqual([]);

    const emplacing = {
      ...me,
      troops: [{ ...me.troops[0]!, role: 'artillery', emplacedAt: LOADED_AT + 12_000 }],
    } as PlayerView['me'];
    expect(posterFor(view({ me: emplacing }), [pile], 'pile')?.lines).toContainEqual({
      kind: 'chip',
      label: 'en batterie dans',
      chip: '0:12',
      tone: 'ok',
    });
  });

  it('dates my movement by its arrival and fills the bar to its progress', () => {
    const arc: ArcView = {
      state: 'mine',
      id: 'mv',
      from: [0, 0],
      to: [1, 1],
      route,
      originCountry: 'France',
      destinationCountry: 'Belgium',
      originLabel: 'Marne',
      destinationLabel: 'Meuse',
      type: 'march',
      stack: { armor: 1 },
      troopIds: [],
      minutesLeft: 90,
      borderWait: null,
      progress: 0.4,
    };
    const poster = posterFor(view({ arcs: [arc] }), [], 'mv');
    expect(poster).toMatchObject({
      eyebrow: 'mouvement · le mien',
      title: '1 blindé',
      bar: 0.4,
      loading: null,
    });
    const until = LOADED_AT + 3_600_000;
    const loading = {
      ...arc,
      mission: { kind: 'plunder', phase: 'presence', buildingId: 'b', presenceEndsAt: until },
    } as ArcView;
    expect(posterFor(view({ arcs: [loading] }), [], 'mv')?.loading).toBe(until);
    expect(poster?.lines).toContainEqual({
      kind: 'row',
      label: 'Marne → Meuse',
      value: asClockTime(LOADED_AT + 90 * 60_000),
    });
  });

  it('gives a producer its rate and says whether its region still carries its colour', () => {
    const mine = posterFor(view(), [building('b-mine', 'mine', 'r-coal')], 'm-b-mine');
    expect(mine).toMatchObject({ eyebrow: 'site · Marne', title: 'Mine, niv. 2', bar: null });
    expect(mine?.lines).toEqual([
      { kind: 'row', label: 'charbon', value: '+12 / h' },
      { kind: 'chip', label: 'réseau', chip: 'relié', tone: 'ok' },
    ]);

    // La seule fonderie de la chaîne tient son débit et son lot, et sa région est coupée.
    const foundry = posterFor(
      view(),
      [building('b-foundry', 'foundry', 'r-plain', null, 1)],
      'm-b-foundry',
    );
    expect(foundry?.lines).toContainEqual({ kind: 'row', label: 'alliage', value: '+3 / h' });
    expect(foundry?.lines).toContainEqual({
      kind: 'chip',
      label: 'réseau',
      chip: 'hors réseau',
      tone: 'cut',
    });
    expect(foundry?.bar).toBe(0.25);
  });

  it('says nothing of a network a barracks does not belong to, and counts its raise down', () => {
    const raise: WorkSite = {
      phase: 'raising',
      key: 'barracks',
      regionId: 'r-plain',
      regionName: 'Marne',
      level: 2,
      rank: 0,
      finishesAt: LOADED_AT + 15 * 60_000,
      minutes: 60,
    };
    const barracks = posterFor(
      view(),
      [building('b-barracks', 'barracks', 'r-plain', raise, 1)],
      'm-b-barracks',
    );
    expect(barracks).toMatchObject({
      eyebrow: 'élévation · Marne',
      title: 'Caserne, niv. 1 → 2',
      lines: [{ kind: 'row', label: 'reste', value: '00:15:00' }],
      bar: 0.75,
    });
  });

  it('counts down the battery of a gun in garrison, on its building (B20)', () => {
    const garrisoned = {
      ...me,
      troops: [
        {
          ...me.troops[0]!,
          role: 'artillery',
          stationedAt: { kind: 'building', buildingId: 'b-barracks' },
          emplacedAt: LOADED_AT + 18_000,
        },
      ],
    } as PlayerView['me'];
    const barracks = posterFor(
      view({ me: garrisoned }),
      [building('b-barracks', 'barracks', 'r-plain', null, 1)],
      'm-b-barracks',
    );
    expect(barracks?.lines).toContainEqual({
      kind: 'chip',
      label: 'en batterie dans',
      chip: '0:18',
      tone: 'ok',
    });
  });

  it('names a site where nothing stands yet: rising by what is left, queued by its rank', () => {
    const rising: WorkSite = {
      phase: 'rising',
      key: 'farm',
      regionId: 'r-a',
      regionName: 'Meuse',
      level: 1,
      rank: 0,
      finishesAt: LOADED_AT + 24 * 60_000,
      minutes: 60,
    };
    const site = (works: WorkSite) =>
      ({ ...building('x', 'farm', 'r-a', works), buildingId: null, level: null }) as MapMarker;
    expect(posterFor(view(), [site(rising)], 'm-x')).toMatchObject({
      eyebrow: 'chantier · Meuse',
      title: 'Ferme, niv. 1',
      lines: [{ kind: 'row', label: 'reste', value: '00:24:00' }],
      bar: 0.6,
    });
    const queued = { ...rising, phase: 'queued', rank: 2, finishesAt: null } as const;
    expect(posterFor(view(), [site(queued)], 'm-x')).toMatchObject({
      eyebrow: 'en file · Meuse',
      title: 'Ferme, niv. 1',
      lines: [{ kind: 'text', text: 'après 2 chantiers' }],
      bar: null,
    });
  });

  it('never prints the type nor the composition of an enemy movement it has not pierced', () => {
    const arc: ArcView = {
      state: 'enemyDetected',
      id: 'foe',
      from: [0, 0],
      to: [1, 1],
      route,
      suspectedNation: null,
      detector: 'troop',
      detectorRegion: null,
      headingDegrees: 90,
      headingAtMe: true,
      identification: { pierced: false },
      estimatedMinutesLeft: 30,
      watchMinutesLeft: 10,
      since: LOADED_AT - 40 * 60_000,
      progress: 0.5,
    };
    const poster = posterFor(view({ arcs: [arc] }), [], 'foe');
    // In sight, the hour of its first observation — the camp's rule, and the annotation's (H3).
    expect(poster).toMatchObject({
      eyebrow: `relevé · ${asClockTime(LOADED_AT - 40 * 60_000)}`,
      washed: true,
      pile: null,
      bar: null,
    });
    expect(poster?.lines).toEqual([
      { kind: 'text', text: 'composition inconnue, nation inconnue' },
      { kind: 'row', label: 'arrivée estimée', value: `~${asClockTime(LOADED_AT + 30 * 60_000)}` },
      { kind: 'chip', label: 'cap', chip: 'sur nous · estimé', tone: 'cut' },
    ]);
    expect(texts(poster)).not.toMatch(/marche|attaque|raid/);
  });

  it('dates a last known position and a camp by the hour they were seen', () => {
    const lastKnown: ArcView = {
      state: 'lastKnown',
      id: 'old',
      from: [0, 0],
      to: [1, 1],
      route,
      detector: 'troop',
      detectorRegion: null,
      headingDegrees: 0,
      seenMinutesAgo: 120,
      lastSeenAt: LOADED_AT - 125 * 60_000,
      progress: 1,
    };
    const camp: MapMarker = {
      kind: 'camp',
      id: 'camp',
      campId: 'c1',
      lonLat: [0, 0],
      medium: 'land',
      lastKnown: false,
      since: LOADED_AT - 60_000,
      seenMinutesAgo: null,
      lastSeenAt: null,
    };
    const v = view({
      arcs: [lastKnown],
      camps: [
        { id: 'c1', since: LOADED_AT - 60_000, seenMinutesAgo: null },
      ] as unknown as PlayerView['camps'],
    });
    // The served instant, never re-derived from an age against the load: the two drift apart.
    expect(posterFor(v, [], 'old')?.eyebrow).toBe(
      `relevé · ${asClockTime(LOADED_AT - 125 * 60_000)}`,
    );
    expect(posterFor(v, [camp], 'camp')).toMatchObject({
      eyebrow: `relevé · ${asClockTime(LOADED_AT - 60_000)}`,
      title: 'force posée',
      washed: true,
    });
  });

  it('reads a neutral objective off what is public, and nothing of its garrison', () => {
    const objective: MapMarker = {
      kind: 'objective',
      id: 'obj',
      objectiveId: 'o1',
      lonLat: [0, 0],
      name: 'convoi immobilisé',
      tier: 'forces irrégulières légères',
      plate: null,
      depot: '120 alliage',
      emptied: false,
    };
    expect(posterFor(view(), [objective], 'obj')).toEqual({
      eyebrow: 'objectif neutre',
      title: 'convoi immobilisé',
      washed: false,
      lines: [
        { kind: 'text', text: 'forces irrégulières légères' },
        { kind: 'row', label: 'dépôt restant', value: '120 alliage' },
      ],
      bar: null,
      loading: null,
      pile: null,
    });
  });
});

describe('the Blitz poster', () => {
  it('says what a neutral city pays and that nobody holds it', () => {
    const city = {
      kind: 'installation',
      id: 'n-city',
      buildingId: 'city-1',
      key: 'city',
      regionId: 'r-plain',
      name: 'Ville',
      plate: null,
      washed: false,
      neutral: { lonLat: [2, 48] },
    } as MapMarker;
    expect(posterFor(view({ mode: 'blitz' }), [city], 'n-city')).toMatchObject({
      eyebrow: 'neutre',
      title: 'Ville',
      lines: [
        { kind: 'row', label: 'fonds', value: '+15/min' },
        { kind: 'text', text: 'personne ne la tient — l’infanterie la capture' },
      ],
    });
  });

  it('adds the funds my HQ pays, in a Blitz only', () => {
    const hq = building('b-hq', 'hq', 'r-plain', null, 1);
    expect(posterFor(view({ mode: 'blitz' }), [hq], 'm-b-hq')!.lines).toEqual([
      { kind: 'row', label: 'fonds', value: '+30/min' },
    ]);
    expect(posterFor(view({ mode: 'mondiale' }), [hq], 'm-b-hq')!.lines).toEqual([]);
  });
});

describe('a mending pile', () => {
  it('says on its poster that it is mending', () => {
    const mending = {
      ...me,
      troops: me.troops.map((troop) => ({ ...troop, mending: true })),
    } as PlayerView['me'];
    const pile = {
      kind: 'stack',
      id: 'pile',
      lonLat: [0, 0],
      station: { kind: 'building', buildingId: 'b-mine' },
      stack: { infantry: 1 },
      place: 'garnison',
      plate: null,
      pieces: { groups: [], more: 0, spread: [] },
      ink: '#2f4f78',
    } as unknown as MapMarker;
    const poster = posterFor(view({ me: mending }), [pile], 'pile');
    expect(poster?.lines).toEqual([
      { kind: 'chip', label: 'soin', chip: 'reprend des forces', tone: 'ok' },
    ]);
  });
});
