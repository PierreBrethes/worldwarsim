import type { Nation } from './ids';
import { isNation } from './nations';
import type { SeasonMode } from './season-mode';

/**
 * **The one table of national assets** (ADR 0039 §1, §7): six nations each break one rule (ADR
 * 0047: the Mass Levy, China, and Ultra, the United Kingdom), the two others play without. The table says which; the wording lives in `fr.nationAssets`. The
 * asset is public and derived from the nation the view already serves — no field of its own.
 * Mondiale only: a Blitz keeps its nations equal.
 */
export const ASSETS = [
  'lendLease',
  'carrierDoctrine',
  'industrialEvacuation',
  'blitzkrieg',
  'massLevy',
  'ultra',
] as const;
export type Asset = (typeof ASSETS)[number];

export const ASSET_BY_NATION: Readonly<Record<Nation, Asset | null>> = {
  france: null,
  uk: 'ultra',
  usa: 'lendLease',
  ussr: 'industrialEvacuation',
  germany: 'blitzkrieg',
  japan: 'carrierDoctrine',
  italy: null,
  china: 'massLevy',
};

export function assetOf(nation: string | null, mode: SeasonMode): Asset | null {
  return mode === 'blitz' || !isNation(nation) ? null : ASSET_BY_NATION[nation];
}
