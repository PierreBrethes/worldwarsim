import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FrameDemand, HEARTBEAT_MS, SETTLE_MS } from './frame-demand';

describe('FrameDemand', () => {
  it('renders through the whole settle window after a stir, then rests', () => {
    const demand = new FrameDemand(0);
    expect(demand.due(0)).toBe('stirred');
    expect(demand.due(SETTLE_MS)).toBe('stirred');
    expect(demand.due(SETTLE_MS + 16)).toBeNull();

    demand.stir(SETTLE_MS + 32);
    expect(demand.due(SETTLE_MS + 32)).toBe('stirred');
    expect(demand.due(2 * SETTLE_MS + 32)).toBe('stirred');
    expect(demand.due(2 * SETTLE_MS + 48)).toBeNull();
  });

  it('renders one ambient frame for a single request without opening the window', () => {
    const demand = new FrameDemand(0);
    expect(demand.due(SETTLE_MS + 100)).toBe('heartbeat');
    expect(demand.due(SETTLE_MS + 116)).toBeNull();
    demand.request();
    expect(demand.due(SETTLE_MS + 132)).toBe('ambient');
    expect(demand.due(SETTLE_MS + 148)).toBeNull();
  });

  it('never stays frozen: a heartbeat frame is due even when nothing stirred', () => {
    const demand = new FrameDemand(0);
    const lastStirred = SETTLE_MS;
    expect(demand.due(lastStirred)).toBe('stirred');

    let rendered = 0;
    for (let now = lastStirred + 16; now <= lastStirred + 10 * HEARTBEAT_MS; now += 16) {
      if (demand.due(now) === 'heartbeat') rendered += 1;
    }
    expect(rendered).toBeGreaterThanOrEqual(9);
    expect(rendered).toBeLessThanOrEqual(10);
  });

  it('keeps the heartbeat whole under an ambience that asks at thirty frames a second', () => {
    const demand = new FrameDemand(0);
    const lastStirred = SETTLE_MS;
    demand.due(lastStirred);

    const reasons: string[] = [];
    for (let now = lastStirred + 33; now <= lastStirred + 10 * HEARTBEAT_MS; now += 33) {
      demand.request();
      reasons.push(demand.due(now) ?? 'none');
    }
    expect(reasons).not.toContain('none');
    const whole = reasons.filter((reason) => reason === 'heartbeat').length;
    expect(whole).toBeGreaterThanOrEqual(9);
    expect(whole).toBeLessThanOrEqual(10);
  });

  it('renders a stirred frame whole even when the ambience asked for it too', () => {
    const demand = new FrameDemand(0);
    demand.request();
    expect(demand.due(16)).toBe('stirred');
  });
});

/**
 * **La moitié statique de la règle**, comme `roleOf` et le balayage des tables côté serveur :
 * la carte ne rend plus que sur demande, donc une méthode publique du moteur qui change ce
 * qu'on voit sans appeler `invalidate()` laisserait l'écran en retard — et rien d'autre ne le
 * dirait. Une méthode qui **ne fait que lire** se déclare ici, nommément.
 */
describe('every public method of the engine asks for a frame', () => {
  const READ_ONLY: ReadonlySet<string> = new Set([
    'invalidate',
    'pieceRect',
    'subscribeRest',
    'cameraDistance',
    'atZoomFloor',
    'countryAtPoint',
    'pointAt',
    'regionAtPoint',
    'regionAtLonLat',
    'coastAt',
    'landAt',
    'dispose',
  ]);

  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, 'index.ts'), 'utf-8');
  const engine = source.slice(source.indexOf('export class MapEngine'));
  /** A public method: two spaces, a name, a parenthesis — `private`, accessors and the
   *  constructor are not. The body runs to the first closing brace at the same indent. */
  const METHOD = /^ {2}(?!private |get |set |constructor)([a-zA-Z]+)\([\s\S]*?^ {2}\}$/gm;
  const methods = [...engine.matchAll(METHOD)].map(([body, name]) => ({ name: name!, body }));

  it('reads the engine rather than an empty list', () => {
    const names = methods.map((method) => method.name);
    expect(names).toContain('displayArcs');
    expect(names).toContain('showReach');
    expect(names).toContain('cameraDistance');
    expect(names.length).toBeGreaterThan(25);
  });

  it.each(methods.filter((method) => !READ_ONLY.has(method.name)))(
    '$name calls invalidate()',
    ({ body }) => {
      expect(body).toContain('this.invalidate();');
    },
  );

  it('lists as read-only only methods that exist', () => {
    const names = new Set(methods.map((method) => method.name));
    expect([...READ_ONLY].filter((name) => !names.has(name))).toEqual([]);
  });
});
