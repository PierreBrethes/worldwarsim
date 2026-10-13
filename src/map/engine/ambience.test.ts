import { describe, expect, it } from 'vitest';
import { Ambience, AMBIENT_HZ, ambientStep, ambientTime } from './ambience';

describe('ambient clock', () => {
  it('quantises time to the ambient step', () => {
    const stepMs = 1000 / AMBIENT_HZ;
    expect(ambientStep(0)).toBe(0);
    expect(ambientStep(stepMs - 1)).toBe(0);
    expect(ambientStep(stepMs)).toBe(1);
    expect(ambientTime(AMBIENT_HZ)).toBe(1);
  });
});

describe('Ambience', () => {
  const seen: number[] = [];
  const layer = { fx: 'sea' as const, frame: (time: number) => seen.push(time) };

  it('asks once per new step, only in full and only with an active layer', () => {
    const ambience = new Ambience(new Set(['sea']));
    expect(ambience.advance(0)).toBe(false);
    ambience.add(layer);
    expect(ambience.advance(1000)).toBe(true);
    expect(ambience.advance(1010)).toBe(false);
    expect(ambience.advance(1100)).toBe(true);
    ambience.frame();
    expect(seen).toEqual([ambientTime(ambientStep(1100))]);

    ambience.motion = 'reduced';
    expect(ambience.advance(5000)).toBe(false);
  });

  it('steps each layer at its own pace and asks at the fastest', () => {
    const times: Record<string, number[]> = { sea: [], wind: [] };
    const ambience = new Ambience(new Set(['sea', 'wind']));
    ambience.add({ fx: 'sea', frame: (time) => times.sea!.push(time) });
    ambience.add({ fx: 'wind', hz: 30, frame: (time) => times.wind!.push(time) });
    expect(ambience.advance(1000)).toBe(true);
    ambience.frame();
    expect(ambience.advance(1040)).toBe(true);
    ambience.frame();
    expect(ambience.advance(1045)).toBe(false);
    expect(times).toEqual({ sea: [1, 1], wind: [1, 31 / 30] });
  });

  it('asks nothing for an idle layer, and its next step once it wakes', () => {
    let idle = true;
    const ambience = new Ambience(new Set(['smoke']));
    ambience.add({ fx: 'smoke', idle: () => idle, frame: () => {} });
    expect(ambience.advance(1000)).toBe(false);
    expect(ambience.advance(1100)).toBe(false);
    idle = false;
    expect(ambience.advance(1100)).toBe(true);
    expect(ambience.advance(1110)).toBe(false);
  });

  it('drops layers whose effect is switched off', () => {
    const ambience = new Ambience(new Set());
    ambience.add(layer);
    expect(ambience.enabled('sea')).toBe(false);
    expect(ambience.advance(1000)).toBe(false);
  });
});
