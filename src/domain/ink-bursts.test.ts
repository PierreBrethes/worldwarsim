import { describe, expect, it } from 'vitest';
import { STAMP_MS, inkBursts, stampAt } from './ink-bursts';
import type { CombatReport, JournalDispatch } from './player-view';

const combat = { id: 'c1', point: { lon: 2, lat: 49 }, won: false } as CombatReport;
const hour = (at: number) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dispatch = (
  at: number,
  kind: JournalDispatch['kind'],
  report: CombatReport | null = null,
): JournalDispatch => ({
  at,
  place: null,
  t: '',
  severity: 'notable',
  kind,
  text: '',
  unread: true,
  remaining: null,
  resolutionAt: null,
  combat: report,
});

describe('inkBursts', () => {
  it('stamps « capturé » where a site changed hands, on both sides', () => {
    const at = (kind: JournalDispatch['kind']) => ({
      ...dispatch(20, kind),
      place: { lon: 30, lat: 57 },
    });
    expect(inkBursts([at('captured'), at('siteLost')], 10, [])).toEqual([
      { kind: 'captured', at: [30, 57], words: { word: 'capturé', hour: hour(20) } },
      { kind: 'captured', at: [30, 57], words: { word: 'capturé', hour: hour(20) } },
    ]);
  });

  /** **Le cachet des Sept** (#442) : rond, à l'encre du preneur, ses pastilles, « IV » au
   *  quatrième seul ; il attend que le drapeau ait changé, et remplace le « capturé » de la prise. */
  describe('a point that changes hands', () => {
    const narvik = { lon: 17.43, lat: 68.44 };
    const taken = (held: number): JournalDispatch => ({
      ...dispatch(20, 'pointTaken'),
      place: narvik,
      point: { key: 'narvik', nation: 'germany', held },
    });
    const seal = (held: number, roman?: string) => ({
      kind: 'seal',
      at: [17.43, 68.44],
      words: { word: 'Narvik', hour: hour(20) },
      ink: '#2b6974',
      held,
      ...(roman === undefined ? {} : { roman }),
      holdMs: 3400,
      delayMs: 1600,
    });

    it('presses the seal of the Seven, « IV » on the fourth alone', () => {
      expect(inkBursts([taken(3)], 10, [])).toEqual([seal(3)]);
      expect(inkBursts([taken(4)], 10, [])).toEqual([seal(4, 'IV')]);
      expect(inkBursts([taken(5)], 10, [])).toEqual([seal(5)]);
    });

    it('in place of the « capturé » of its taker and its loser', () => {
      const twin = (kind: JournalDispatch['kind']) => ({ ...dispatch(20, kind), place: narvik });
      expect(inkBursts([taken(3), twin('captured'), twin('siteLost')], 10, [])).toEqual([seal(3)]);
    });

    /** **Compte rompu** (#442) : le compte tombé en cours de partie, à l'instant où un autre
     *  reprend un point — le tampon noir sur ce point, au lieu de son cachet. */
    it('stamps « compte rompu » in black on the point that broke the leader’s count', () => {
      const retaken = { ...taken(2), point: { key: 'narvik' as const, nation: 'france', held: 2 } };
      const lead = { leaderNation: 'germany', keys: ['narvik', 'baku'] as const };
      expect(inkBursts([retaken], 10, [], false, () => true, lead)).toEqual([
        {
          kind: 'raceBroken',
          at: [17.43, 68.44],
          words: { word: 'compte rompu', hour: hour(20) },
          ink: '#2a2118',
          delayMs: 1600,
        },
      ]);
      // The leader taking a point himself breaks nothing.
      expect(inkBursts([taken(3)], 10, [], false, () => true, lead)).toEqual([seal(3)]);
      // Nor a point taken elsewhere as the count fell: only one of the leader's masts broke it.
      const elsewhere = { leaderNation: 'germany', keys: ['baku'] as const };
      expect(inkBursts([retaken], 10, [], false, () => true, elsewhere)[0]?.kind).toBe('seal');
    });

    it('but not in place of a capture of another hour', () => {
      const other = { ...dispatch(19, 'captured'), place: narvik };
      expect(inkBursts([taken(3), other], 10, [])).toHaveLength(2);
    });

    it('nor in place of a capture of the same hour, more than half a degree away', () => {
      const other = { ...dispatch(20, 'captured'), place: { lon: 18.2, lat: 68.44 } };
      expect(inkBursts([taken(3), other], 10, [])).toHaveLength(2);
    });
  });

  /** **Un QG pris** (#442) : « QG pris » chez le preneur au lieu de « capturé », « QG tombé » en
   *  noir chez qui l'avait relevé ; l'éliminé a sa scène, et rien ici. */
  describe('a headquarters that falls', () => {
    const rome = { lon: 12.5, lat: 41.9 };
    const fall = { ...dispatch(20, 'elimination'), place: rome };
    const twin = (kind: JournalDispatch['kind']) => ({ ...dispatch(20, kind), place: rome });

    it('stamps « QG pris » for its taker, once', () => {
      expect(inkBursts([fall, twin('captured')], 10, [])).toEqual([
        { kind: 'captured', at: [12.5, 41.9], words: { word: 'QG pris', hour: hour(20) } },
      ]);
    });

    it('stamps « QG tombé » in black for a third side who knew it', () => {
      expect(inkBursts([fall], 10, [])).toEqual([
        {
          kind: 'captured',
          at: [12.5, 41.9],
          words: { word: 'QG tombé', hour: hour(20) },
          ink: '#2a2118',
        },
      ]);
    });

    it('stamps nothing for the fallen, whose scene it is', () => {
      expect(inkBursts([fall, twin('siteLost')], 10, [])).toEqual([]);
    });

    it('stamps nothing where nobody knows it', () => {
      expect(inkBursts([dispatch(20, 'elimination')], 10, [])).toEqual([]);
    });
  });

  it('stamps « largué » where a packet came down, and nothing for a delivery', () => {
    const at = (kind: JournalDispatch['kind']) => ({
      ...dispatch(20, kind),
      place: { lon: 9, lat: 52 },
    });
    expect(inkBursts([at('airdrop'), at('supply')], 10, [])).toEqual([
      { kind: 'airdropped', at: [9, 52], words: { word: 'largué', hour: hour(20) } },
    ]);
  });

  it('stamps a combat at its pass, once it is newer than what the map has seen', () => {
    const journal = [dispatch(20, 'assault', combat), dispatch(5, 'attacked', combat)];
    expect(inkBursts(journal, 10, [])).toEqual([
      { kind: 'combat', at: [2, 49], words: { word: 'engagé', hour: hour(20) } },
    ]);
  });

  it('stamps « bombardé » on both sides, and draws the shot from my battery alone', () => {
    const fired = {
      ...combat,
      cause: 'bombardment',
      firedFrom: { lon: 1, lat: 48 },
    } as CombatReport;
    const taken = { ...combat, cause: 'bombardment' } as CombatReport;
    expect(inkBursts([dispatch(20, 'assault', fired)], 10, [])).toEqual([
      { kind: 'combat', at: [2, 49], from: [1, 48], words: { word: 'bombardé', hour: hour(20) } },
    ]);
    expect(inkBursts([dispatch(20, 'attacked', taken)], 10, [])).toEqual([
      { kind: 'combat', at: [2, 49], words: { word: 'bombardé', hour: hour(20) } },
    ]);
  });

  it('holds the shot for the map to say whether its arc drew it, where it plays combats (#325)', () => {
    const fired = {
      ...combat,
      cause: 'bombardment',
      firedFrom: { lon: 1, lat: 48 },
    } as CombatReport;
    expect(inkBursts([dispatch(20, 'assault', fired)], 10, [], true)).toEqual([
      {
        kind: 'combat',
        at: [2, 49],
        from: [1, 48],
        combatId: combat.id,
        words: { word: 'bombardé', hour: hour(20) },
      },
    ]);
  });

  it('stamps « terrain tenu » after « engagé » when the ground was held', () => {
    const won = { ...combat, won: true };
    expect(inkBursts([dispatch(20, 'assault', won)], 10, [])).toEqual([
      { kind: 'combat', at: [2, 49], words: { word: 'engagé', hour: hour(20) } },
      {
        kind: 'held',
        at: [2, 49],
        words: { word: 'terrain tenu', hour: hour(20) },
        delayMs: STAMP_MS,
      },
    ]);
  });

  it('stamps « eaux tenues » for a combat won at sea (#324)', () => {
    const won = { ...combat, won: true };
    const [, held] = inkBursts([dispatch(20, 'assault', won)], 10, [], false, () => false);
    expect(held).toMatchObject({ kind: 'held', words: { word: 'eaux tenues' } });
  });

  it('names the combat on « terrain tenu » when the map may play it, an arrival only (#327)', () => {
    const arrival = { ...combat, won: true, cause: 'arrival' } as CombatReport;
    const [, held] = inkBursts([dispatch(20, 'assault', arrival)], 10, [], true);
    expect(held).toMatchObject({ kind: 'held', combatId: 'c1' });
    const sea = { ...arrival, cause: 'interception' } as CombatReport;
    const [, other] = inkBursts([dispatch(20, 'assault', sea)], 10, [], true);
    expect(other).not.toHaveProperty('combatId');
  });

  it('stamps an arrival at the end of the thread that vanished', () => {
    expect(inkBursts([dispatch(20, 'column')], 10, [[10, 40]])).toEqual([
      { kind: 'arrival', at: [10, 40], words: { word: 'arrivé', hour: hour(20) } },
    ]);
  });

  it('stamps no arrival when the vanished threads outnumber the dispatches', () => {
    // An attack resolved alongside a march: its thread vanishes too, without a column dispatch,
    // and counting alone would put the march's stamp on the attack's target.
    const vanished: ReadonlyArray<[number, number]> = [
      [10, 40],
      [11, 41],
    ];
    expect(inkBursts([dispatch(20, 'column')], 10, vanished)).toEqual([]);
    expect(inkBursts([dispatch(20, 'column'), dispatch(21, 'column')], 10, vanished)).toEqual([
      { kind: 'arrival', at: [10, 40], words: { word: 'arrivé', hour: hour(21) } },
      { kind: 'arrival', at: [11, 41], words: { word: 'arrivé', hour: hour(21) } },
    ]);
  });

  it('says nothing for a thread that vanished without a dispatch, or a dispatch without place', () => {
    expect(inkBursts([], 0, [[10, 40]])).toEqual([]);
    expect(inkBursts([dispatch(20, 'column')], 0, [])).toEqual([]);
    expect(inkBursts([dispatch(20, 'sighting')], 0, [[10, 40]])).toEqual([]);
  });
});

describe('stampAt', () => {
  it('presses from 1.7 to 1 in 0.14 s, as the prototype does', () => {
    expect(stampAt(0, 'full')).toEqual({ scale: 1.7, opacity: 0 });
    expect(stampAt(70, 'full')!.scale).toBeCloseTo(1.35);
    expect(stampAt(140, 'full')).toEqual({ scale: 1, opacity: 0.88 });
  });

  it('holds three seconds, then lifts, then is gone', () => {
    expect(stampAt(2999, 'full')!.opacity).toBe(0.88);
    expect(stampAt(3200, 'full')!.opacity).toBeCloseTo(0.58);
    expect(stampAt(STAMP_MS, 'full')).toBeNull();
    expect(STAMP_MS).toBeCloseTo(3587, 0);
  });

  it('holds as long as it is asked, as the absence tour asks 2.2 s (#439)', () => {
    expect(stampAt(2199, 'full', 2200)!.opacity).toBe(0.88);
    expect(stampAt(2400, 'full', 2200)!.opacity).toBeCloseTo(0.58);
    expect(stampAt(3000, 'full', 2200)).toBeNull();
  });

  it('lifts in a quarter of a second once a gesture takes it up (#439)', () => {
    expect(stampAt(1125, 'full', 3000, 1000)!.opacity).toBeCloseTo(0.44);
    expect(stampAt(1250, 'full', 3000, 1000)).toBeNull();
    // Lifted before it was pressed, it never shows.
    expect(stampAt(300, 'full', 3000, -500)).toBeNull();
  });

  it('lays flat at once when motion is reduced, and waits unseen while delayed', () => {
    expect(stampAt(0, 'reduced')).toEqual({ scale: 1, opacity: 0.88 });
    expect(stampAt(-10, 'full')).toEqual({ scale: 1, opacity: 0 });
  });
});
