import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SupplyPictos } from './SupplyPictos';

describe('SupplyPictos', () => {
  it('prints a cartridge and a jerrican, the empty count critical', () => {
    const markup = renderToStaticMarkup(
      <SupplyPictos
        supplies={{ rounds: { held: 0, full: 3 }, fuel: { held: 2, full: 6, resource: 'coal' } }}
      />,
    );

    expect(markup.match(/<svg/g)).toHaveLength(2);
    expect(markup).toContain('var(--res-ammunition-paper)');
    expect(markup).toContain('var(--res-coal-paper)');
    expect(markup.match(/var\(--critical\)/g)).toHaveLength(1);
    expect(markup).toContain('2/6');
  });

  it('draws nothing in Blitz, where nobody counts', () => {
    expect(renderToStaticMarkup(<SupplyPictos supplies={null} />)).toBe('');
  });
});
