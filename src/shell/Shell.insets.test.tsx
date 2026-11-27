// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePublishedEdges } from './Shell';

/**
 * **Ce que la colonne couvre de la carte** (#256) : la carte « à faire » dépliée se tient hors de
 * la boîte de la colonne, et couvre pourtant la carte autant qu'elle.
 */
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);
afterEach(() => vi.restoreAllMocks());

const box = (left: number, right: number, top = 0, bottom = 900) => {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left, right, top, bottom, width: right - left, height: bottom - top }) as DOMRect;
  return el;
};

const insetsWith = (card: HTMLElement | null, chips: HTMLElement | null = null) =>
  renderHook(() =>
    usePublishedEdges(
      { current: box(0, 1440) },
      { current: box(0, 1440, 0, 60) },
      { current: box(0, 75, 700, 900) },
      null,
      false,
      card,
      chips,
    ),
  ).result.current;

describe('the board insets', () => {
  it('count the column alone while the « à faire » card is folded', () => {
    expect(insetsWith(null)).toMatchObject({ left: 75, right: 75 });
  });

  it('count the unfolded card on the left, and leave the right at the column width', () => {
    expect(insetsWith(box(90, 390, 500, 900))).toMatchObject({ left: 390, right: 75 });
  });

  it('cover the map up to the top of the « à faire » chips, which stand above the stock band (#713)', () => {
    expect(insetsWith(null, box(85, 900, 760, 790))).toMatchObject({ bottom: 140, left: 75 });
    expect(insetsWith(null)).toMatchObject({ bottom: 0 });
  });
});
