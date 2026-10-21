import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import { SupplyPictos } from './SupplyPictos';

describe('SupplyPictos', () => {
  it('prints the ammunition and fuel plates, the empty count critical', () => {
    const markup = renderToStaticMarkup(
      <SupplyPictos
        supplies={{
          rounds: { held: 0, full: 3 },
          fuel: { held: 2, full: 6, resource: 'coal', refuelAt: null },
        }}
      />,
    );

    expect(markup.match(/<img/g)).toHaveLength(2);
    expect(markup).toContain(`title="${fr.resources.ammunition}"`);
    expect(markup).toContain(`title="${fr.resources.coal}"`);
    expect(markup.match(/var\(--critical\)/g)).toHaveLength(1);
    expect(markup).toContain('2/6');
  });

  it('says when Baku gives the next step of fuel back', () => {
    const markup = renderToStaticMarkup(
      <SupplyPictos
        supplies={{
          rounds: null,
          fuel: {
            held: 1,
            full: 3,
            resource: 'oil',
            refuelAt: Date.now() + 7 * 3_600_000 + 60_000,
          },
        }}
      />,
    );
    expect(markup).toContain('+1 · 7 h');
    expect(markup).toContain('Bakou');
  });

  it('draws nothing in Blitz, where nobody counts', () => {
    expect(renderToStaticMarkup(<SupplyPictos supplies={null} />)).toBe('');
  });
});
