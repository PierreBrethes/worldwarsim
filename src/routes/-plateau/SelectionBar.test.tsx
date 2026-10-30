// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import { SelectionBar } from './SelectionBar';

afterEach(cleanup);

const bar = (disbandRefusal: string | null, refusal: string | null = null) =>
  render(
    <SelectionBar
      piles={1}
      roles={['infantry', 'armor']}
      picking={false}
      refusal={refusal}
      disbandRefusal={disbandRefusal}
      onForm={() => {}}
      onDisband={() => {}}
      onClear={() => {}}
      onDone={() => {}}
    />,
  );

describe('SelectionBar, U', () => {
  it('offers U when the ring has room', () => {
    bar(null);
    expect(screen.getByRole('button', { name: new RegExp(fr.selection.disband) })).toBeTruthy();
  });

  it('says why before the gesture when it has none, and offers no U', () => {
    const why = fr.errors.NO_ROOM_TO_DISBAND();
    bar(why);
    expect(screen.getByText(why)).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(fr.selection.disband) })).toBeNull();
  });

  it('writes a refusal already said once, even when U was pressed on it', () => {
    const why = fr.errors.SQUAD_CARRIES_LOOT();
    bar(why, why);
    expect(screen.getAllByText(why)).toHaveLength(1);
  });
});
