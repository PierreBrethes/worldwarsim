import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import { Price } from './Price';

describe('Price', () => {
  it('prints each resource with its picto in its own ink, steel first', () => {
    const markup = renderToStaticMarkup(<Price costs={{ food: 10, steel: 18 }} />);

    expect(markup.indexOf('res-steel')).toBeLessThan(markup.indexOf('res-food'));
    expect(markup).toContain('var(--res-steel-paper)');
    expect(markup).toContain('var(--res-food-paper)');
    expect(markup.match(/<svg/g)).toHaveLength(2);
    expect(markup).toContain(fr.resources.food);
  });

  it('turns the missing figure critical and leaves the other one alone', () => {
    const markup = renderToStaticMarkup(<Price costs={{ steel: 18, food: 10 }} lacking="food" />);

    expect(markup.match(/var\(--critical\)/g)).toHaveLength(1);
  });

  it('prints nothing for a resource the price does not ask', () => {
    expect(
      renderToStaticMarkup(<Price costs={{ steel: 5, oil: 0 }} />).match(/<svg/g),
    ).toHaveLength(1);
  });
});
