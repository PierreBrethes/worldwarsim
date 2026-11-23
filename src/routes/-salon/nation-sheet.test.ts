import { expect, it } from 'vitest';
import { WORLD_BOX } from '@/emblems/EngravedMap';
import { phoneBoxOf, phoneSheetOf, salonBoxOf, sheetOf, tintsOf } from './nation-sheet';

const SEVEN = [
  'tangier',
  'istanbul',
  'rangoon',
  'hongKong',
  'halifax',
  'narvik',
  'lisbon',
] as const;

it('writes a nation sheet from its capital, asset, neighbours and near points', () => {
  const sheet = sheetOf('germany', SEVEN, 'mondiale');
  expect(sheet.capital).toBe('Berlin');
  expect(sheet.asset).toBe('blitzkrieg');
  expect(sheet.neighbours).toContain('france');
  expect(sheet.nearPoints.length).toBeGreaterThan(0);
});

it('gives a classic nation no asset, and a Blitz none at all', () => {
  expect(sheetOf('france', SEVEN, 'mondiale').asset).toBeNull();
  expect(sheetOf('germany', SEVEN, 'blitz').asset).toBeNull();
});

it("tints the nation shown, the taken ones, mine, and the shown one's neighbours", () => {
  const tints = tintsOf({
    shown: 'germany',
    me: 'japan',
    taken: ['france', 'japan'],
    neighbours: ['france', 'italy'],
  });
  expect(tints.germany).toMatchObject({ kind: 'chosen', shown: true });
  expect(tints.japan).toMatchObject({ kind: 'chosen', mine: true });
  expect(tints.france).toMatchObject({ kind: 'taken', neighbour: true });
  expect(tints.italy).toMatchObject({ kind: 'neighbour' });
});

it('hatches a taken nation that is shown, and shows nothing when nothing is shown', () => {
  expect(
    tintsOf({ shown: 'france', me: null, taken: ['france'], neighbours: [] }).france,
  ).toMatchObject({
    kind: 'taken',
    shown: true,
  });
  expect(tintsOf({ shown: null, me: null, taken: [], neighbours: [] })).toEqual({});
});

it('narrows the world box to the north and follows the frame height', () => {
  const box = salonBoxOf({ width: 1000, height: 400 });
  expect(box[1]).toBeGreaterThan(WORLD_BOX[1]);
  expect(box[3]).toBe(WORLD_BOX[3]);
  expect(salonBoxOf({ width: 1000, height: 300 })[1]).toBeGreaterThan(box[1]);
  expect(salonBoxOf({ width: 1000, height: 2000 })[1]).toBe(WORLD_BOX[1]);
});

it('gives each nation the sheet of its world, and the whole world to none', () => {
  expect(phoneSheetOf('france')).toBe('europe');
  expect(phoneSheetOf('uk')).toBe('europe');
  expect(phoneSheetOf('germany')).toBe('europe');
  expect(phoneSheetOf('italy')).toBe('europe');
  expect(phoneSheetOf('usa')).toBe('america');
  expect(phoneSheetOf('ussr')).toBe('russia');
  expect(phoneSheetOf('china')).toBe('asia');
  expect(phoneSheetOf('japan')).toBe('asia');
  expect(phoneSheetOf(null)).toBeNull();
  expect(phoneBoxOf(null)).not.toEqual(phoneBoxOf('france'));
});
