import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RaceMarks } from './RaceMarks';

const mark = (nation: string | null, contested: boolean) => ({
  id: 'a',
  key: 'tangier' as const,
  nation,
  contested,
});

/** Un point neutre et contesté se lit : des hachures d'encre, non de papier sur le papier. */
describe('RaceMarks', () => {
  it('hatches a contested neutral point in ink, and a contested held one in paper', () => {
    const neutral = renderToStaticMarkup(<RaceMarks marks={[mark(null, true)]} size={9} />);
    expect(neutral).toContain('var(--ink) 55%');
    const held = renderToStaticMarkup(<RaceMarks marks={[mark('france', true)]} size={9} />);
    expect(held).toContain('var(--paper) 2px');
    const calm = renderToStaticMarkup(<RaceMarks marks={[mark(null, false)]} size={9} />);
    expect(calm).not.toContain('repeating-linear-gradient');
  });
});
