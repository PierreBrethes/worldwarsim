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
