import { describe, expect, it } from 'vitest';
import { PointerRest, REST_MS } from './pointer-rest';

describe('PointerRest', () => {
  it('waits for a first move: a piece just lifted is not a stop', () => {
    const rest = new PointerRest();
    expect(rest.due(10 * REST_MS)).toBe(false);
  });

  it('tells a stop once, after REST_MS still', () => {
    const rest = new PointerRest();
    expect(rest.moved(0)).toBe(false);
    expect(rest.due(REST_MS - 1)).toBe(false);
    expect(rest.due(REST_MS)).toBe(true);
    expect(rest.due(REST_MS + 500)).toBe(false);
  });

  it('a move restarts the wait, and ends a stop already told', () => {
    const rest = new PointerRest();
    rest.moved(0);
    rest.moved(200);
    expect(rest.due(REST_MS)).toBe(false);
    expect(rest.due(200 + REST_MS)).toBe(true);
    expect(rest.moved(600)).toBe(true);
    expect(rest.moved(610)).toBe(false);
    expect(rest.due(610 + REST_MS)).toBe(true);
  });

  it('stops waiting when the pointer leaves or the piece is put down', () => {
    const rest = new PointerRest();
    rest.moved(0);
    expect(rest.stop()).toBe(false);
    expect(rest.due(REST_MS)).toBe(false);
    rest.moved(1000);
    rest.due(1000 + REST_MS);
    expect(rest.stop()).toBe(true);
    expect(rest.stop()).toBe(false);
  });
});
