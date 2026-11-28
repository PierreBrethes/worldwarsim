import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('the cartouche of one of the Seven (#699)', () => {
  it('hangs 8 screen pixels over the head: the callout is divided by the HUD zoom the label wears', () => {
    const css = readFileSync('src/styles/labels.css', 'utf8');
    const rule = css.match(/\.label--strategic\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain('--label-callout: calc(8px / var(--hud-scale) + var(--label-stagger))');
  });
});
