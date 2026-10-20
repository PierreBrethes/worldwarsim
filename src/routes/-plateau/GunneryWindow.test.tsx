import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GunnerySheet } from './GunneryWindow';

describe('GunnerySheet', () => {
  it('prints every statistic of the piece through the statistics block', () => {
    const markup = renderToStaticMarkup(
      <GunnerySheet profile="infantry1" workshop={undefined} theatre={null} />,
    );

    expect(markup).toContain('data-stat="pace"');
    expect(markup).toContain('60 km');
    expect(markup).toContain('au contact · 25 km');
    expect(markup).toContain('marche');
    expect(markup).toContain('data-stat="loot"');
  });

  it('no longer prints the pace as an index', () => {
    const markup = renderToStaticMarkup(
      <GunnerySheet profile="armor1" workshop={undefined} theatre={null} />,
    );
    expect(markup).not.toContain('indice');
  });
});
