import { describe, expect, it } from 'vitest';
import { handAimOf } from './hand-aim';

const notes = [
  { text: '≈ 177 km · 8 h 51', alarm: false },
  { text: 'arrivée 22 h 53', alarm: false },
];

describe('handAimOf', () => {
  it('writes the verb and the place, then the notes of the aim as they are', () => {
    expect(handAimOf(['Marcher'], 0, 'près de Bourges', notes)).toEqual({
      verbs: ['Marcher'],
      chosen: 0,
      line: 'Marcher → près de Bourges · ≈ 177 km · 8 h 51 · arrivée 22 h 53',
      refusal: null,
    });
  });

  it('takes the chosen verb, and the first by default', () => {
    expect(handAimOf(['Marcher', 'Attaquer'], 1, 'Lyon', []).line).toBe('Attaquer → Lyon');
  });

  it('keeps a known refusal out of the line, to stand where « Envoyer » was', () => {
    const aim = handAimOf(['Marcher'], 0, 'Lyon', [
      { text: 'Aucune route', alarm: true, refusal: true },
    ]);
    expect(aim.refusal).toBe('Aucune route');
    expect(aim.line).toBe('Marcher → Lyon');
  });

  it('leaves « Envoyer » offered while the preview has not come', () => {
    expect(handAimOf(['Marcher'], 0, 'Lyon', []).refusal).toBeNull();
  });
});
