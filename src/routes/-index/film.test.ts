import { expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import { FILM_LOOP, FILM_SHOTS, loopedTime, subtitleAt } from './film';

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

it('fait la boucle de la une de deux à cinq plans du film', () => {
  const inside = FILM_SHOTS.filter(
    (shot) => shot.start >= FILM_LOOP.from && shot.end <= FILM_LOOP.to,
  );
  expect(inside.length).toBeGreaterThanOrEqual(2);
  expect(inside.length).toBeLessThanOrEqual(5);
});

it('rend la boucle à son début quand elle atteint sa fin', () => {
  expect(loopedTime(FILM_LOOP.from + 1)).toBe(FILM_LOOP.from + 1);
  expect(loopedTime(FILM_LOOP.to)).toBe(FILM_LOOP.from);
  expect(loopedTime(FILM_LOOP.to + 10)).toBe(FILM_LOOP.from);
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

it('finit la boucle sur la fin d’un plan', () => {
  expect(FILM_SHOTS.map((shot) => shot.end)).toContain(FILM_LOOP.to);
});
