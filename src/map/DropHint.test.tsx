import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CompassAction } from '@/domain/compass-rose';
import { fr } from '@/i18n/fr';
import {
  DropHintChip,
  hintOfReading,
  secondRefusalOn,
  type ChainChip,
  type DropFuel,
  type DropHint,
} from './DropHint';

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

  it('counts a new course in what the stock pays past the paid fuel (#449)', () => {
    const count = (fuel: DropFuel) =>
      renderToStaticMarkup(<DropHintChip hint={hint} fuel={fuel} ref={null} />)
        .match(/<span class="fuel-count"[^>]*>(.*?)<\/span>/)?.[1]
        ?.replace(/<[^>]+>/g, '');
    const truk = gauge({ resource: 'oil', held: 4, full: 6, eaten: 13, paid: 11 });
    expect(count(truk)).toBe('+2 pétrole · 11 déjà payés');
    expect(count(gauge({ resource: 'oil', eaten: 9, paid: 11 }))).toBe('plein : 9 / 11 déjà payés');
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

/** **Un ordre refusé à côté d'un autre offert** (#376) : la ronde refusée sous la marche. */
describe('a refusal beside the offered order', () => {
  it('says the refused branch under the verb it keeps', () => {
    const march = { key: 'aim', label: 'marcher', cost: null } as unknown as CompassAction;
    const shown = hintOfReading(
      { kind: 'orders', verbs: [march], aside: 'liaison déjà tenue' },
      () => 0,
      null,
    )!;
    expect(shown.aside).toBe('liaison déjà tenue');
    const markup = renderToStaticMarkup(<DropHintChip hint={shown} ref={null} />);
    expect(markup).toContain('drop-chip-detail--alarm">liaison déjà tenue<');
  });
});

/** **La Guerre éclair sous la main** (#451, maquette A « Maj »). */
describe('the blitzkrieg chip', () => {
  const fight: DropHint = {
    icon: '⚔',
    tone: 'fight',
    verb: 'Attaquer',
    detail: 'initiative',
    order: true,
  };
  const said = (chain: ChainChip, on: DropHint = fight) =>
    renderToStaticMarkup(<DropHintChip hint={on} chain={chain} ref={null} />).replaceAll(
      '&#x27;',
      '’',
    );

  it('offers the second target at the foot of an attack, and arms it under Shift', () => {
    expect(said({ kind: 'offer' })).toContain('Maj en lâchant : une seconde cible');
    const armed = said({ kind: 'armed', first: 'Liège', span: '4 h 10' });
    expect(armed).toContain('Attaquer, puis…');
    expect(armed).toContain('lâchez : la première jambe se pose sur Liège · 4 h 10');
    expect(armed).toContain('relâchez Maj avant de lâcher : Liège seule');
  });

  it('keeps a march offered under Shift, and says why it does not chain', () => {
    const march = said({ kind: 'refused', reason: 'une marche n’enchaîne pas' }, hint);
    expect(march).toContain('marcher');
    expect(march).toContain('Maj : une marche n’enchaîne pas');
  });

  it('names the second target and what it waits for, or turns red on its refusal', () => {
    const second = said({
      kind: 'second',
      first: 'Liège',
      then: 'Namur',
      span: '3 h 05',
      refusal: null,
    });
    expect(second).toContain('Puis Namur');
    expect(second).toContain('initiative · +3 h 05 après terrain tenu à Liège');
    expect(second).toContain('terrain perdu : Namur tombe, les survivants rentrent');
    expect(second).toContain('relâcher : deux cibles, un slot · Échap : Liège seule');
    const refused = said({
      kind: 'second',
      first: 'Liège',
      then: null,
      span: null,
      refusal: 'pas les siens',
    });
    expect(refused).toContain('drop-chip--refused');
    expect(refused).toContain('relâcher : rien ne part, la colonne revient · Échap : Liège seule');
  });

  it('refuses as a second target what is no order: boarding, joining, a garrison', () => {
    const second: ChainChip = {
      kind: 'second',
      first: 'Liège',
      then: null,
      span: null,
      refusal: null,
    };
    const board: DropHint = { icon: '⤓', tone: 'order', verb: 'Embarquer', detail: null };
    expect(secondRefusalOn(board, second)).toBe(fr.blitzkrieg.notAnOrder);
    expect(said(second, board)).toContain('drop-chip--refused');
    expect(secondRefusalOn(fight, second)).toBeNull();
    expect(secondRefusalOn(board, { kind: 'offer' })).toBeNull();
  });
});
