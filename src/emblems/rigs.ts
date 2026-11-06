const PLANE_GEAR = ['gear_left', 'gear_right', 'wheel_left', 'wheel_right', 'tailwheel'] as const;

/**
 * **The nodes an articulated copy keeps apart, by model file** (ADR 0036 §2), named at their
 * pivot in the file. Only what a sequence moves: the rest is merged under them. A family joins
 * when the sequence that moves it does; `EXPECT` of `verifier-glb.mjs` stays the brief of the
 * files, wider than what the code reads. A name ending in `*` is a family of names, unrolled by
 * file (`hold_hatch_*` is 4 hatches, 5 in the American ship, 1 in the junk).
 */
export const RIG_PARTS = {
  // The combat's guns (#331): the turret turns, the barrel — the tank's `gun`, with its mantlet —
  // draws back. Not `gun_hull`, the B1 bis' hull 75: it does not aim.
  armor: ['turret', 'gun'],
  // The gun's barrel draws back; its trails, open in battery (#325), stay open as it fires.
  artillery: ['barrel', 'trail_*'],
  // The escort's turrets and their guns, by pairs (#324).
  escort: ['turret_*', 'gun_*'],
  barracks: ['porte_gauche', 'porte_droite', 'remise_porte_gauche', 'remise_porte_droite'],
  landTransport: ['body', 'tailgate', 'roue_left_*', 'roue_right_*'],
  fighter: PLANE_GEAR,
  bomber: PLANE_GEAR,
  airTransport: [...PLANE_GEAR, 'cabin_door', 'bay_door'],
  cargo: ['hold_hatch_*', 'mat_charge_*'],
  // The lift of the flight deck, which takes the troops below (#503).
  carrier: ['ascenseur'],
  // The loops at rest (#273): what each site moves while it works. The iron and the coal mines
  // share their names; the shutter is baked open (`REST_POSES.observing`), not moved.
  oilWell: ['balancier', 'manivelle', 'bielle', 'bielle_2', 'tige'],
  mine: ['molette_1', 'molette_2', 'wagonnet', 'wagonnet_caisse'],
  researchCenter: ['coupole', 'lunette'],
  // The crane's loop, and the launch (#270): the hull on the slip, its cradles and its shores.
  port: ['grue_couronne', 'fleche', 'cable', 'crochet', 'coque_cale', 'ber_*', 'accore_*'],
  // The hangars' telescopic doors (#269), both pairs of both hangars (`_b`, the left one).
  airfield: ['porte_*'],
  // The loading (#271): the door slides on its rollers, the crates of the pile jump aboard. The
  // HQ swings its service door; its crates are the copy's own (`stockDark`).
  warehouse: ['porte', 'galet', 'galet_2', 'caisse_*'],
  hq: ['porte_service', 'caisse_*'],
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
