// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMapMotionSetting } from '@/data/mapMotion';
import { FicheSheet } from './FicheSheet';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  setMapMotionSetting('full');
});
afterEach(cleanup);

function Sheet() {
  const [tab, setTab] = useState('a');
  return (
    <FicheSheet
      title="Camp relevé"
      summary="le résumé"
      lead={<p>l’ordre de tête</p>}
      tabs={[
        { id: 'a', label: 'relevé' },
        { id: 'b', label: 'abaque', count: '2' },
      ]}
      tab={tab}
      onTab={setTab}
      onClose={() => {}}
    >
      <p>contenu {tab}</p>
    </FicheSheet>
  );
}

describe('FicheSheet cycle (#593)', () => {
  const tabs = [{ id: 'a', label: 'relevé' }];
  const at = (id: string, go: { prev: () => void; next: () => void }) => (
    <FicheSheet
      title="Camp relevé"
      summary={`résumé ${id}`}
      tabs={tabs}
      tab="a"
      onTab={() => {}}
      cycle={{ at: id, onPrev: go.prev, onNext: go.next }}
      onClose={() => {}}
    >
      <p>contenu {id}</p>
    </FicheSheet>
  );

  it('puts ‹ and › in the pinned header, each calling its own neighbour', () => {
    const go = { prev: vi.fn(), next: vi.fn() };
    render(at('x', go));
    act(() => screen.getByRole('button', { name: 'objet suivant' }).click());
    expect(go.next).toHaveBeenCalledTimes(1);
    expect(go.prev).not.toHaveBeenCalled();
    act(() => screen.getByRole('button', { name: 'objet précédent' }).click());
    expect(go.prev).toHaveBeenCalledTimes(1);
  });

  it('shows no arrows without a cycle', () => {
    render(<Sheet />);
    expect(screen.queryByRole('button', { name: 'objet suivant' })).toBeNull();
  });

  it('swaps the content in a 120 ms fade when the object changes, none when motion is cut', () => {
    const go = { prev: () => {}, next: () => {} };
    const { rerender } = render(at('x', go));
    const first = screen.getByText('résumé x').closest('.tab-fade');
    expect(first).not.toBeNull();
    rerender(at('y', go));
    const second = screen.getByText('résumé y').closest('.tab-fade');
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    cleanup();
    act(() => setMapMotionSetting('off'));
    render(at('x', go));
    expect(screen.getByText('résumé x').closest('.tab-fade')).toBeNull();
  });

  it('reads the next object from its top, not where the last one was scrolled', () => {
    const go = { prev: () => {}, next: () => {} };
    const { rerender } = render(at('x', go));
    const body = document.querySelector<HTMLElement>('.overscroll-contain')!;
    body.scrollTop = 120;
    rerender(at('y', go));
    expect(body.scrollTop).toBe(0);
  });
});

describe('FicheSheet', () => {
  it('is short at first: the summary and the lead order, no tabs, no body (#588)', () => {
    render(<Sheet />);
    expect(screen.getByText('le résumé')).toBeTruthy();
    expect(screen.getByText('l’ordre de tête')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByText(/contenu/)).toBeNull();
  });

  it('unrolls by the summary line: tabs, the open one underlined, the body of the tab', () => {
    render(<Sheet />);
    act(() => screen.getByText('le résumé').click());
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(tabs[0]!.className).toContain('border-[var(--ink)]');
    expect(screen.getByText('contenu a')).toBeTruthy();
    expect(screen.queryByText('l’ordre de tête')).toBeNull();
    act(() => tabs[1]!.click());
    expect(screen.getByText('contenu b')).toBeTruthy();
  });

  it('fades the body in 120 ms, and not at all when motion is cut', () => {
    render(<Sheet />);
    act(() => screen.getByText('le résumé').click());
    expect(screen.getByRole('tabpanel').className).toContain('tab-fade');
    cleanup();
    act(() => setMapMotionSetting('off'));
    render(<Sheet />);
    act(() => screen.getByText('le résumé').click());
    expect(screen.getByRole('tabpanel').className).not.toContain('tab-fade');
  });
});
