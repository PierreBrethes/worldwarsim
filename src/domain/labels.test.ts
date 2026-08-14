import { describe, expect, it } from 'vitest';
import { abbreviateStack, buildLabels, type MapMarker } from './labels';
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
  ({ arcs, loadedAt: LOADED_AT }) as PlayerView;

const OUTPOST: MapMarker = {
  kind: 'outpost',
  id: 'ap-1',
  lonLat: [8.5, 61.4],
  hostCountry: 'Norway',
  specialization: 'extraction',
  level: 2,
  garrison: 40,
  ink: '#4a4f7a',
};

const texts = (lines: ReadonlyArray<{ readonly role: string }>) =>
  lines.map((line) => ('text' in line ? line.text : `countdown:${line.role}`));

describe('buildLabels', () => {
  it('prints neither type nor composition of an unidentified enemy movement', () => {
    const [label] = buildLabels(viewWith([detectedArc({})]), []);
    expect(label?.type).toBe('intel');
    expect(label?.identified).toBe(false);
    expect(texts(label!.lines)).toEqual(['countdown:countdown', 'estimé']);
    expect(label?.lines[0]).toEqual({ role: 'countdown', dueAt: LOADED_AT + 100 * 60_000, prefix: '~' });
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
        { kind: 'stack', id: 'stack', lonLat: [0, 0], stack: { infantry: 4 }, ink: '#000' },
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
    expect(order).toEqual(['at-me', 'mine', 'elsewhere', 'construction', 'ap-1', 'stack']);
  });

  it('puts no label on a frozen arc or sea control', () => {
    const arcs: ReadonlyArray<ArcView> = [
      { state: 'lastKnown', id: 'a', from: [0, 0], to: [1, 1], route: directRoute([0, 0], [1, 1], 'sea', 10), headingDegrees: 10, seenMinutesAgo: 5, progress: 0.2 },
      { state: 'seaControl', id: 'b', from: [0, 0], to: [1, 1], route: directRoute([0, 0], [1, 1], 'sea', 10), progress: 0.4 },
    ];
    expect(buildLabels(viewWith(arcs), [])).toHaveLength(0);
  });

  it('anchors a movement head on no fixed position', () => {
    const [label] = buildLabels(viewWith([mineArc({})]), []);
    expect(label?.anchor).toEqual({ kind: 'movementHead', arc: 'mv-1' });
  });

  it('gives an outpost’s click to its host country, never a stack’s', () => {
    const labels = buildLabels(viewWith([]), [
      OUTPOST,
      { kind: 'stack', id: 'stack', lonLat: [0, 0], stack: { infantry: 4 }, ink: '#000' },
    ]);
    expect(labels[0]?.hostCountry).toBe('Norway');
    expect(labels[1]?.hostCountry).toBeNull();
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
