import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'labels.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** The selectors of the rule that shrinks a folded plate with the camera's distance. */
const shrinking = (): ReadonlyArray<string> => {
  const rule = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(([, , body]) =>
    body!.includes('var(--plate-scale'),
  );
  return rule === undefined ? [] : rule[1]!.split(',').map((selector) => selector.trim());
};

describe('a plate seen from afar', () => {
  /** A Blitz neutral is an installation: at 46 px on a world map, its theatre's sites piled
   *  into one giant building over the North Sea. */
  it('shrinks for a surveyed or neutral installation as for a building of mine', () => {
    expect(shrinking()).toEqual(
      expect.arrayContaining([
        '.label--building.label--glyph .label-plate',
        '.label--installation.label--glyph .label-plate',
      ]),
    );
  });
});
