// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Hand } from '@/domain/hand';
import type { MapAim } from '@/map/WorldMap';
import { useHandAim } from './useHandAim';

const held = (id: string) => ({ kind: 'held', troopIds: [id] }) as unknown as Hand;
const target = (verbs: string[] = ['march']) =>
  ({
    verbs: verbs.map((key) => ({ key })),
    at: { x: 10, y: 20 },
    lonLat: [3, 47],
    forbidden: null,
  }) as unknown as MapAim;

function aimed(initial: Hand) {
  const view = renderHook(({ hand }) => useHandAim(hand), { initialProps: { hand: initial } });
  act(() => view.result.current.touch(target(['march', 'attack'])));
  return view;
}

describe('useHandAim', () => {
  it('keeps the aim while the hand stays the same one', () => {
    const hand = held('a');
    const { result, rerender } = aimed(hand);
    rerender({ hand });
    expect(result.current.aim).not.toBeNull();
  });

  it.each([
    ['lifting another pile (liftHand)', held('b')],
    ['recomposing the hand (compose)', held('a')],
    ['dropping it (dropHand)', { kind: 'empty' } as unknown as Hand],
  ])('is wiped by %s: no label, no « Envoyer »', (_, next) => {
    const { result, rerender } = aimed(held('a'));
    expect(result.current.aim).not.toBeNull();
    rerender({ hand: next });
    expect(result.current.aim).toBeNull();
    expect(result.current.verb).toBeNull();
    const act = vi.fn();
    result.current.send(null, act);
    expect(act).not.toHaveBeenCalled();
  });

  it('sends the chosen verb at the touched point, once, whatever the second touch', () => {
    const { result } = aimed(held('a'));
    act(() => result.current.choose(1));
    const go = vi.fn();
    act(() => {
      result.current.send(null, go);
      result.current.send(null, go);
    });
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith({ key: 'attack' }, { x: 10, y: 20 });
  });

  it('sends nothing under a known refusal, and still can once it lifts', () => {
    const { result } = aimed(held('a'));
    const go = vi.fn();
    act(() => result.current.send('Aucune route', go));
    expect(go).not.toHaveBeenCalled();
    act(() => result.current.send(null, go));
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('cancels the aim and leaves the hand to its holder', () => {
    const { result } = aimed(held('a'));
    act(() => result.current.cancel());
    expect(result.current.aim).toBeNull();
  });
});
