import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PileSheet } from './PileSheet';

describe('PileSheet', () => {
  it('prints the count of a stack and inks a wounded role red on three notches', () => {
    const markup = renderToStaticMarkup(
      <PileSheet
        at={{ x: 0, y: 0 }}
        cargo={[]}
        lines={[
          { role: 'infantry', troops: 2, health: 100, notches: 10, ink: 'ink' },
          { role: 'armor', troops: 1, health: 30, notches: 3, ink: 'red' },
        ]}
      />,
    );
    expect(markup).toContain('×2');
    expect(markup).toContain('30 / 100');
    expect(
      markup.match(/data-inked="true"[^>]*style="background:var\(--critical\)"/g),
    ).toHaveLength(3);
  });
});
