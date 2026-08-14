import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  elapsedShare,
  filterTimeline,
  isStalled,
  msBeforeResolution,
  timelineCounters,
  timelineSummary,
} from './timeline';
import type { ArcView, PlayerView } from './player-view';
import { directRoute } from './routing';

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
  minutesLeft: 30,
  borderWait: null,
  progress: 0.5,
  ...override,
});

const detectedArc = (
  override: Partial<Extract<ArcView, { state: 'enemyDetected' }>>,
): ArcView => ({
  state: 'enemyDetected',
  id: 'mv-x',
  from: [0, 0],
  to: [1, 1],
  route: directRoute([0, 0], [1, 1], 'land', 10),
  suspectedNation: null,
  headingDegrees: 87,
  headingAtMe: false,
  identification: { pierced: false },
  estimatedMinutesLeft: 100,
  progress: 0.34,
  ...override,
});

const viewWith = (arcs: ReadonlyArray<ArcView>): PlayerView =>
  ({ arcs, loadedAt: LOADED_AT }) as unknown as PlayerView;

describe('building the timeline', () => {
  it('sorts by ascending arrival time', () => {
    const cards = buildTimeline(
      viewWith([
        mineArc({ id: 'late', minutesLeft: 90 }),
        detectedArc({ id: 'early', estimatedMinutesLeft: 20 }),
        mineArc({ id: 'middle', minutesLeft: 45 }),
      ]),
    );
    expect(cards.map((card) => card.id)).toEqual(['early', 'middle', 'late']);
  });

  it('sends a card without a schedule to the back', () => {
    const cards = buildTimeline(
      viewWith([
        detectedArc({ id: 'no-estimate', estimatedMinutesLeft: null }),
        mineArc({ id: 'mine', minutesLeft: 400 }),
      ]),
    );
    expect(cards.map((card) => card.id)).toEqual(['mine', 'no-estimate']);
    expect(cards[1]!.timing.known).toBe(false);
  });

  it('drops arcs the timeline cannot carry', () => {
    const cards = buildTimeline(
      viewWith([
        { state: 'seaControl', id: 'sea', from: [0, 0], to: [1, 1], route: directRoute([0, 0], [1, 1], 'sea', 10), progress: 0.2 },
        {
          state: 'lastKnown',
          id: 'frozen',
          from: [0, 0],
          to: [1, 1],
          route: directRoute([0, 0], [1, 1], 'land', 10),
          headingDegrees: 12,
          seenMinutesAgo: 40,
          progress: 0.6,
        },
      ]),
    );
    expect(cards).toEqual([]);
  });
});

describe('fog on enemy cards', () => {
  it('says neither type nor composition while the movement is unidentified', () => {
    const [card] = buildTimeline(viewWith([detectedArc({ headingAtMe: true })]));
    expect(card!.family).toBe('inbound');
    expect(card!.type).toBeNull();
    expect(card!.identified).toBe(false);
    expect(card!.composition).toBe('nature et composition non observées');
    expect(card!.origin).toBe('origine inconnue');
    expect(card!.destination).toBe('cap 087°');
    expect(card!.estimated).toBe(true);
  });

  it('reveals type and composition once the movement is pierced', () => {
    const [card] = buildTimeline(
      viewWith([
        detectedArc({
          headingAtMe: true,
          identification: { pierced: true, type: 'attack', stack: { armor: 30 } },
        }),
      ]),
    );
    expect(card!.identified).toBe(true);
    expect(card!.type).toBe('attack');
    expect(card!.composition).toBe('30 blindés');
    expect(card!.estimated).toBe(true);
  });

  it('separates inbound from intel', () => {
    const cards = buildTimeline(
      viewWith([
        detectedArc({ id: 'elsewhere', headingAtMe: false }),
        detectedArc({ id: 'at-me', headingAtMe: true, estimatedMinutesLeft: 10 }),
      ]),
    );
    expect(cards.map((card) => card.family)).toEqual(['inbound', 'intel']);
  });

  it('never exposes the role of an enemy stack, even identified', () => {
    const [card] = buildTimeline(
      viewWith([
        detectedArc({ identification: { pierced: true, type: 'raid', stack: { armor: 30 } } }),
      ]),
    );
    expect(card!.role).toBeNull();
  });
});

describe('timing', () => {
  it('derives departure and arrival from the remainder and progress', () => {
    const [card] = buildTimeline(
      viewWith([mineArc({ minutesLeft: 30, progress: 0.5 })]),
    );
    const timing = card!.timing;
    if (!timing.known) throw new Error('expected known timing');
    expect(timing.arrivesAt).toBe(LOADED_AT + 30 * 60_000);
    expect(timing.departedAt).toBe(LOADED_AT - 30 * 60_000);
    expect(timing.resolvesAt).toBe(timing.arrivesAt);
    expect(isStalled(timing)).toBe(false);
  });

  it('pushes resolution back when the movement waits at the border', () => {
    const [card] = buildTimeline(
      viewWith([
        mineArc({ minutesLeft: 30, borderWait: { resolutionInMinutes: 210 } }),
      ]),
    );
    expect(isStalled(card!.timing)).toBe(true);
    expect(msBeforeResolution(card!.timing, LOADED_AT)).toBe(210 * 60_000);
  });

  it('moves the marker with the clock, never past arrival', () => {
    const [card] = buildTimeline(
      viewWith([mineArc({ minutesLeft: 30, progress: 0.5 })]),
    );
    expect(elapsedShare(card!.timing, LOADED_AT)).toBeCloseTo(0.5);
    expect(elapsedShare(card!.timing, LOADED_AT + 15 * 60_000)).toBeCloseTo(0.75);
    expect(elapsedShare(card!.timing, LOADED_AT + 999 * 60_000)).toBe(1);
  });

  it('falls back to the served progress when no schedule is estimated', () => {
    const [card] = buildTimeline(
      viewWith([detectedArc({ estimatedMinutesLeft: null, progress: 0.68 })]),
    );
    expect(elapsedShare(card!.timing, LOADED_AT + 10 * 60_000)).toBeCloseTo(0.68);
    expect(msBeforeResolution(card!.timing, LOADED_AT)).toBeNull();
  });
});

describe('counters and filters', () => {
  const cards = buildTimeline(
    viewWith([
      mineArc({ id: 'a1', type: 'attack', minutesLeft: 10 }),
      mineArc({ id: 'a2', type: 'attack', minutesLeft: 20 }),
      mineArc({ id: 'ap', type: 'outpost', minutesLeft: 30 }),
      detectedArc({ id: 'at-me', headingAtMe: true, estimatedMinutesLeft: 40 }),
      detectedArc({ id: 'elsewhere', estimatedMinutesLeft: 50 }),
    ]),
  );

  it('itemizes my types and only keeps the ones that exist', () => {
    expect(timelineCounters(cards).map((counter) => [counter.key, counter.count])).toEqual([
      ['all', 5],
      ['mine', 3],
      ['attack', 2],
      ['outpost', 1],
      ['inbound', 1],
      ['intel', 1],
    ]);
  });

  it('puts the alert on inbound alone', () => {
    const alerts = timelineCounters(cards).filter((counter) => counter.alert);
    expect(alerts.map((counter) => counter.key)).toEqual(['inbound']);
  });

  it('keeps a single family, or one of my types', () => {
    expect(filterTimeline(cards, 'all')).toHaveLength(5);
    expect(filterTimeline(cards, 'mine').map((card) => card.id)).toEqual(['a1', 'a2', 'ap']);
    expect(filterTimeline(cards, 'attack').map((card) => card.id)).toEqual(['a1', 'a2']);
    expect(filterTimeline(cards, 'inbound').map((card) => card.id)).toEqual(['at-me']);
  });

  it('sums up the collapsed timeline in one line', () => {
    expect(timelineSummary(cards, LOADED_AT)).toBe('5 en vol · proch. arrivée 00:10 · 1 cap sur moi');
    expect(timelineSummary([], LOADED_AT)).toBe('aucun mouvement en vol');
  });
});
