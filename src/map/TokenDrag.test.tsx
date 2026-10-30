// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTokenDrag } from './TokenDrag';

/**
 * **Des jetons pris d'un bac** (#251) : tant que la main est pleine, le bac source le dit
 * (`data-holding`, ce qu'on en a pris) ; lâchés hors d'un transport, les jetons rentrent au bac.
 */
const hint = { text: 'rentre', refused: true, amount: 0 };

function Bin({ stock = 1000, onHold }: { stock?: number; onHold?: (holding: boolean) => void }) {
  const tokens = useTokenDrag<'board'>({
    ...(onHold ? { onHold } : {}),
    stock: () => stock,
    read: () => hint,
    drop: () => {},
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
    expect(bin().dataset.holding).toBe('10');
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

describe('a grab held over a nearly empty bin', () => {
  it('grows to the stock and stops there', () => {
    vi.useFakeTimers();
    try {
      render(<Bin stock={23} />);
      press();
      act(() => void vi.advanceTimersByTime(2000));
      expect(bin().dataset.holding).toBe('23');
    } finally {
      vi.useRealTimers();
    }
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
    expect(bin().dataset.holding).toBe('10');
    rerender(<Bin stock={4} />);
    moveTo(130, 130);
    expect(bin().dataset.holding).toBe('4');
  });
});
