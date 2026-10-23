// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverflow } from './useOverflow';

/**
 * **Y a-t-il une suite ?** (#251) Une colonne qui change de mise en page sans être remontée — la
 * fenêtre repasse le seuil du téléphone — rend un autre nœud : la mesure doit le suivre.
 */
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 100,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => 300,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
});

function Column({ narrow }: { narrow: boolean }) {
  const column = useRef<HTMLElement>(null);
  const { after } = useOverflow(column, 'y', narrow);
  return narrow ? (
    <div>phone</div>
  ) : (
    <section ref={column} data-after={after}>
      desk
    </section>
  );
}

describe('the overflow of a column', () => {
  it('reads the node it has now, after a layout change', () => {
    const { rerender } = render(<Column narrow />);
    rerender(<Column narrow={false} />);
    expect(screen.getByText('desk').dataset.after).toBe('true');
  });
});
