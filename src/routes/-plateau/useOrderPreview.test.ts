import { describe, expect, it } from 'vitest';
import { dropRefusalOf } from './useOrderPreview';
import type { OrderChoice, Previewed } from './order-wire';

const choice = (lon: number, extra: Partial<OrderChoice> = {}): OrderChoice => ({
  aim: { kind: 'point', lon, lat: 50, ground: 'land', surveyed: true, coastal: false },
  type: 'march',
  label: 'Marcher',
  consequence: '',
  mission: { kind: 'march' },
  ...extra,
});
const preview = (short: { needed: number; held: number; role: string } | null) =>
  ({ fuel: { short, km: 685 } }) as unknown as Previewed;

describe('what letting go refuses before the server is asked (#258)', () => {
  it('says the short fuel when the preview refuses the very order let go', () => {
    const seen = { choice: choice(8), preview: preview({ needed: 2, held: 1, role: 'armor' }) };
    expect(dropRefusalOf(seen, choice(8))).toContain('685');
  });

  it('lets go when nothing was seen, or another aim, type or mission was', () => {
    const seen = { choice: choice(8), preview: preview({ needed: 2, held: 1, role: 'armor' }) };
    expect(dropRefusalOf(undefined, choice(8))).toBeNull();
    expect(dropRefusalOf(seen, choice(9))).toBeNull();
    expect(dropRefusalOf(seen, choice(8, { type: 'attack' }))).toBeNull();
    expect(
      dropRefusalOf(seen, choice(8, { mission: { kind: 'march', roundTrip: true } })),
    ).toBeNull();
  });

  it('lets a valid road go, and a missing one too: the server says its exact reason', () => {
    expect(dropRefusalOf({ choice: choice(8), preview: preview(null) }, choice(8))).toBeNull();
    expect(dropRefusalOf({ choice: choice(8), preview: null }, choice(8))).toBeNull();
  });
});
