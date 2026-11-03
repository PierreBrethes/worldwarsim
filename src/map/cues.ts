import type { LonLat } from '@/domain/geo';
import { loadsAt, loadTotal, type SupplyLoad } from '@/domain/logistics';
import { DOMAIN_BY_ROLE } from '@/domain/troops';
import { cameFrom } from '@/domain/pile-facing';
import type { StandingPile } from './engine';
import { MAX_CRATES } from './engine/timelines/loading';

/** **Une sortie de caserne** : où, dans quelle pile, et les groupes de la pile qui en sortent. */
export type Sortie = {
  readonly siteId: string;
  readonly pileId: string;
  /** Les groupes (`pieces.groups`) dont toutes les troupes sont neuves : ce qui marche de la
   *  porte au rang. Une recrue fondue dans un groupe connu (une escouade dessinée par rôle) n'en
   *  donne pas : la pile se pose comme elle est. */
  readonly groups: ReadonlyArray<number>;
};

/**
 * **Les casernes dont sort une recrue** : chaque pile de caserne (`beside`) qui porte une troupe
 * que `known` ne connaissait pas. Une troupe connue qui rentre d'une marche n'est pas une recrue ;
 * en Blitz la recrue se pose sur un point, sans pile `beside`, et ne donne rien.
 */
export function sortiesOf(
  known: ReadonlySet<string>,
  piles: ReadonlyArray<StandingPile>,
): ReadonlyArray<Sortie> {
  return piles.flatMap(({ id, at, pieces }) =>
    'beside' in at &&
    at.beside.startsWith('building-barracks') &&
    pieces.troopIds.some((troop) => !known.has(troop))
      ? [
          {
            siteId: at.beside,
            pileId: id,
            groups: pieces.groups.flatMap(({ troopIds }, k) =>
              troopIds.every((troop) => !known.has(troop)) ? [k] : [],
            ),
          },
        ]
      : [],
  );
}

type Seated = { readonly id: string; readonly carriedBy?: string | undefined };

/** Who is aboard whom in a view: rider id → carrier id. What `descentesOf` remembers between two views. */
export function aboardOf(troops: ReadonlyArray<Seated>): ReadonlyMap<string, string> {
  return new Map(troops.flatMap((troop) => (troop.carriedBy ? [[troop.id, troop.carriedBy]] : [])));
}

/**
 * **Les camions dont une troupe vient de descendre** : l'id (`${pile}/${groupe}`, celui que
 * `StandingLayer` prête aux séquences) du groupe de chaque camion dont un passager d'avant, encore
 * là, n'est plus à bord. Un embarquement, un passager qui reste ou qui a disparu ne donnent rien.
 */
export function descentesOf(
  aboard: ReadonlyMap<string, string>,
  troops: ReadonlyArray<Seated>,
  piles: ReadonlyArray<StandingPile>,
): ReadonlyArray<string> {
  const freed = new Set(
    troops.flatMap((troop) => {
      const carrier = aboard.get(troop.id);
      return carrier !== undefined && !troop.carriedBy ? [carrier] : [];
    }),
  );
  return piles.flatMap(({ id, pieces }) =>
    pieces.groups.flatMap((group, k) =>
      group.role === 'landTransport' && group.troopIds.some((troop) => freed.has(troop))
        ? [`${id}/${k}`]
        : [],
    ),
  );
}

type Laden = { readonly id: string; readonly load?: SupplyLoad | undefined };

/** What each troop carries in a view: what `chargementsOf` remembers between two views. */
export function loadsOf(troops: ReadonlyArray<Laden>): ReadonlyMap<string, number> {
  return new Map(troops.map((troop) => [troop.id, loadTotal(troop.load)]));
}

/** **Une caisse par centaine chargée**, arrondie au-dessus, `MAX_CRATES` au plus (décision de
 *  Pierre du 03/11). `@a-mesurer` */
const LOAD_PER_CRATE = 100;

/** **Un camion chargé à son entrepôt ou à son QG** (#271) : le groupe qui l'est, et ses caisses. */
export type Chargement = {
  readonly siteId: string;
  readonly groupId: string;
  readonly crates: number;
};

/**
 * **Les camions dont la charge vient de monter à leur entrepôt ou à leur QG** (#271) : chaque
 * groupe de camion d'une garnison de l'un des deux dont une troupe d'avant porte plus. Ni première
 * vue, ni avant-poste, ni cargo, ni avion : la carte n'y a pas de quai.
 */
export function chargementsOf(
  before: ReadonlyMap<string, number>,
  troops: ReadonlyArray<Laden>,
  piles: ReadonlyArray<StandingPile>,
): ReadonlyArray<Chargement> {
  const rose = new Map(
    troops.flatMap((troop) => {
      const was = before.get(troop.id);
      const by = loadTotal(troop.load) - (was ?? 0);
      return was !== undefined && by > 0 ? [[troop.id, by] as const] : [];
    }),
  );
  // A site is `building-<key>@<point>`.
  const quays = loadsAt('landTransport') as ReadonlyArray<string>;
  return piles.flatMap(({ id, at, pieces }) =>
    'beside' in at && quays.includes(/^building-([^@]+)@/.exec(at.beside)?.[1] ?? '')
      ? pieces.groups.flatMap(({ role, troopIds }, k) => {
          const by = troopIds.reduce((sum, troop) => sum + (rose.get(troop) ?? 0), 0);
          return role === 'landTransport' && by > 0
            ? [
                {
                  siteId: at.beside,
                  groupId: `${id}/${k}`,
                  crates: Math.min(MAX_CRATES, Math.ceil(by / LOAD_PER_CRATE)),
                },
              ]
            : [];
        })
      : [],
  );
}

/**
 * **A newcomer stands at the end of the pieces of its role** (décision de Pierre du 28/10): the
 * piles keep their order by role, and within a role the pieces that stood there before keep their
 * places — a recruit out of its barracks, a troop entering its garrison, take the last one. The
 * view serves troops by birth, so an older troop entering would otherwise walk into the middle.
 * `before` is what this returned last; a pile seen for the first time stands as served.
 */
export function rankKept(
  before: ReadonlyArray<StandingPile> | null,
  piles: ReadonlyArray<StandingPile>,
): ReadonlyArray<StandingPile> {
  if (before === null) return piles;
  const was = new Map(
    before.map(({ id, pieces }) => [id, pieces.groups.map(({ troopIds }) => troopIds[0])]),
  );
  return piles.map((pile) => {
    const order = was.get(pile.id);
    if (order === undefined) return pile;
    const rankOf = (troopId: string | undefined) => {
      const k = order.indexOf(troopId);
      return k < 0 ? Infinity : k;
    };
    const groups: Array<StandingPile['pieces']['groups'][number]> = [];
    for (const group of pile.pieces.groups) {
      // Runs of one role: a stable sort within each.
      const run = groups.length > 0 && groups.at(-1)!.role === group.role;
      if (!run) groups.push(group);
      else {
        let k = groups.length;
        while (
          k > 0 &&
          groups[k - 1]!.role === group.role &&
          rankOf(groups[k - 1]!.troopIds[0]) > rankOf(group.troopIds[0])
        )
          k -= 1;
        groups.splice(k, 0, group);
      }
    }
    return groups.every((group, k) => group === pile.pieces.groups[k])
      ? pile
      : { ...pile, pieces: { ...pile.pieces, groups } };
  });
}

/** **Une colonne entrée en garnison**, ou posée sur un point (#362, sans `siteId`) : où, dans
 *  quelle pile, quels groupes, d'où elle arrive. */
export type Entree = Omit<Sortie, 'siteId'> & {
  readonly siteId?: string;
  /** The end of its route: where its pawn stood when the movement closed. */
  readonly at: LonLat;
  /** The point before it on the route: the way it came. */
  readonly toward?: LonLat;
};

type Column = {
  readonly state: string;
  readonly troopIds?: ReadonlyArray<string>;
  readonly route?: { readonly points: ReadonlyArray<LonLat> };
};

/**
 * **Les colonnes entrées en garnison** (décision de Pierre du 28/10) : chaque garnison
 * (`beside`) dont un groupe terrestre ne porte que des troupes qu'une de mes colonnes d'avant
 * portait. La pièce marche de la fin de sa route à sa place au rang, sans porte ni fondu. Une
 * garnison de quai n'en donne pas : une coque n'y marche pas à travers la terre. Une pile posée
 * sur un point (pas un avant-poste) en donne une sans bâtiment : la colonne s'y déploie (#362).
 */
export function entreesOf(
  before: ReadonlyArray<Column>,
  piles: ReadonlyArray<StandingPile>,
): ReadonlyArray<Entree> {
  return before.flatMap((column) => {
    const points = column.route?.points ?? [];
    const at = points.at(-1);
    if (column.state !== 'mine' || at === undefined) return [];
    const carried = new Set(column.troopIds);
    return piles.flatMap(({ id, at: where, pieces, label }) => {
      // An outpost's garrison hangs from its label: no building, no front to deploy to (#299).
      if ('beside' in where ? where.quay !== undefined : label !== undefined) return [];
      const groups = pieces.groups.flatMap(({ role, troopIds }, k) =>
        // A figurine that also carries troops already there (a squad drawn by role) stands; a
        // plane lands by its airfield's own storyboard (#269), not on foot.
        DOMAIN_BY_ROLE[role] === 'land' && troopIds.every((troop) => carried.has(troop)) ? [k] : [],
      );
      const toward = cameFrom(points);
      return groups.length === 0
        ? []
        : [
            {
              ...('beside' in where ? { siteId: where.beside } : {}),
              pileId: id,
              groups,
              at,
              ...(toward ? { toward } : {}),
            },
          ];
    });
  });
}
