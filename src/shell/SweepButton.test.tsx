// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { SweepButton } from './SweepButton';

/** **« Sonder · espèce »** (#249) : S relance la dernière espèce, 1 à 4 choisissent dans la liste
 *  ouverte — et seulement ouverte : fermée, un chiffre reste à la rose des vents. */
describe('SweepButton', () => {
  afterEach(cleanup);

  it('sweeps again for the last species on S, never while typing', () => {
    const onSweep = vi.fn();
    render(
      <>
        <input aria-label="champ" />
        <SweepButton species="oil" onSweep={onSweep} />
      </>,
    );
    fireEvent.keyDown(window, { key: 's' });
    expect(onSweep).toHaveBeenLastCalledWith('oil');
    screen.getByLabelText('champ').focus();
    fireEvent.keyDown(window, { key: 's' });
    expect(onSweep).toHaveBeenCalledTimes(1);
  });

  it('picks a species by its digit only while the list is open', () => {
    const onSweep = vi.fn();
    render(<SweepButton species="iron" onSweep={onSweep} />);
    fireEvent.keyDown(window, { key: '1' });
    expect(onSweep).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(fr.sweep.choose));
    fireEvent.keyDown(window, { key: '1' });
    expect(onSweep).toHaveBeenLastCalledWith('coal');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes its list at a press outside, so a digit goes back to the rose', () => {
    const onSweep = vi.fn();
    render(<SweepButton species="iron" onSweep={onSweep} />);
    fireEvent.click(screen.getByLabelText(fr.sweep.choose));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.keyDown(window, { key: '2' });
    expect(onSweep).not.toHaveBeenCalled();
  });

  it('keeps its list open at a press inside it', () => {
    render(<SweepButton species="iron" onSweep={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(fr.sweep.choose));
    fireEvent.pointerDown(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).not.toBeNull();
  });
});
