import { describe, expect, it } from 'vitest';
import { buildLabels, type MapMarker } from './labels';
import { posterOf, type Poster } from './map-poster';
import type { ArcView, PlayerView } from './player-view';
import { directRoute } from './routing';
import { asClockTime } from './duration';

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
  ({ arcs: [], camps: [], loadedAt: LOADED_AT, me, ...override }) as PlayerView;

const building = (
  id: string,
  key: string,
  regionId: string,
  finishesAt: number | null = null,
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
    finishesAt,
    reach: null,
    ink: '#2f4f78',
  }) as MapMarker;

const posterFor = (v: PlayerView, markers: ReadonlyArray<MapMarker>, id: string): Poster | null => {
  const label = buildLabels(v, markers).find((candidate) => candidate.id === id);
  if (label === undefined) throw new Error(`no label ${id}`);
  return posterOf(label, v, LOADED_AT);
};

const texts = (poster: Poster | null) => JSON.stringify(poster);

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
      pieces: { groups: [], more: 0, troopIds: [] },
      ink: '#2f4f78',
    };
    const poster = posterFor(view(), [pile], 'pile');
    expect(poster?.title).toBe('Marne · 1');
    expect(poster?.pile?.lines).toEqual([
      expect.objectContaining({ role: 'infantry', troops: 1, health: 50, notches: 5 }),
    ]);

    const empty = { ...pile, station: { kind: 'building', buildingId: 'b-foundry' } } as MapMarker;
    expect(posterFor(view(), [empty], 'pile')).toBeNull();
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
    expect(poster).toMatchObject({ eyebrow: 'mouvement · le mien', title: '1 blindé', bar: 0.4 });
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

  it('says nothing of a network a barracks does not belong to, and fills its works bar', () => {
    const due = LOADED_AT + 15 * 60_000;
    const barracks = posterFor(
      view(),
      [building('b-barracks', 'barracks', 'r-plain', due)],
      'm-b-barracks',
    );
    expect(barracks?.lines).toEqual([{ kind: 'row', label: 'chantier', value: asClockTime(due) }]);
    expect(barracks?.bar).toBe(0.75);
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
      progress: 0.5,
    };
    const poster = posterFor(view({ arcs: [arc] }), [], 'foe');
    expect(poster).toMatchObject({
      eyebrow: 'relevé · en vue',
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
    };
    const v = view({
      arcs: [lastKnown],
      camps: [
        { id: 'c1', since: LOADED_AT - 60_000, seenMinutesAgo: null },
      ] as unknown as PlayerView['camps'],
    });
    expect(posterFor(v, [], 'old')?.eyebrow).toBe(
      `relevé · ${asClockTime(LOADED_AT - 120 * 60_000)}`,
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
      pile: null,
    });
  });
});
