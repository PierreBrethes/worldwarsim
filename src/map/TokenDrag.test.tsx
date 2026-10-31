// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyLoad } from '@/domain/logistics';
import { useTokenDrag, type TokenHint } from './TokenDrag';

/**
 * **Des jetons pris d'un bac** (#251) : tant que la main est pleine, le bac source le dit
 * (`data-holding`, ce qu'on en a pris) ; lâchés hors d'un transport, les jetons rentrent au bac.
 */
const hint: TokenHint = {
  text: 'rentre',
  refused: true,
  amount: 0,
  held: 0,
  capacity: 0,
  max: 0,
  bound: 'room',
  load: emptyLoad(),
  title: '',
  word: null,
};

function Bin({
  stock = 30,
  onHold,
  read = () => hint,
  drop = () => {},
}: {
  stock?: number;
  onHold?: (holding: boolean) => void;
  read?: (from: 'board', id: string | null, resource: string, picked: number | null) => TokenHint;
  drop?: (from: 'board', id: string, resource: string, amount: number) => void;
}) {
  const tokens = useTokenDrag<'board'>({
    ...(onHold ? { onHold } : {}),
    stock: () => stock,
    read,
    drop,
  });
  return (
    <>
      <button data-bin="coal" onPointerDown={(event) => tokens.start('board', 'coal', event)}>
        charbon
      </button>
      {/* The gauge a folded board hides: another bin of the same resource, later in the page. */}
      <button data-bin="coal" id="hidden">
        caché
      </button>
      {tokens.chip}
    </>
  );
}

const animate = vi.fn(() => ({ finished: Promise.resolve() }));

beforeEach(() => {
  Element.prototype.hasPointerCapture = () => false;
  document.elementsFromPoint = () => [];
  Element.prototype.animate = animate as unknown as Element['animate'];
  document.documentElement.dataset.motion = 'full';
});
afterEach(() => {
  cleanup();
  document.querySelectorAll('.cargo-tags').forEach((column) => column.remove());
  animate.mockClear();
  delete document.documentElement.dataset.motion;
});

const bin = () => document.querySelector<HTMLElement>('[data-bin="coal"]')!;
const press = () =>
  fireEvent.pointerDown(bin(), { pointerId: 1, clientX: 50, clientY: 50, button: 0 });
const moveTo = (x: number, y: number) =>
  act(() => void fireEvent.pointerMove(window, { pointerId: 1, clientX: x, clientY: y }));
const release = () =>
  act(() => void fireEvent.pointerUp(window, { pointerId: 1, clientX: 200, clientY: 200 }));

describe('the tokens taken from a bin', () => {
  it('marks the bin they come out of, with what the hand holds, until they are let go', () => {
    render(<Bin />);
    press();
    expect(bin().dataset.holding).toBeUndefined();
    moveTo(120, 120);
    expect(bin().dataset.holding).toBe('30');
    release();
    expect(bin().dataset.holding).toBeUndefined();
  });

  it('sends them back to the bin when they are let go over no carrier', () => {
    render(<Bin />);
    press();
    moveTo(120, 120);
    release();
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('flies nothing home for a press that never moved, nor when the animations are off', () => {
    render(<Bin />);
    press();
    release();
    expect(animate).not.toHaveBeenCalled();
    press();
    document.documentElement.dataset.motion = 'off';
    moveTo(120, 120);
    release();
    expect(animate).not.toHaveBeenCalled();
  });

  it('flies home to the bin it came out of, not to another bin of the same resource', () => {
    render(<Bin />);
    const at = (left: number) => () => ({ left, width: 20, top: 100 }) as DOMRect;
    bin().getBoundingClientRect = at(10);
    document.getElementById('hidden')!.getBoundingClientRect = at(900);
    press();
    moveTo(120, 120);
    release();
    const [frames] = animate.mock.calls[0] as unknown as [Array<{ transform: string }>];
    expect(frames.at(-1)!.transform).toContain('translate(20px');
  });
});

describe('a bin with nothing in it', () => {
  it('is not taken from: no chip, no mark, no carrier labels', () => {
    const onHold = vi.fn();
    render(<Bin stock={0} onHold={onHold} />);
    press();
    moveTo(120, 120);
    expect(bin().dataset.holding).toBeUndefined();
    expect(document.body.textContent).not.toContain('×0');
    expect(onHold).not.toHaveBeenCalled();
  });
});

describe('a stock that falls while the hand is carrying', () => {
  it('lowers the grab with it', () => {
    const { rerender } = render(<Bin stock={100} />);
    press();
    moveTo(120, 120);
    expect(bin().dataset.holding).toBe('100');
    rerender(<Bin stock={4} />);
    moveTo(130, 130);
    expect(bin().dataset.holding).toBe('4');
  });
});

describe('the gauge of a transport under the hand', () => {
  const open: TokenHint = {
    text: 'Charger 140',
    refused: false,
    amount: 140,
    held: 60,
    capacity: 200,
    max: 140,
    bound: 'room',
    load: { ...emptyLoad(), coal: 60 },
    title: 'Camion — Charbon',
    word: 'plein',
  };
  const rect = (left: number, top: number, width: number, height: number) => () =>
    ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
  const drop = vi.fn();
  /** A column of tags at the top left, a carrier among them: the hand hovers it at (150, 320). */
  const aboard = () => {
    const column = document.createElement('div');
    column.className = 'cargo-tags';
    column.getBoundingClientRect = rect(100, 300, 100, 30);
    const tag = document.createElement('div');
    tag.dataset.carrierId = 'c1';
    column.append(tag);
    document.body.append(column);
    document.elementsFromPoint = (_x, y) => (y >= 300 && y <= 330 ? [tag] : []);
    return tag;
  };
  const gauge = () => document.querySelector('.load-gauge');
  const read = (_from: 'board', id: string | null, _r: string, picked: number | null) =>
    id === null
      ? hint
      : { ...open, amount: picked === null ? 140 : Math.min(140, Math.max(0, Math.round(picked))) };

  it('opens at the full load, and a drop on the tag loads it', () => {
    aboard();
    render(<Bin read={read} drop={drop} />);
    press();
    moveTo(150, 320);
    expect(gauge()?.textContent).toContain('Camion — Charbon');
    expect(gauge()?.textContent).toContain('Charger 140');
    expect(gauge()?.textContent).toContain('plein');
    act(() => void fireEvent.pointerUp(window, { pointerId: 1, clientX: 150, clientY: 320 }));
    expect(drop).toHaveBeenCalledWith('board', 'c1', 'coal', 140);
    expect(gauge()).toBeNull();
  });

  it('keeps the wheel from the map while open, and loads what the wheel set', () => {
    aboard();
    drop.mockClear();
    render(<Bin read={read} drop={drop} />);
    press();
    moveTo(150, 320);
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    act(() => void window.dispatchEvent(wheel));
    expect(wheel.defaultPrevented).toBe(true);
    act(() => void fireEvent.pointerUp(window, { pointerId: 1, clientX: 150, clientY: 320 }));
    expect(drop).toHaveBeenCalledWith('board', 'c1', 'coal', 139);
  });

  it('folds when the hand leaves its bands, and lets the wheel through', () => {
    aboard();
    render(<Bin read={read} drop={drop} />);
    press();
    moveTo(150, 320);
    moveTo(900, 700);
    expect(gauge()).toBeNull();
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    act(() => void window.dispatchEvent(wheel));
    expect(wheel.defaultPrevented).toBe(false);
  });

  it('keeps what the wheel set while the hand rests in the rail', () => {
    aboard();
    drop.mockClear();
    render(<Bin read={read} drop={drop} />);
    press();
    moveTo(150, 320);
    // The rail is 280 px wide from x = 18: the hand at its middle sets 100 of 200, 60 aboard.
    document.querySelector<HTMLElement>('.load-gauge-rail')!.getBoundingClientRect = rect(
      18,
      250,
      280,
      26,
    );
    moveTo(158, 262);
    act(
      () => void window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true })),
    );
    act(() => void fireEvent.pointerUp(window, { pointerId: 1, clientX: 158, clientY: 262 }));
    expect(drop).toHaveBeenCalledWith('board', 'c1', 'coal', 41);
  });

  it('passes from one tag of the column to the next without folding, and drops on it', () => {
    const column = document.createElement('div');
    column.className = 'cargo-tags';
    column.getBoundingClientRect = rect(100, 300, 100, 30);
    const [first, second] = ['c1', 'c2'].map((id) => {
      const tag = document.createElement('div');
      tag.dataset.carrierId = id;
      column.append(tag);
      return tag;
    });
    document.body.append(column);
    document.elementsFromPoint = (_x, y) => (y < 315 ? [first!] : [second!]);
    drop.mockClear();
    render(<Bin read={read} drop={drop} />);
    press();
    moveTo(150, 305);
    expect(gauge()).not.toBeNull();
    moveTo(150, 325);
    expect(gauge()).not.toBeNull();
    act(() => void fireEvent.pointerUp(window, { pointerId: 1, clientX: 150, clientY: 325 }));
    expect(drop).toHaveBeenCalledWith('board', 'c2', 'coal', 140);
  });

  it('folds when the view refuses the transport, or the tag goes', () => {
    vi.useFakeTimers();
    try {
      let refused = false;
      const aware = (from: 'board', id: string | null, r: string, picked: number | null) =>
        refused ? hint : read(from, id, r, picked);
      const tag = aboard();
      render(<Bin read={aware} drop={drop} />);
      press();
      moveTo(150, 320);
      expect(gauge()).not.toBeNull();
      refused = true;
      act(() => void vi.advanceTimersByTime(200));
      expect(gauge()).toBeNull();
      refused = false;
      moveTo(150, 322);
      expect(gauge()).not.toBeNull();
      tag.parentElement!.remove();
      act(() => void vi.advanceTimersByTime(200));
      expect(gauge()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the hand of a finger while the gauge reads for it, but not at the fine step', () => {
    aboard();
    render(<Bin read={read} drop={drop} />);
    const down = createEvent.pointerDown(bin(), {
      pointerId: 1,
      clientX: 50,
      clientY: 50,
      button: 0,
    });
    Object.defineProperty(down, 'pointerType', { value: 'touch' });
    fireEvent(bin(), down);
    const hand = () => document.querySelector<HTMLElement>('div[aria-hidden]')!;
    moveTo(150, 320);
    expect(gauge()).not.toBeNull();
    expect(hand().style.display).toBe('none');
    // Above the gauge (it stands over y 168 to 292): the fine step, where the thumb hides the count.
    moveTo(150, 120);
    expect(hand().style.display).toBe('block');
  });
});
