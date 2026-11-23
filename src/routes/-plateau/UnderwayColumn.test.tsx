// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { Underway } from '@/domain/underway';
import { ROW_WIDTH_PX, UnderwayColumn } from './UnderwayColumn';

/**
 * **« En cours », sous le bandeau du téléphone** (refonte mobile, 1a et 1d) : une ligne par
 * compte à rebours, un toucher qui recentre, un en-tête qui replie — et la ligne de ce qui vient
 * de partir qui reste dépliée malgré le pli.
 */
beforeEach(() => localStorage.clear());
afterEach(cleanup);

const line = (id: string, label: string, minutes: number): Underway => ({
  id,
  endsAt: Date.now() + minutes * 60_000,
  label,
  face: { kind: 'outpost' },
  place: { kind: 'outpost', outpostId: id },
  moving: false,
  holdsSlot: false,
});

const LINES = [line('a', 'marche → Somme', 14), line('b', 'mine → niveau 4', 89)];

describe('the underway column', () => {
  it('does not exist when nothing runs', () => {
    const { container } = render(
      <UnderwayColumn lines={[]} nation="france" fresh={null} onLocate={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('reads each countdown with its label, and a touch recentres on it', () => {
    const onLocate = vi.fn();
    render(<UnderwayColumn lines={LINES} nation="france" fresh={null} onLocate={onLocate} />);
    expect(screen.getByText('marche → Somme')).toBeTruthy();

    act(() => screen.getByTitle(fr.underway.locate('mine → niveau 4')).click());
    expect(onLocate).toHaveBeenCalledWith(LINES[1]);
  });

  it('folds to its hours, remembers it, and keeps what was just sent unfolded', () => {
    render(<UnderwayColumn lines={LINES} nation="france" fresh="b" onLocate={() => {}} />);

    act(() => screen.getByTitle(fr.underway.fold).click());
    expect(screen.queryByText('marche → Somme')).toBeNull();
    expect(screen.getByText('mine → niveau 4')).toBeTruthy();
    expect(localStorage.getItem('wws-underway')).toBe('folded');
  });
});

describe('the column folding away from what rises under it (#587)', () => {
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;
  let floorTop = 800;
  const frames: Array<() => void> = [];

  beforeEach(() => {
    floorTop = 800;
    frames.length = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.hasAttribute('data-poster-floor')) return rect(0, floorTop, 200, 50);
      return rect(0, 100, ROW_WIDTH_PX, 28);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.querySelectorAll('[data-poster-floor]').forEach((node) => node.remove());
  });

  const mountWithFloor = () => {
    const floor = document.createElement('div');
    floor.setAttribute('data-poster-floor', '');
    document.body.append(floor);
    return render(
      <UnderwayColumn lines={LINES} nation="france" fresh={null} onLocate={() => {}} />,
    );
  };

  it('keeps its rows while the floor stays clear of the unfolded pile', () => {
    mountWithFloor();
    expect(screen.getByText('marche → Somme')).toBeTruthy();
  });

  it('folds once a frame after the floor rises into the pile, never on every style write', () => {
    mountWithFloor();
    floorTop = 150;
    act(() => {
      document.documentElement.style.setProperty('--mat-rise', '1px');
      document.documentElement.style.setProperty('--mat-rise', '2px');
    });
    return Promise.resolve().then(() => {
      expect(frames).toHaveLength(1);
      act(() => frames.splice(0).forEach((frame) => frame()));
      expect(screen.queryByText('marche → Somme')).toBeNull();
    });
  });
});
