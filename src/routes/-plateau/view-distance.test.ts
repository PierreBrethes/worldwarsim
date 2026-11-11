import { describe, expect, it } from 'vitest';
import { pieceStands } from '@/map/engine/figurines/figurine';
import { DISPATCH_VIEW_DISTANCE, HOME_VIEW_DISTANCE } from './view-distance';

describe('where the camera stands', () => {
  it('brings the player home to where his pieces stand whole, troops and sites alike', () => {
    expect(pieceStands(HOME_VIEW_DISTANCE, 'socle')).toBe(1);
  });

  it('keeps a dispatch place wider than a piece: it is a scene between regions', () => {
    expect(DISPATCH_VIEW_DISTANCE).toBeGreaterThan(HOME_VIEW_DISTANCE);
  });
});
