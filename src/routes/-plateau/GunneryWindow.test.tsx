import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GunnerySheet } from './GunneryWindow';

describe('GunnerySheet', () => {
  it('prints the existing detection range beside nominal loot capacity and engine pace', () => {
    const markup = renderToStaticMarkup(
      <GunnerySheet profile="infantry1" workshop={undefined} theatre={null} />,
    );

    expect(markup).toContain('60 km');
    expect(markup).toContain('capacité nominale de butin : 40');
    expect(markup).toContain('par terre · à pied · indice 1,6');
  });
});
