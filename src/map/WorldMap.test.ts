import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildLabels, type MapMarker } from '@/domain/labels';
import type { PlayerView } from '@/domain/player-view';
import { targetOfLabel } from './WorldMap';

/**
 * Le mât d'un avant-poste est posé sous une clé de calque (`outpost-<id>`) alors que la rose et
 * le serveur lisent l'identité Convex : la cible doit rendre la seconde, sinon « élever » reste
 * muet et la marche répond `UNKNOWN_OUTPOST`.
 */
describe('targetOfLabel', () => {
  it("rend l'identité de l'avant-poste, pas la clé du marqueur", () => {
    const marker: MapMarker = {
      kind: 'outpost',
      id: 'outpost-o1',
      lonLat: [2, 48],
      hostCountry: 'FRA',
      specialty: 'general',
      station: { kind: 'outpost', outpostId: 'o1' },
      level: 1,
      standsAt: null,
      garrison: 0,
      reach: null,
      ink: '#000',
    };
    const view = { arcs: [], captures: [], loadedAt: 0 } as unknown as PlayerView;
    const labels = buildLabels(view, [marker]);
    expect(labels).toHaveLength(1);
    const label = labels[0]!;

    const target = targetOfLabel(
      label,
      'FRA',
      null,
      () => false,
      () => 'land',
    );

    expect(target).toMatchObject({ kind: 'outpost', id: 'o1' });
  });
});

describe('WorldMap tells the engine what the player dismantled (#340)', () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'WorldMap.tsx'),
    'utf-8',
  );

  it('hands over the pins by the id the board gives an outpost', () => {
    expect(source).toMatch(
      /readyEngine\.dismantling = new Set\(dismantling\.map\(\(\{ id \}\) => outpostPinId\(id\)\)\)/,
    );
  });

  it('erases an area only for the points that confirmed one', () => {
    expect(source).toMatch(
      /dismantled\.current\.filter\(\(\{ area \}\) => area\)[\s\S]*leftReaches\(before, outposts, erased\)[\s\S]*readyEngine\?\.eraseReach/,
    );
  });
});
