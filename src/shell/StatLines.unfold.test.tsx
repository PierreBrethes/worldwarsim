// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { troopStats } from '@/domain/stat-sheet';
import { fr } from '@/i18n/fr';
import { StatLines } from './StatLines';

afterEach(cleanup);

describe('StatLines unfold', () => {
  it('shows the note of a statistic under its line when touched, and hides it again', () => {
    const { container } = render(<StatLines rows={troopStats('infantry', 1, null)} />);
    const button = container.querySelector('[data-stat="pace"] button') as HTMLButtonElement;
    expect(container.textContent).not.toContain(fr.stats.notes.pace);
    act(() => button.click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain(fr.stats.notes.pace);
    act(() => button.click());
    expect(container.textContent).not.toContain(fr.stats.notes.pace);
  });
});
