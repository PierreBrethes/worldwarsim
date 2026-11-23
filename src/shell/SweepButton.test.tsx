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

  it('as an icon, is one 44 px square: a touch sweeps, the chevron opens the list to the left and up (#621)', () => {
    const onSweep = vi.fn();
    render(<SweepButton species="iron" onSweep={onSweep} status="Onde en route" icon />);
    const launch = screen.getByTitle(fr.sweep.launch('iron'));
    expect(launch.className).toContain('h-[44px] w-[44px]');
    expect(launch.textContent).not.toContain(fr.sweep.button);
    fireEvent.click(launch);
    expect(onSweep).toHaveBeenLastCalledWith('iron');
    expect(screen.getByRole('status').textContent).toBe('Onde en route');
    fireEvent.click(screen.getByLabelText(fr.sweep.choose));
    expect(screen.getByRole('menu').className).toMatch(/right-0.*bottom-|bottom-.*right-0/);
    fireEvent.click(screen.getAllByRole('menuitem')[0]!);
    expect(onSweep).toHaveBeenLastCalledWith('coal');
  });
});
