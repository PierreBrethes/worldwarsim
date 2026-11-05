import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../../convex/_generated/api';
import { outcomeOf } from '@/domain/ending';
import type { StrategicPointKey } from '@/domain/strategic-points';
import { fr } from '@/i18n/fr';
import type { EndMap } from './end-map';

export type FinalEdition = FunctionReturnType<typeof api.finalEdition.read>;
export type NationPage = FinalEdition['nations'][number];
type Feat = FinalEdition['moments'][number];

const said = fr.finalEdition;

/* ------------------------------ les règles de lecture ------------------------------ */

const verdictOf = (edition: FinalEdition) => ({
  reason: edition.verdict.reason,
  winnerNation: edition.verdict.winnerNation,
  perMinute: edition.verdict.perMinute ?? null,
});

/** Le tampon d'une nation : une clôture à la main ne tamponne que les sortis. */
export function stampOf(
  page: NationPage,
  edition: FinalEdition,
): { label: string; tone: 'ink' | 'critical' } | null {
  const outcome = outcomeOf(
    { nation: page.nation, defeated: page.exit !== null },
    verdictOf(edition),
  );
  if (outcome === 'closed') return null;
  if (outcome === 'out') return { label: said.outcome[page.exit!.kind], tone: 'critical' };
  return { label: said.outcome[outcome === 'loser' ? 'loser' : outcome], tone: 'ink' };
}

/** Ce que dit d'un fait la page, la région nommée par l'atlas. */
export function featWords(
  feat: Feat,
  edition: FinalEdition,
  map: EndMap,
): { title: string; text: string } {
  const place = map.regionName(feat.regionId);
  const [first = '', second = ''] = feat.nations;
  switch (feat.kind) {
    case 'contact':
      return said.moment.contact(first, second, place);
    case 'battle':
    case 'pass': {
      const { forces } = feat;
      const winner = forces.winner === 'attacker' ? first : second;
      const [destroyed, lost] =
        forces.winner === 'attacker'
          ? [forces.defenderLost, forces.attackerLost]
          : [forces.attackerLost, forces.defenderLost];
      return feat.kind === 'battle'
        ? said.moment.battle({ winner, engaged: forces.engaged, destroyed, lost, place })
        : said.finest.pass(place, destroyed, lost, feat.at);
    }
    case 'hqTaken':
      return feat.nations.length === 2
        ? said.moment.hqTaken(first, second, place)
        : said.moment.hqTaken(null, first, place);
    case 'race':
      return said.moment.race(first, feat.key);
    case 'pointTaken':
      return said.finest.pointTaken(feat.key, second === '' ? null : second, feat.at);
    case 'verdict':
      return said.moment.verdict(edition.verdict.reason, edition.verdict.winnerNation);
  }
}

/** Le plus beau coup d'une nation, dit comme le carnet le dit. */
export function finestWords(page: NationPage, edition: FinalEdition, map: EndMap) {
  const { finest } = page;
  if (finest === null) return null;
  if (finest.kind === 'hqTaken') return said.finest.hqTaken(finest.nations[1] ?? '', finest.at);
  return featWords(finest, edition, map);
}

export const pointsHeldBy = (edition: FinalEdition, nation: string | null): StrategicPointKey[] =>
  nation === null
    ? []
    : edition.points.filter((point) => point.hands.at(-1)?.nation === nation).map((p) => p.key);
