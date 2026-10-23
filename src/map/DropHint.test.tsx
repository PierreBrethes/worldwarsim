import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DropHintChip, type DropFuel } from './DropHint';

const hint = { icon: '→', tone: 'order' as const, verb: 'marcher', detail: null };
const gauge = (fuel: Partial<DropFuel>): DropFuel => ({
  held: 4,
  full: 6,
  resource: 'coal',
  eaten: 2,
  spared: 0,
  short: 0,
  roundTrip: false,
  ...fuel,
});
const spoken = (fuel: DropFuel) =>
  renderToStaticMarkup(<DropHintChip hint={hint} fuel={fuel} ref={null} />)
    .match(/<span class="sr-only">([^<]*)<\/span>/)?.[1]
    ?.replaceAll('&#x27;', '’');

describe('the fuel gauge under the hand', () => {
  it('tells a screen reader what the road eats, what it lacks and what Singapore spares', () => {
    expect(spoken(gauge({}))).toBe('plein : la route mange 2 crans sur 4');
    expect(spoken(gauge({ held: 1, eaten: 3, short: 2 }))).toBe(
      'plein : la route mange 3 crans sur 1 — manque 2',
    );
    expect(spoken(gauge({ spared: 1, roundTrip: true }))).toBe(
      'plein : l’aller-retour mange 2 crans sur 4 — Singapour épargne 1 cran',
    );
  });

  it('spills no more cells than the tube holds, the count says the rest', () => {
    const markup = renderToStaticMarkup(
      <DropHintChip hint={hint} fuel={gauge({ held: 6, eaten: 30, short: 24 })} ref={null} />,
    );
    expect(markup.match(/fuel-step--short/g)).toHaveLength(6);
    expect(markup).toContain('manque 24');
  });
});

describe('a road the server refuses', () => {
  const refusal = { text: 'plein trop court', alarm: true, refusal: true };
  const markup = renderToStaticMarkup(
    <DropHintChip
      hint={hint}
      fuel={gauge({ held: 1, eaten: 3, short: 2 })}
      notes={[refusal]}
      ref={null}
    />,
  );

  it('takes the refusal tone instead of the order tick, the refusal as its verb', () => {
    expect(markup).toContain('drop-chip--refused');
    expect(markup).not.toContain('drop-chip--order');
    expect(markup).toContain('✕');
    expect(markup).toMatch(/drop-chip-verb">plein trop court</);
    expect(markup).not.toContain('relâcher pour ordonner');
  });

  it('keeps the fuel gauge under the verb', () => {
    expect(markup).toContain('drop-chip-fuel');
  });
});
