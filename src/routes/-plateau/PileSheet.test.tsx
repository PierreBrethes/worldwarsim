import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PileSheet } from './PileSheet';

describe('PileSheet', () => {
  it('prints the count of a stack and inks a wounded role red on three notches', () => {
    const markup = renderToStaticMarkup(
      <PileSheet
        cargo={[]}
        capacity={40}
        lines={[
          {
            role: 'infantry',
            troops: 2,
            troopIds: ['a', 'b'],
            health: 100,
            notches: 10,
            ink: 'ink',
          },
          { role: 'armor', troops: 1, troopIds: ['c'], health: 30, notches: 3, ink: 'red' },
        ]}
      />,
    );
    expect(markup).toContain('×2');
    expect(markup).toContain('30 / 100');
    expect(
      markup.match(/data-inked="true"[^>]*style="background:var\(--critical\)"/g),
    ).toHaveLength(3);
  });

  it('always shows the load, empty or not, and none in Blitz where nothing is carried', () => {
    const line = {
      role: 'infantry',
      troops: 1,
      troopIds: ['a'],
      health: 100,
      notches: 10,
      ink: 'ink',
    } as const;
    const empty = renderToStaticMarkup(<PileSheet cargo={[]} capacity={40} lines={[line]} />);
    expect(empty).toContain('à vide');
    expect(empty).toContain('0 / 40');
    expect(empty).toContain('aucun butin');
    expect(
      renderToStaticMarkup(<PileSheet cargo={[]} capacity={null} lines={[line]} />),
    ).not.toContain('à vide');
    // fighters, armour: a pile that can never load has no load to show
    expect(
      renderToStaticMarkup(<PileSheet cargo={[]} capacity={0} lines={[line]} />),
    ).not.toContain('à vide');
  });
});
