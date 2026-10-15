// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { endingOf } from '@/domain/ending';
import { useOpenedOnce } from './useOpenedOnce';

const view = (patch: Record<string, unknown>) =>
  ({
    mode: 'blitz',
    press: { final: false },
    me: { nation: 'france', defeated: false, eliminatedAt: null },
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

  it('says when the headquarters fell', () => {
    const ending = endingOf(
      view({ me: { nation: 'france', defeated: true, eliminatedAt: 1_000 } }),
    );
    expect(ending.key).toBe('out');
    expect(ending.facts.eliminatedAt).not.toBeNull();
  });

  it('takes a surrender for no elimination', () => {
    expect(
      endingOf(view({ me: { nation: 'france', defeated: true, eliminatedAt: null } })).key,
    ).toBeNull();
  });

  it('leaves a Mondiale alone', () => {
    expect(
      endingOf(
        view({ mode: 'mondiale', me: { nation: 'france', defeated: true, eliminatedAt: 1 } }),
      ).key,
    ).toBeNull();
  });
});
