const PLANE_GEAR = ['gear_left', 'gear_right', 'wheel_left', 'wheel_right', 'tailwheel'] as const;

/**
 * **The nodes an articulated copy keeps apart, by model file** (ADR 0036 §2), named at their
 * pivot in the file. Only what a sequence moves: the rest is merged under them. A family joins
 * when the sequence that moves it does; `EXPECT` of `verifier-glb.mjs` stays the brief of the
 * files, wider than what the code reads. A name ending in `*` is a family of names, unrolled by
 * file (`hold_hatch_*` is 4 hatches, 5 in the American ship, 1 in the junk).
 */
export const RIG_PARTS = {
  barracks: ['porte_gauche', 'porte_droite', 'remise_porte_gauche', 'remise_porte_droite'],
  landTransport: ['body', 'tailgate', 'roue_left_*', 'roue_right_*'],
  fighter: PLANE_GEAR,
  bomber: PLANE_GEAR,
  airTransport: [...PLANE_GEAR, 'cabin_door', 'bay_door'],
  cargo: ['hold_hatch_*', 'mat_charge_*'],
} as const;

export type RigFamily = keyof typeof RIG_PARTS;
type Unrolled<P extends string> = P extends `${infer Head}*` ? `${Head}${string}` : P;
/** The names a pose may give for `F`: the compiler refuses `tailgate` for a barracks. */
export type RigPart<F extends RigFamily> = Unrolled<(typeof RIG_PARTS)[F][number]>;

/** Whether `name` is one of the nodes the articulated copy of `family` keeps. */
export function isRigPart(family: RigFamily, name: string): boolean {
  return (RIG_PARTS[family] as ReadonlyArray<string>).some((part) =>
    part.endsWith('*') ? name.startsWith(part.slice(0, -1)) : name === part,
  );
}
