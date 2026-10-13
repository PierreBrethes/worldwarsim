import { describe, expect, it } from 'vitest';
import { appearedCamps } from './blocks';

const camp = (id: string, washed = false) => ({ id, washed });

describe('which surveyed camps are set down by a hand', () => {
  it('none at the first display: on loading everything already stands', () => {
    expect(appearedCamps(null, [camp('a'), camp('b')])).toEqual([]);
  });

  it('a camp absent from the previous display appears', () => {
    expect(appearedCamps(new Set(['a']), [camp('a'), camp('b')])).toEqual(['b']);
  });

  it('a camp that was there and turned to its last known position does not appear again', () => {
    expect(appearedCamps(new Set(['a']), [camp('a', true)])).toEqual([]);
  });

  it('a last known position covered again is set down like a new sighting', () => {
    expect(appearedCamps(new Set(), [camp('a')])).toEqual(['a']);
  });

  it('a last known position new to the display is a memory, not a sighting under the eyes', () => {
    expect(appearedCamps(new Set(), [camp('a', true)])).toEqual([]);
  });
});
