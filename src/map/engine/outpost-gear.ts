import { Matrix4 } from 'three';
import { ease, span } from './timelines/curves';
import { SOCLE_TOP } from './works';

/**
 * **What an outpost wears of its trade** (#468, `outpost.glb`): one accessory group per chosen
 * specialty, at the same place behind the mast, and none for the generalist. The lookout's
 * antenna is three sections, the upper two baked apart to slide into the one below.
 */
const GEAR_GROUPS = ['magasin', 'guet', 'fort'] as const;
export const TELESCOPE = ['antenne_2', 'antenne_3'] as const;
export const GEAR_PARTS: ReadonlyArray<string> = [...GEAR_GROUPS, ...TELESCOPE];
const isTelescope = (part: string): boolean => (TELESCOPE as ReadonlyArray<string>).includes(part);

/** The group a baked part belongs to: a section is the lookout's. */
export const gearOf = (part: string): string => (isTelescope(part) ? 'guet' : part);

/** **The gear going off, the gear going on**, from `start` (`Date.now()`) over `ms`. */
export type GearMotion = {
  readonly from: string | null;
  readonly to: string | null;
  readonly start: number;
  readonly ms: number;
};

/** **How long a trade's gear takes to go on, or off.** `@a-mesurer` */
export const GEAR_MS = 1800;

/**
 * **How much of `group` stands at `now`**, 0 gone to 1 whole, for an outpost wearing `standing`:
 * the old gear comes off first, and the new goes on after — over the whole run when only one of
 * them moves.
 */
export function gearShare(
  group: string,
  standing: string | null,
  motion: GearMotion | undefined,
  now: number,
): number {
  if (motion === undefined) return group === standing ? 1 : 0;
  const t = span(now - motion.start, 0, motion.ms);
  const both = motion.from !== null && motion.to !== null;
  if (group === motion.from) return 1 - (both ? span(t, 0, 0.5) : t);
  if (group === motion.to) return both ? span(t, 0.5, 1) : t;
  return 0;
}

const grown = new Matrix4();
const slid = new Matrix4();

/**
 * **A part of the gear at `share`**, into `out`, in the file's metres: its group grows up from
 * the socle top; the lookout's grows over half its run, then draws its sections out of the one
 * below, `drop` metres. Nothing at 0.
 */
export function gearPose(out: Matrix4, part: string, share: number, drop: number): Matrix4 {
  if (share <= 0) return out.makeScale(0, 0, 0);
  const lookout = gearOf(part) === 'guet';
  const grow = ease.inOut(lookout ? span(share, 0, 0.5) : share);
  const slide = ease.inOut(lookout ? span(share, 0.5, 1) : 1);
  out
    .makeTranslation(0, SOCLE_TOP, 0)
    .multiply(grown.makeScale(1, Math.max(grow, 1e-3), 1))
    .multiply(
      slid.makeTranslation(0, -SOCLE_TOP - (isTelescope(part) ? (1 - slide) * drop : 0), 0),
    );
  return out;
}

/**
 * **The outposts whose gear changed between two views**, and that `played` says play it: in
 * the field, up close, at full motion. One that appears or goes stands as served.
 */
export function gearCues(
  before: ReadonlyArray<{ readonly id: string; readonly gear?: string | null }>,
  after: ReadonlyArray<{ readonly id: string; readonly gear?: string | null }>,
  played: (id: string) => boolean,
): Array<{ readonly id: string; readonly from: string | null; readonly to: string | null }> {
  const was = new Map(before.flatMap(({ id, gear }) => (gear === undefined ? [] : [[id, gear]])));
  return after.flatMap(({ id, gear }) => {
    const from = was.get(id);
    return gear === undefined || from === undefined || from === gear || !played(id)
      ? []
      : [{ id, from, to: gear }];
  });
}
