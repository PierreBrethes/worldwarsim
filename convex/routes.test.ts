import { describe, expect, it } from 'vitest';
import type { LonLat } from '../src/domain/geo';
import { homeCountryOf, pointOfBuilding, regionFacts } from './regions';
import { goalCellsForRegions } from './regionGeometry';
import { coastAtPoint, hostAtPoint, routeBetween, routeToRegions } from './routes';

/**
 * The empty string is the open sea and nothing else. It used to mean "no playable nation here"
 * as well, which fused two facts a hundred and fifty-five countries wide apart — and every rule
 * of fiche 03 that keys on a host reads this string.
 */
describe('the country hosting a point', () => {
  const RIYADH: LonLat = [46.72, 24.63];
  const HIGH_SEA: LonLat = [-30, 40]; // mid-Atlantic, no ring within a thousand kilometres
  const PARIS: LonLat = [2.35, 48.86];

  it('names a country nobody plays', () => {
    expect(hostAtPoint(RIYADH)).toBe('SAU');
  });

  it('answers the empty string on the open sea, and there only', () => {
    expect(hostAtPoint(HIGH_SEA)).toBe('');
  });

  it('answers a home country the same code every other reader uses', () => {
    expect(hostAtPoint(PARIS)).toBe('FRA');
    expect(hostAtPoint(PARIS)).toBe(regionFacts('FRA-5333')!.country);
    expect(hostAtPoint(PARIS)).toBe(homeCountryOf('france'));
  });

  /**
   * The intention, graven: Arabia and Romania are two hosts. The decreasing yield per host, the
   * finite trade capacity and the expulsion of fiche 03 are all keyed on this — none of them can
   * be written while every neutral answers the same string.
   */
  it('tells two neutral countries apart', () => {
    const PRAHOVA: LonLat = [25.2, 44.6];
    expect(hostAtPoint(PRAHOVA)).toBe('ROU');
    expect(hostAtPoint(PRAHOVA)).not.toBe(hostAtPoint(RIYADH));
  });
});

/**
 * **A host is read off containment, and the border is where it is tested.** Six points, three
 * pairs straddling one: proximity to a region's pole of inaccessibility got three of the six
 * wrong — Aix-la-Chapelle answered Liège, Saint-Louis answered Basel, Kehl answered the
 * Bas-Rhin — and a rule keyed on a host cannot be written on an answer that flips a border.
 *
 * They stay as the method rather than as a curiosity: whatever replaces this reading is judged
 * on a border, never on a capital.
 */
describe('a point on a border', () => {
  const CASES: ReadonlyArray<readonly [string, string, LonLat]> = [
    ['Saint-Louis', 'FRA', [7.56, 47.59]],
    ['Bâle', 'CHE', [7.588, 47.559]],
    ['Strasbourg', 'FRA', [7.75, 48.583]],
    ['Genève', 'CHE', [6.143, 46.204]],
  ];

  it.each(CASES)('places %s in %s', (_name, adm0, point) => {
    expect(hostAtPoint(point)).toBe(adm0);
  });

  /**
   * **Ce que la maille a coûté, en toutes lettres** (ADR 0023). Deux des six points d'origine
   * tiennent à moins d'une demi-cellule de leur frontière — Aix-la-Chapelle est à cinq
   * kilomètres de la Belgique, Kehl à un kilomètre du Rhin — et une cellule fait vingt-cinq
   * kilomètres à l'équateur. Leur centre de cellule est chez le voisin, donc ils y sont.
   *
   * C'est écrit plutôt que retiré : le jour où la maille se resserre, ces deux lignes tombent et
   * disent ce qui a été regagné. Une règle d'hôte ne se juge pas au kilomètre, elle se juge à la
   * cellule, et c'est le modèle.
   */
  const BELOW_THE_MESH: ReadonlyArray<readonly [string, string, LonLat]> = [
    ['Aix-la-Chapelle', 'BEL', [6.083, 50.776]],
    ['Kehl', 'FRA', [7.81, 48.573]],
  ];

  it.each(BELOW_THE_MESH)(
    'donne %s à son voisin %s, faute d’une cellule à lui',
    (_, adm0, point) => {
      expect(hostAtPoint(point)).toBe(adm0);
    },
  );
});

/**
 * **Un navire part de l'eau** (ADR 0013, révision du 04/09). Hokkaidō is the case that opened the
 * yard: its pole of inaccessibility stands sixty kilometres inland, so a port read at the
 * centroid puts a cargo on the road before it ever floats.
 *
 * The two readings go through the one function every rule uses (`pointOfBuilding`) — a port with
 * a point and a port without — and the routing is the same grid the movement is billed on.
 */
describe('a port on the coast', () => {
  const HOKKAIDO = 'JPN-1847';
  const HOKKAIDO_SHORE: LonLat = [141.82, 43.53];
  /** **De l'eau, et pas seulement un nom d'eau.** [129, 42] portait ce nom et tombait en
   *  Mandchourie : le mode combiné y arrivait à pied, ce qu'une colonne embarquée ne fait plus
   *  (décision 72a). Le large, lui, se rejoint par la mer et par elle seule. */
  const SEA_OF_JAPAN: LonLat = [137, 41];

  it('stands on a cell a ship can sail from', () => {
    expect(coastAtPoint(HOKKAIDO_SHORE)).toBe(true);
    expect(coastAtPoint(regionFacts(HOKKAIDO)!.point)).toBe(false);
  });

  it('sends its column to sea with no land leg, where the centroid walked first', () => {
    const fromQuay = routeBetween(
      pointOfBuilding({
        regionId: HOKKAIDO,
        point: { lon: HOKKAIDO_SHORE[0], lat: HOKKAIDO_SHORE[1] },
      })!,
      SEA_OF_JAPAN,
      'combined',
    );
    const fromCentroid = routeBetween(
      pointOfBuilding({ regionId: HOKKAIDO })!,
      SEA_OF_JAPAN,
      'combined',
    );
    expect(fromQuay!.legs[0]!.medium).toBe('sea');
    expect(fromCentroid!.legs[0]!.medium).toBe('land');
  });

  /** A port from before the field reads where it always read: nothing is backfilled. */
  it('falls back on its region when it carries no point of its own', () => {
    expect(pointOfBuilding({ regionId: HOKKAIDO })).toEqual(regionFacts(HOKKAIDO)!.point);
  });
});

/**
 * **Une destination plus petite qu'une cellule reste une destination** (ADR 0023). Neuf cent
 * soixante-et-onze régions n'ont aucune cellule à elles — **Paris en est**, où siège un quartier
 * général — et la seule chose qui aille vers un identifiant de région plutôt que vers un point
 * est le retour chargé d'un pillage (`movement/cargoReturn.ts`). Une nation dont la seule région
 * tenue est l'une de celles-là ne rendait aucune route, et la charge tombait en caisse pour une
 * raison qui n'est pas une règle du jeu.
 */
describe('une route vers des régions', () => {
  const ORLEANS: LonLat = [1.9, 47.9];
  const facts = (id: string) => ({ id, point: regionFacts(id)!.point });

  it('atteint Paris, qu’aucune cellule ne porte', () => {
    const planned = routeToRegions(ORLEANS, [facts('FRA-5333')], 'land');

    expect(planned).not.toBeNull();
    expect(planned!.regionId).toBe('FRA-5333');
  });

  /** Malte tient tout entière dans une cellule, et ses quarante-cinq régions s'y ancrent. Sa
   *  cellule est de l'eau pour la grille de routage, donc on y va par le ciel — ce que
   *  `routeToRegions` refusait tout net avant l'ancrage. */
  it('atteint une région maltaise, ancrée avec quarante-quatre autres', () => {
    const planned = routeToRegions(ORLEANS, [facts('MLT-5950')], 'air');

    expect(planned).not.toBeNull();
    expect(planned!.regionId).toBe('MLT-5950');
  });

  /**
   * **Un ancrage s'ajoute, il n'écrase pas.** Westminster n'a qu'une cellule, et GBR-2079 s'y
   * ancre : au départage par identifiant, le plus petit gagnait et la capitale du Royaume-Uni
   * cessait d'être une destination. Cinquante-huit régions étaient dans ce cas.
   */
  it('garde le but d’une région d’une seule cellule quand une voisine s’y ancre', () => {
    const goals = goalCellsForRegions([facts('GBR-2079'), facts('GBR-2080')]);
    const shared = [...goals.values()].find((cell) =>
      cell.some((goal) => goal.regionId === 'GBR-2080'),
    );

    expect(shared?.map((goal) => goal.regionId)).toEqual(['GBR-2080', 'GBR-2079']);
  });
});
