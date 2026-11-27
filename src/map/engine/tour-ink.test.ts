import { describe, expect, it } from 'vitest';
import { inkedLoops, strokesOf, type TourLoop } from './tour-ink';

const base = [2, 48] as const;
const lille = [3, 50] as const;
const brussels = [4, 50] as const;

describe('strokesOf', () => {
  it('inks a running loop whole, from the loading point back to it', () => {
    expect(
      strokesOf({
        base,
        stops: [
          { at: lille, skipped: false },
          { at: brussels, skipped: false },
        ],
        tracing: false,
      }),
    ).toEqual([{ points: [base, lille, brussels, base], dashed: false }]);
  });

  /** **Un dépôt plein sauté** : la boucle passe en pointillé par lui, le reste reste plein. */
  it('dashes the way through a full depot this round skips', () => {
    expect(
      strokesOf({
        base,
        stops: [
          { at: lille, skipped: true },
          { at: brussels, skipped: false },
        ],
        tracing: false,
      }),
    ).toEqual([
      { points: [base, lille, brussels], dashed: true },
      { points: [brussels, base], dashed: false },
    ]);
  });

  it('dashes a loop still being traced', () => {
    expect(strokesOf({ base, stops: [{ at: lille, skipped: false }], tracing: true })).toEqual([
      { points: [base, lille, base], dashed: true },
    ]);
  });
});

describe('inkedLoops', () => {
  const running: TourLoop = { base, stops: [{ at: lille, skipped: false }], tracing: false };
  const tracing: TourLoop = { base, stops: [{ at: brussels, skipped: false }], tracing: true };

  it('keeps every loop while the layer is on', () => {
    expect(inkedLoops([running, tracing], true)).toEqual([running, tracing]);
  });

  it('drops the loops laid down once the layer is off, but never one being traced', () => {
    expect(inkedLoops([running, tracing], false)).toEqual([tracing]);
  });
});
