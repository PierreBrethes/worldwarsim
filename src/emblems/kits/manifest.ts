import manche from './manche.glb';
import mole from './mole.glb';
import piste from './piste.glb';

/**
 * **The terrain kits the engine lays beside a site** (ADR 0038 §10): the runway beside an
 * airfield (#269), the mole off a port's quay (#270), the windsock on the airfield's yard. They
 * are not the site's: its file never carries them, the engine lays them once at placement.
 */
export const KITS = { piste, mole, manche } as const;

/** A module of the runway and its length along it, in metres; `-1` laid the other way. */
type Module = readonly [
  name: 'piste_bout' | 'piste_seuil' | 'piste_troncon',
  metres: number,
  way: 1 | -1,
];

/**
 * **The airfield and its runway, in `airfield.glb`'s metres** (storyboard B+ du 03/11, « Oui,
 * toutes »): origin between the two hangars at the socle's foot, +z toward the runway, `+x` the
 * left hangar (`_b`). The runway lies off the socle, square to its front, along x; its free end
 * is at `x1 - length`, where a plane takes off and lands.
 */
export const AIRFIELD = {
  /** The hangars' axes, right (`A`) then left (`B`, `_b`), and their lanes' half width. */
  lanes: [-30, 30],
  lane: 16,
  /** The façades' front, the hangars' rail. */
  facade: 23.4,
  /** The socle's front edge, its top 2.2 m up. */
  edge: 58.4,
  top: 2.2,
  /** The runway: its axis, its end by the hangars and its length, 30 m wide. */
  runway: { z: 87.4, x1: 36, length: 170, half: 15 },
  modules: [
    ['piste_bout', 5, 1],
    ['piste_seuil', 10, 1],
    ...Array.from({ length: 14 }, (): Module => ['piste_troncon', 10, 1]),
    ['piste_seuil', 10, -1],
    ['piste_bout', 5, -1],
  ] as ReadonlyArray<Module>,
  /**
   * **`piste_rampe`, a stand-in** until `piste.glb` has it (Décisions du 03/11 : « le socle descend
   * à la piste par une rampe béton de 12 m »): a wedge of concrete as wide as a lane, its top from
   * `top` metres up at `from` down to the ground at `to`, before each lane. Drawn by the engine.
   */
  ramp: { from: 56.4, to: 68.4 },
  /** The windsock (`manche.glb`), on its free disc of the yard, and its turn. */
  windsock: { x: -54, z: 49.4, turn: -0.6 },
} as const;

/**
 * **The port's mole, in `port.glb`'s metres** (storyboard B+ du 03/11): it runs from the quay
 * (`z = 105`) along the socle's `+x` edge, its inner face on the basin at `x = 69`, 160 m of
 * `mole_troncon` (10 m each) and the head's `Ø 24`. A bollard every third module, a fender every
 * second, a lamp every fourth.
 */
export const MOLE = {
  x: 79,
  inner: 69,
  quay: 105,
  length: 160,
  module: 10,
  head: 12,
  /**
   * **The mole raised to the quay, a stand-in** until `mole.glb` has it (Décisions du 03/11 :
   * « le dessus du môle au niveau du quai, à 2,2 m (le kit le met à 0,5 m) »): the kit lifted this
   * much, and a skirt of its stone under it, from `skirt` up to the kit's foot.
   */
  lift: 1.7,
  skirt: -1,
} as const;

/** **The port's crane, in `port.glb`'s metres** (node `grue`): its foot, 15 m inside the quay on
 *  the socle's `+x` edge, the side the mole runs on (#476). */
export const CRANE = { x: 70, z: 90 } as const;

/**
 * **Position lights, a stand-in** until the models have them (`feu_gauche`, `feu_droit`,
 * `feu_queue` of the planes, `feu_babord`, `feu_tribord`, `feu_mat` of the hulls, storyboard du
 * 03/11): globes of `feux` laid by the engine at the model's box — red on its `+x`, green on its
 * `-x`, white at the tail or the mast. In metres.
 */
export const POSITION_LIGHTS = {
  air: { globe: 0.2 },
  sea: { globe: 0.3 },
  red: '#ff4a3a',
  green: '#5cff7a',
  white: '#fff6dc',
} as const;
