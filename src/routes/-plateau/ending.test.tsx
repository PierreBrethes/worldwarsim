// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { endingOf, useOpenedOnce } from './ending';

const view = (patch: Record<string, unknown>) =>
  ({
    mode: 'blitz',
    press: { final: false },
    me: { nation: 'france', defeated: false },
    journal: [],
    ...patch,
  }) as unknown as PlayerView;

describe('useOpenedOnce', () => {
  beforeEach(() => localStorage.clear());

  it('opens once, not at every render nor at the next visit', () => {
    const open = vi.fn();
    const { rerender, unmount } = renderHook(() => {
      useOpenedOnce('k', open);
    });
    rerender();
    expect(open).toHaveBeenCalledTimes(1);
    unmount();
    renderHook(() => {
      useOpenedOnce('k', open);
    });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('waits for an ending', () => {
    const open = vi.fn();
    renderHook(() => {
      useOpenedOnce(null, open);
    });
    expect(open).not.toHaveBeenCalled();
  });
});

describe('endingOf', () => {
  it('names the final edition of a concluded Blitz', () => {
    expect(endingOf(view({ press: { final: true } })).key).toBe('final');
  });

  it('says when a defeated player fell', () => {
    const ending = endingOf(
      view({
        me: { nation: 'france', defeated: true },
        journal: [{ kind: 'elimination', text: 'FRANCE HORS DE COMBAT', at: 1_000 }],
      }),
    );
    expect(ending.key).toBe('out');
    expect(ending.facts.eliminatedAt).not.toBeNull();
  });

  it('leaves a Mondiale alone', () => {
    expect(
      endingOf(view({ mode: 'mondiale', me: { nation: 'france', defeated: true } })).key,
    ).toBeNull();
  });
});
