import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import { Price } from './Price';

describe('Price', () => {
  it("prints each resource with the reserves' own plate, steel first", () => {
    const markup = renderToStaticMarkup(<Price costs={{ food: 10, steel: 18 }} />);

    expect(markup.indexOf(`title="${fr.resources.steel}"`)).toBeLessThan(
      markup.indexOf(`title="${fr.resources.food}"`),
    );
    expect(markup.match(/<img/g)).toHaveLength(2);
    expect(markup).not.toContain('<svg');
  });

  it('turns the missing figure critical and leaves the other one alone', () => {
    const markup = renderToStaticMarkup(<Price costs={{ steel: 18, food: 10 }} lacking="food" />);

    expect(markup.match(/var\(--critical\)/g)).toHaveLength(1);
  });

  it('prints nothing for a resource the price does not ask', () => {
    expect(
      renderToStaticMarkup(<Price costs={{ steel: 5, oil: 0 }} />).match(/<img/g),
    ).toHaveLength(1);
  });
});
