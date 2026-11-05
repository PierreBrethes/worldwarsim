import { EMPTY_TALLY, finalEditionOf, type FinalEditionInput } from '@/domain/final-edition';
import type { FinalEdition } from './words';

const HOUR = 3_600_000;
const LAUNCHED = Date.UTC(2026, 9, 24, 17);
/** Une Mondiale de dix jours conclue trois heures avant l'horloge. */
const CONCLUDED = LAUNCHED + 237 * HOUR;

const figures = (territory: number) => ({
  territory,
  general: territory * 100,
  industry: territory * 60,
  military: territory * 40,
  deeds: Math.round(territory),
});

const line = (
  nation: string,
  territory: number,
  over: Partial<FinalEditionInput['nations'][number]> = {},
) => ({
  nation,
  nickname: `${nation}_joueur`,
  final: figures(territory),
  series: [
    { at: LAUNCHED + 3 * HOUR, ...figures(3) },
    { at: CONCLUDED, ...figures(territory) },
  ],
  exit: null,
  hqLost: null,
  outpostsCaptured: 0,
  outpostsLost: 0,
  dispatches: 4,
  pointHeldMs: 0,
  ...over,
});

/**
 * **Une archive comme le serveur la sert** : le calcul de `finalEditionOf`, et ce que
 * `convex/finalEdition.ts` y ajoute (code, heures, carte, `mine`).
 */
export function editionFixture(
  over: {
    verdict?: FinalEditionInput['verdict'];
    mine?: string;
    durationHours?: number | null;
  } = {},
): FinalEdition {
  const verdict = over.verdict ?? { reason: 'points', winnerNation: 'france' };
  const built = finalEditionOf({
    concludedAt: CONCLUDED,
    verdict,
    nations: [
      line('germany', 11.8, { dispatches: 41 }),
      line('france', 9.4, { pointHeldMs: 30 * HOUR, outpostsCaptured: 2 }),
      line('italy', 1.3, {
        exit: { kind: 'eliminated', at: LAUNCHED + 116 * HOUR },
        hqLost: { at: LAUNCHED + 116 * HOUR, regionId: 'ITA-1', by: 'france' },
      }),
    ],
    points: [
      {
        key: 'tangier',
        regionId: 'MAR-1',
        hands: [
          { at: LAUNCHED + 40 * HOUR, nation: 'germany' },
          { at: LAUNCHED + 60 * HOUR, nation: null },
          { at: LAUNCHED + 80 * HOUR, nation: 'france' },
        ],
        heldMs: [
          { nation: 'germany', ms: 20 * HOUR },
          { nation: 'france', ms: 157 * HOUR },
        ],
      },
    ],
    tally: EMPTY_TALLY,
  });
  const mine = over.mine ?? 'france';
  return {
    _id: 'edition-1',
    _creationTime: CONCLUDED,
    seasonId: 'season-1',
    code: 'K7Q2PX',
    launchedAt: LAUNCHED,
    concludedAt: CONCLUDED,
    durationHours: over.durationHours === undefined ? 240 : over.durationHours,
    playableRegion: 'europe',
    regions: [{ regionId: 'FRA-1', nation: 'france' }],
    ...built,
    verdict: { ...verdict, winnerNation: verdict.winnerNation },
    nations: built.nations.map((page) => ({ ...page, mine: page.nation === mine })),
  } as unknown as FinalEdition;
}
