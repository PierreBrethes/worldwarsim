// @vitest-environment jsdom
import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Column, MovementAim } from '@/domain/movement-orders';
import { fr } from '@/i18n/fr';
import { chainChipOf, secondDropOf, secondRefusalOf, useEscapeKey } from './blitzkrieg-hand';
import type { OrderChoice, Previewed } from './order-wire';
import type { ChainedFirst } from './useOrderPreview';

const outpost = (outpostId: string): MovementAim => ({
  kind: 'outpost',
  outpostId,
  hostCountry: 'BEL',
  coastal: false,
});
const choice = (aim: MovementAim, extra: Partial<OrderChoice> = {}): OrderChoice => ({
  aim,
  type: 'attack',
  label: 'Attaquer',
  consequence: '',
  mission: { kind: 'march' },
  ...extra,
});
const column: Column = {
  roles: ['armor'],
  myRegionIds: new Set(),
  myOutpostIds: new Set(['bastogne']),
  departureBuildings: new Set(),
  afloat: false,
  coastal: false,
};
const preview = {
  destinationName: 'Liège',
  minutes: 250,
  route: { legs: [{ medium: 'land' }], points: [{ lon: 5.57, lat: 50.63 }] },
  pursuit: false,
} as unknown as NonNullable<Previewed> & ChainedFirst['preview'];
const chain: ChainedFirst = {
  station: { kind: 'outpost', outpostId: 'aachen' } as unknown as ChainedFirst['station'],
  first: choice(outpost('liege')),
  preview,
};
const weighed = {
  refusal: null,
  minutes: 185,
  destinationName: 'Namur',
  route: { distanceUnits: 60, legs: [{ medium: 'land' }], points: [] },
  fuel: { gauge: null, km: 60 },
} as unknown as Parameters<typeof secondRefusalOf>[3];

describe('the second target of a blitzkrieg (#451)', () => {
  it('chains an attack only: a march, a raid, a capture say why', () => {
    const namur = outpost('namur');
    expect(secondRefusalOf('blitzkrieg', chain, choice(namur), undefined, column)).toBeNull();
    expect(
      secondRefusalOf('blitzkrieg', chain, choice(namur, { type: 'march' }), undefined, column),
    ).toBe(fr.errors.CHAIN_ATTACK_ONLY({ type: 'march' }));
    expect(
      secondRefusalOf('blitzkrieg', chain, choice(namur, { type: 'raid' }), undefined, column),
    ).toBe(fr.errors.CHAIN_ATTACK_ONLY({ type: 'raid' }));
    const capture = choice(namur, {
      mission: { kind: 'capture', target: { kind: 'outpost', id: 'namur' } },
    } as unknown as Partial<OrderChoice>);
    expect(secondRefusalOf('blitzkrieg', chain, capture, undefined, column)).toBe(
      fr.errors.CHAIN_ATTACK_ONLY({ type: 'capture' }),
    );
  });

  it('refuses its own outpost and the first target, until the server weighs it', () => {
    expect(
      secondRefusalOf('blitzkrieg', chain, choice(outpost('bastogne')), undefined, column),
    ).toBe(fr.errors.FRIENDLY_TARGET({}));
    expect(secondRefusalOf('blitzkrieg', chain, choice(outpost('liege')), undefined, column)).toBe(
      fr.errors.SAME_TARGET(),
    );
    /** Pesée, la seconde jambe dit le refus du serveur : la route, la colonne au point. */
    const refused = {
      refusal: { code: 'CHAIN_ASHORE_ONLY', details: {} },
    } as unknown as Parameters<typeof secondRefusalOf>[3];
    expect(secondRefusalOf('blitzkrieg', chain, choice(outpost('namur')), refused, column)).toBe(
      fr.errors.CHAIN_ASHORE_ONLY(),
    );
  });

  it('chips nothing for another nation or a Blitz, and the refusal once the first is laid', () => {
    const args = {
      key: true,
      chain: null,
      resting: choice(outpost('liege')),
      preview,
      then: undefined,
      column,
    };
    expect(chainChipOf({ ...args, asset: null })).toBeNull();
    expect(chainChipOf({ ...args, asset: 'lendLease' })).toBeNull();
    expect(chainChipOf({ ...args, asset: 'blitzkrieg' })).toEqual({
      kind: 'armed',
      first: 'Liège',
      span: '4 h 10',
    });
    expect(
      chainChipOf({
        ...args,
        asset: 'blitzkrieg',
        resting: choice(outpost('x'), { type: 'march' }),
      }),
    ).toEqual({ kind: 'refused', reason: fr.errors.CHAIN_ATTACK_ONLY({ type: 'march' }) });
    expect(
      chainChipOf({
        ...args,
        asset: 'blitzkrieg',
        chain,
        resting: choice(outpost('bastogne')),
      }),
    ).toMatchObject({ kind: 'second', first: 'Liège', refusal: fr.errors.FRIENDLY_TARGET({}) });
    expect(
      chainChipOf({
        ...args,
        asset: 'blitzkrieg',
        chain,
        resting: choice(outpost('namur')),
        then: weighed,
      }),
    ).toEqual({ kind: 'second', first: 'Liège', then: 'Namur', span: '3 h 05', refusal: null });
  });

  it('sends nothing when let go on a refusal or on what is no order, and names both targets otherwise', () => {
    const namur = choice(outpost('namur'));
    expect(secondDropOf('blitzkrieg', chain, null, undefined, column)).toEqual({
      refusal: fr.blitzkrieg.notAnOrder,
    });
    expect(
      secondDropOf('blitzkrieg', chain, choice(outpost('bastogne')), undefined, column),
    ).toEqual({ refusal: fr.errors.FRIENDLY_TARGET({}) });
    expect(
      secondDropOf('blitzkrieg', chain, namur, { choice: namur, then: weighed }, column),
    ).toEqual({ refusal: null, then: 'Namur' });
    /** Le serveur a pesé une autre cible : son verdict ne vaut pas pour celle-ci. */
    expect(
      secondDropOf(
        'blitzkrieg',
        chain,
        namur,
        { choice: choice(outpost('spa')), then: weighed },
        column,
      ),
    ).toEqual({ refusal: null, then: null });
  });
});

describe('Escape with a piece in hand', () => {
  it('sends the first target alone between two targets, and puts the piece back otherwise', () => {
    const sendFirst = vi.fn();
    const putBack = vi.fn();
    const { rerender } = renderHook(
      ({ chained }) => useEscapeKey(true, chained, { sendFirst, putBack }),
      {
        initialProps: { chained: true },
      },
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(sendFirst).toHaveBeenCalledOnce();
    expect(putBack).not.toHaveBeenCalled();
    rerender({ chained: false });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(putBack).toHaveBeenCalledOnce();
    expect(sendFirst).toHaveBeenCalledOnce();
  });
});
