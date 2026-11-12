import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { HeapMark } from '@/domain/heap-reading';
import { HeapFoot } from './HeapFoot';

const HOUR = 3_600_000;
const mark = (over: Partial<HeapMark> = {}): HeapMark => ({
  resource: 'food',
  amount: 100,
  cap: 288,
  perHour: 0,
  asOf: Date.now(),
  fullSince: null,
  foundation: null,
  ...over,
});
const html = (heap: HeapMark) => renderToStaticMarkup(<HeapFoot heap={heap} />);

describe('HeapFoot', () => {
  it('draws the stack, the number over the cap and the gauge of a filling heap, with no stamp', () => {
    const out = html(mark());
    expect(out).toContain('100<small> / 288</small>');
    expect(out).toContain('heap-stack');
    expect(out).not.toContain('PLEIN');
  });

  it('stamps a full heap and says since when it stopped', () => {
    const out = html(mark({ amount: 288, fullSince: Date.now() - 3 * HOUR }));
    expect(out).toContain('PLEIN · ARRÊTÉE depuis 3 h');
    expect(out).toContain('heap-foot--full');
  });

  it('says a level 1 foundation reports alone, and draws no heap', () => {
    const out = html(mark({ cap: 0, amount: 0, foundation: { alonePerHour: 12 } }));
    expect(out).toContain('rapporte seule · 12 vivres / h');
    expect(out).not.toContain('heap-stack');
  });

  it('says what a raised foundation still reports alone beside its heap', () => {
    expect(html(mark({ foundation: { alonePerHour: 12 } }))).toContain('+ 12 / h seul');
  });

  it('draws nothing for an exploitation with neither heap nor mark', () => {
    expect(html(mark({ cap: 0, amount: 0 }))).toBe('');
  });
});
