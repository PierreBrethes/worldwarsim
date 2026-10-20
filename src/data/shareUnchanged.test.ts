import { describe, expect, it } from 'vitest';
import { shareUnchanged } from './shareUnchanged';

const answer = () => ({
  loadedAt: 1,
  me: {
    resources: { food: 10, coal: 4 },
    troops: [
      { id: 't1', role: 'infantry', supplied: true },
      { id: 't2', role: 'tank', supplied: true },
    ],
  },
  arcs: [{ id: 'a1', from: [0, 1], to: [2, 3] }],
  press: null,
});

describe('shareUnchanged', () => {
  it('rend la vue précédente entière quand deux réponses sont égales', () => {
    const previous = answer();
    expect(shareUnchanged(previous, answer())).toBe(previous);
  });

  it('ne change que le chemin du champ qui a changé', () => {
    const previous = answer();
    const next = answer();
    next.me.troops[1]!.supplied = false;
    const shared = shareUnchanged(previous, next);
    expect(shared).not.toBe(previous);
    expect(shared.me).not.toBe(previous.me);
    expect(shared.me.troops).not.toBe(previous.me.troops);
    expect(shared.me.troops[1]).not.toBe(previous.me.troops[1]);
    expect(shared.me.troops[1]).toEqual(next.me.troops[1]);
    expect(shared.me.troops[0]).toBe(previous.me.troops[0]);
    expect(shared.me.resources).toBe(previous.me.resources);
    expect(shared.arcs).toBe(previous.arcs);
    expect(shared).toEqual(next);
  });

  it('tient un tableau qui grandit ou rétrécit pour changé, en gardant ses éléments égaux', () => {
    const previous = answer();
    const next = answer();
    next.arcs.push({ id: 'a2', from: [4, 5], to: [6, 7] });
    const shared = shareUnchanged(previous, next);
    expect(shared.arcs).not.toBe(previous.arcs);
    expect(shared.arcs[0]).toBe(previous.arcs[0]);
    expect(shareUnchanged(next, answer()).arcs).toHaveLength(1);
  });

  it('distingue une clé absente d’une clé à undefined', () => {
    const previous: { a: number; b?: undefined } = { a: 1 };
    const next: { a: number; b?: undefined } = { a: 1, b: undefined };
    expect(shareUnchanged(previous, next)).not.toBe(previous);
  });

  it('sans vue précédente, rend la réponse telle quelle', () => {
    const next = answer();
    expect(shareUnchanged(null, next)).toBe(next);
  });
});
