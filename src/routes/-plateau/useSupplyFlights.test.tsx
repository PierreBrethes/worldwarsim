// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { bindSpots } from '@/shell/flights';
import { useSupplyFlights } from './useSupplyFlights';

const press = vi.fn();
let unbind = () => {};
afterEach(() => {
  unbind();
  press.mockClear();
});

const load = (ammunition = 0) => ({ ammunition, oil: 0, coal: 0 });
const view = ({
  levels = [1],
  depot = 0,
  journal = [],
}: { levels?: number[]; depot?: number; journal?: unknown[] } = {}) =>
  ({
    journal,
    me: {
      buildings: levels.map((level, index) => ({
        id: `B-${index}`,
        key: 'mine',
        level,
        point: [3, 50],
      })),
      outposts: [{ id: 'O-1', level: 1, lonLat: [4, 51], depot: load(depot) }],
      troops: [{ id: 'T-1', tour: { stops: ['O-1'], skipped: [] } }],
    },
  }) as unknown as PlayerView;

const words = () => press.mock.calls.map(([burst]) => burst.words.word);

describe('the exchanges played at the real event', () => {
  const play = (first: PlayerView, second: PlayerView) => {
    unbind = bindSpots({ stamp: press });
    const hook = renderHook(({ v }) => useSupplyFlights(v, 'off'), { initialProps: { v: first } });
    hook.rerender({ v: second });
  };

  it('presses BÂTI when a new building is finished, ÉLEVÉ when a level rises', () => {
    const done = { at: 5, kind: 'construction' };
    play(view({ levels: [1] }), view({ levels: [1, 1], journal: [done] }));
    expect(words()).toEqual(['bâti']);
    press.mockClear();
    play(view({ levels: [1] }), view({ levels: [2], journal: [done] }));
    expect(words()).toEqual(['élevé']);
  });

  it('presses nothing for a level that rises with no completion dispatch', () => {
    play(view({ levels: [1] }), view({ levels: [2] }));
    expect(press).not.toHaveBeenCalled();
  });

  it('presses LIVRÉ when a depot a tour passes by fills, with no dispatch to say so', () => {
    play(view({ depot: 0 }), view({ depot: 40 }));
    expect(words()).toEqual(['livré']);
  });

  it('does not play it twice when the delivery has its own dispatch', () => {
    const told = {
      at: 5,
      kind: 'supplyDelivered',
      place: { lon: 4, lat: 51 },
      delivered: load(40),
    };
    play(view({ depot: 0 }), view({ depot: 40, journal: [told] }));
    expect(words()).toEqual(['livré']);
  });
});
