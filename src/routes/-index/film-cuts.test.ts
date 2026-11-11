import { expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import { FILM_SHOTS, subtitleAt } from './film-cuts';

it('pose le sous-titre du plan qui passe, et aucun entre deux plans', () => {
  const first = FILM_SHOTS[0]!;
  expect(subtitleAt(first.start)).toBe(first.subtitle);
  expect(subtitleAt(first.end - 0.01)).toBe(first.subtitle);
  expect(subtitleAt(FILM_SHOTS.at(-1)!.end)).toBeNull();
  expect(subtitleAt(1000)).toBeNull();
});

it('range les plans dans l’ordre, sans chevauchement', () => {
  FILM_SHOTS.forEach((shot, index) => {
    expect(shot.end).toBeGreaterThan(shot.start);
    if (index > 0) expect(shot.start).toBeGreaterThanOrEqual(FILM_SHOTS[index - 1]!.end);
  });
});

it('pose chaque sous-titre de fr.film.subtitles une fois, ni plus ni moins', () => {
  expect(FILM_SHOTS.map((shot) => shot.subtitle).sort()).toEqual(
    Object.keys(fr.film.subtitles).sort(),
  );
});

it('enchaîne les plans de 0 à 30 s au plus, sans trou', () => {
  expect(FILM_SHOTS[0]!.start).toBe(0);
  FILM_SHOTS.forEach((shot, index) => {
    if (index > 0) expect(shot.start).toBe(FILM_SHOTS[index - 1]!.end);
  });
  expect(FILM_SHOTS.at(-1)!.end).toBeLessThanOrEqual(30);
});
