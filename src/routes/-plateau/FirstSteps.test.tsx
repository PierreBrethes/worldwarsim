// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { FirstStepsList, type FirstStepsState } from './FirstSteps';

afterEach(cleanup);

const state = (over: Partial<FirstStepsState> = {}): FirstStepsState => ({
  done: ['hq', 'move', 'harvest'],
  shown: 'open',
  lit: 'form',
  cue: null,
  outpostFirst: false,
  show: vi.fn(),
  ...over,
});

describe('FirstStepsList', () => {
  it('folds the steps done into one line and leaves only the lit step open (#607)', () => {
    render(<FirstStepsList steps={state()} onLead={() => {}} />);
    expect(screen.getByText(fr.firstSteps.steps.form)).toBeTruthy();
    expect(screen.queryByText(fr.firstSteps.steps.hq)).toBeNull();
    expect(screen.queryByText(fr.firstSteps.steps.deliver)).toBeNull();
    const line = screen.getByRole('button', { name: /premiers pas 3 \/ 6 ✓/ });
    expect(line.getAttribute('aria-expanded')).toBe('false');
  });

  it('unfolds the whole list from that line, and folds it back', () => {
    render(<FirstStepsList steps={state()} onLead={() => {}} />);
    const line = screen.getByRole('button', { name: /premiers pas 3 \/ 6/ });
    fireEvent.click(line);
    expect(screen.getByText(fr.firstSteps.steps.hq)).toBeTruthy();
    expect(screen.getByText(fr.firstSteps.steps.deliver)).toBeTruthy();
    fireEvent.click(line);
    expect(screen.queryByText(fr.firstSteps.steps.hq)).toBeNull();
  });

  it('shows no tick before the first step is done', () => {
    render(<FirstStepsList steps={state({ done: [], lit: 'hq' })} onLead={() => {}} />);
    expect(screen.getByRole('button', { name: /premiers pas 0 \/ 6$/ })).toBeTruthy();
  });
});
