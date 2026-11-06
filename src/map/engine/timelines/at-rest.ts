import { ease, span } from './curves';

/**
 * **Les boucles des sites au repos** (#273, `WWS/prototypes/storyboard-repos/commun/sites.js`) :
 * fonctions pures et périodiques du temps, en secondes. `0` et la période rendent le repos. Ce
 * qu'elles lisent du modèle (pivots, repères) leur est donné en nombres, dans le repère du parent
 * de la pièce : elles suivent les fichiers régénérés (#368) sans en recopier les cotes.
 */

const DEG = Math.PI / 180;
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** A point in the plane a part turns in: (y, z) about x, (x, y) about z. */
export type Flat = readonly [number, number];
/** `p` turned by `angle` about `about`, in its plane. */
const turned = ([u, v]: Flat, angle: number, [cu, cv]: Flat = [0, 0]): Flat => {
  const [du, dv] = [u - cu, v - cv];
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return [cu + du * c - dv * s, cv + du * s + dv * c];
};

// ---------- le puits ----------

/** **Un coup de pompe en 3 s** (20 par minute) : lisible d'un coup d'œil. */
export const PUMP_S = 3;
/** Les butées du balancier, décidées le 02/11 : il monte de 16°, plonge de 19°. */
const BEAM = { up: 16 * DEG, down: 19 * DEG } as const;

/** The pump jack at rest, in the plane (y, z) of its root, about x. */
export type PumpRig = {
  readonly crank: Flat;
  readonly beam: Flat;
  /** The polished rod hangs this far from the beam's pivot, along it: its horse head. */
  readonly arm: number;
  /** Each connecting rod: its head on the beam, its foot on the crank's pin. */
  readonly rods: ReadonlyArray<{ readonly head: Flat; readonly pin: Flat }>;
};

/** **The crank leads everything**: it turns round, the beam, the rods and the polished rod
 *  follow at every step, as in the machine. Angles in radians about x, shifts in (y, z).
 *  Each rod keeps its length, its head on the beam, aimed at the pin: the decided stops (−19°,
 *  +16°) are not those of `oilWell.glb` as a linkage, so its foot misses the pin by up to 0,66 m
 *  over a stroke (measured on the file of 04/11). */
export function pumpAt(t: number, rig: PumpRig) {
  const crank = (-2 * Math.PI * (((t % PUMP_S) + PUMP_S) % PUMP_S)) / PUMP_S;
  const pin0 = rig.rods[0]?.pin ?? rig.crank;
  const radius = Math.hypot(pin0[0] - rig.crank[0], pin0[1] - rig.crank[1]);
  const up = rig.crank[0] + radius - pin0[0];
  const down = pin0[0] - (rig.crank[0] - radius);
  const dy = turned(pin0, crank, rig.crank)[0] - pin0[0];
  const beam =
    dy >= 0 ? (up > 0 ? (BEAM.up * dy) / up : 0) : down > 0 ? (BEAM.down * dy) / down : 0;
  const rods = rig.rods.map(({ head, pin }) => {
    const nowHead = turned(head, beam, rig.beam);
    const nowPin = turned(pin, crank, rig.crank);
    const rest = Math.atan2(pin[1] - head[1], pin[0] - head[0]);
    const now = Math.atan2(nowPin[1] - nowHead[1], nowPin[0] - nowHead[0]);
    return {
      shift: [nowHead[0] - head[0], nowHead[1] - head[1]] as Flat,
      turn: Math.atan2(Math.sin(now - rest), Math.cos(now - rest)),
    };
  });
  return { crank, beam, rods, rod: -rig.arm * Math.sin(beam) };
}

// ---------- les mines ----------

/** **Un cycle de 16 s calé sur la cordée** : elle monte en 6 s, le wagonnet vide, elle redescend. */
export const HEADFRAME_S = 16;
/** **La molette fait au plus 2,5 rad/s** : 18° par pas à 8 i/s, sous la moitié des 60° entre deux
 *  rayons — elle ne paraît jamais tourner à l'envers. */
const WHEEL_SPEED = 2.5;
const HAUL = 4.5;
/** La cordée : 1,5 s pour prendre sa vitesse, 3 s pleine, 1,5 s pour s'arrêter, de 0 à 1. */
const trip = (tau: number): number => {
  const v = 1 / HAUL;
  const a = v / 1.5;
  if (tau < 1.5) return 0.5 * a * tau * tau;
  if (tau < 4.5) return 0.5 * v * 1.5 + v * (tau - 1.5);
  if (tau < 6) return 1 - 0.5 * a * (6 - tau) ** 2;
  return 1;
};
/** La caisse bascule de 110° vers +z : le minerai tombe. */
const TIP = 110 * DEG;

/** **The headframe's wheels** (radians, `molette_2` the other way), **the tub** (a share of its
 *  run along +x) **and its bin** (radians about x, towards +z). */
export function headframeAt(t: number) {
  const s = ((t % HEADFRAME_S) + HEADFRAME_S) % HEADFRAME_S;
  const turns = WHEEL_SPEED * HAUL;
  return {
    wheel: s < 8 ? turns * trip(s) : turns * (1 - trip(s - 8)),
    cart: ease.drive(span(s, 6.5, 9.5)) - ease.drive(span(s, 11.7, 14.7)),
    bin: TIP * (ease.out3(span(s, 9.5, 10.3)) - ease.inOut(span(s, 10.9, 11.7))),
  };
}

// ---------- le centre de recherche ----------

/** **La coupole vise quatre fois par cycle de 56 s** : elle tourne en 5 s, tient 9 s. */
export const DOME_S = 56;
const AIMS = [0, 35, -20, 60, 0] as const;
/** The lens over its rest « en observation » (35°), by aim. */
const RAISES = [0, 10, -10, 15, 0] as const;

/** **The dome's turn about its up** and **the lens raised over its observing rest**, radians. */
export function domeAt(t: number) {
  const s = ((t % DOME_S) + DOME_S) % DOME_S;
  const k = Math.min(3, Math.floor(s / 14));
  const move = ease.inOut(span(s, 14 * k, 14 * k + 5));
  return {
    yaw: lerp(AIMS[k]!, AIMS[k + 1]!, move) * DEG,
    lens: lerp(RAISES[k]!, RAISES[k + 1]!, move) * DEG,
  };
}

// ---------- la grue du port ----------

/** **La grue charge la cale en 44 s**, dont 8 de repos. */
export const CRANE_S = 44;
/** Elle pivote de 110° vers le terre-plein. */
const PICK = -110 * DEG;
/** Over its rest: raised 18° over the yard, lowered 8° over the hull — `port.glb`'s jib rests
 *  at 20°, so 38° and 12°. */
const LIFT = { yard: 18 * DEG, hull: -8 * DEG } as const;
/** **Where the hook stops**, metres over the crane's foot: 3 m over the yard, 7,4 m over the
 *  deck of a hull on the slip (`storyboard-repos`). `@a-mesurer` */
const HOOK_OVER = { yard: 3, hull: 7.4 } as const;

/** The crane at rest, in the plane (x, y) of its turning ring, about z. */
export type CraneRig = {
  /** The jib's foot, and its head — where the cable hangs from. */
  readonly foot: Flat;
  readonly head: Flat;
  /** The cable's length at rest, head to hook. */
  readonly cable: number;
  /** How high the ring stands over the crane's foot on the ground. */
  readonly height: number;
};

/** **The crane at an instant**: the ring's slew (radians about up), the jib raised over its rest
 *  (radians: the jib turns by its opposite about z, its head towards −x), its head and the cable's
 *  length. */
export type CraneState = {
  readonly slew: number;
  readonly lift: number;
  readonly head: Flat;
  readonly cable: number;
};

const headAt = (rig: CraneRig, raised: number): Flat => turned(rig.head, -raised, rig.foot);
/** The cable that lets the hook hang `over` metres over the ground, the jib raised by `raised`. */
const downTo = (rig: CraneRig, raised: number, over: number): number =>
  headAt(rig, raised)[1] + rig.height - over;
const craneState = (rig: CraneRig, slew: number, lift: number, cable: number): CraneState => ({
  slew,
  lift,
  head: headAt(rig, lift),
  cable,
});

/** **`port.glb`'s crane today**, in the file's metres: its ring over the yard at (70, 90), and the
 *  rig `CRANE` reads off the file (`craneRigOf`). A site's crane is read here when a hull docks:
 *  a test holds it to the file. */
export const PORT_CRANE: {
  readonly rig: CraneRig;
  readonly ring: { readonly x: number; readonly z: number };
} = {
  rig: {
    foot: [-2.2, 0.2],
    head: [-30.390778623577255, 10.460604299770058],
    cable: 12,
    height: 16.2,
  },
  ring: { x: 70, z: 90 },
};

/** **The jib's reach**: raised to no less than 10° and no more than 45° (décision du 03/11, la
 *  grue de Claude Design). `@a-mesurer` */
const JIB_RANGE = { min: 10 * DEG, max: 45 * DEG } as const;
/** **The hook's place on a hull**: 6 m abaft its stem, on the fore deck (storyboard « Accostage »). */
export const HOOK_ABAFT_STEM = 6;

/**
 * **The slew, the lift and the cable that bring the hook over `at`** (metres from the ring's axis,
 * in the file's plane (x, z)), or `null` when the jib cannot reach it: raised under 10° or over 45°.
 * The foot stands on the head's side of the axis; `at` is `|foot| + jib·cos θ` from it.
 */
export function craneToward(rig: CraneRig, at: { readonly x: number; readonly z: number }) {
  const [fx, fy] = rig.foot;
  const jib = Math.hypot(rig.head[0] - fx, rig.head[1] - rig.foot[1]);
  const rest = Math.atan2(rig.head[1] - fy, fx - rig.head[0]);
  const cos = (Math.hypot(at.x, at.z) + fx) / jib;
  if (cos > Math.cos(JIB_RANGE.min) || cos < Math.cos(JIB_RANGE.max)) return null;
  const lift = Math.acos(cos) - rest;
  return craneState(rig, Math.atan2(at.z, -at.x), lift, downTo(rig, lift, HOOK_OVER.hull));
}

/**
 * **The parts of the crane at `state`**, as a pose: the ring turns about up, the jib about z, the
 * cable and the hook follow the jib's head (`stretch` lengthens the cable's y).
 */
export function craneParts(rig: CraneRig, { slew, lift, head: [x, y], cable }: CraneState) {
  const [dx, dy] = [x - rig.head[0], y - rig.head[1]];
  return {
    grue_couronne: { turn: [0, slew, 0] },
    fleche: { turn: [0, 0, -lift] },
    cable: { shift: [dx, dy, 0], stretch: cable / rig.cable },
    crochet: { shift: [dx, dy - (cable - rig.cable), 0] },
  } as const;
}

/**
 * **A visit of the crane to a hull's deck**, from where the loop left it (storyboard `port`, B+
 * du 03/11, « La grue vient sur lui »), in seconds from the touch. The four first are the
 * storyboard's, `@a-mesurer` against `commun/port.js` (`craneOn`): it starts 0,6 s after the
 * touch, the jib turns in 2,4 s (`smooth`), the hook goes down in 1,4 s (`ease.out3`); the crane
 * goes back to its rest in 2,4 s, as the B+ casting off. What the storyboard does not say, decided
 * on 06/11: the hook holds 1,6 s (the mooring's), and hoists in 0,25 s (`avant-b-plus`).
 * The loop then starts again at its phase 0.
 */
const VISIT = { after: 0.6, slew: 2.4, hook: 1.4, hold: 1.6, up: 0.25, back: 2.4 } as const;

export function craneVisit(rig: CraneRig, from: CraneState, to: CraneState) {
  const come = VISIT.after;
  const over = come + VISIT.slew;
  const down = over + VISIT.hook;
  const up = down + VISIT.hold;
  const hoisted = up + VISIT.up;
  const end = hoisted + VISIT.back;
  const home = rig.cable;
  return {
    /** From the touch, ms. */
    ms: end * 1000,
    /** The state `ms` after the touch. */
    at(ms: number): CraneState {
      const s = ms / 1000;
      const io = (a: number, b: number) => ease.inOut(span(s, a, b));
      const swing = io(come, over);
      const back = io(hoisted, end);
      const slew = lerp(lerp(from.slew, to.slew, swing), 0, back);
      const lift = lerp(lerp(from.lift, to.lift, swing), 0, back);
      const cable =
        s < up
          ? lerp(lerp(from.cable, home, swing), to.cable, ease.out3(span(s, over, down)))
          : lerp(to.cable, home, io(up, hoisted));
      return craneState(rig, slew, lift, cable);
    },
  };
}

/** **The ring's slew** (radians about up), **the jib raised** over its rest (radians: the jib
 *  turns by its opposite about z, its head towards −x), **its head and the cable's length**. */
export function craneAt(t: number, rig: CraneRig) {
  const s = ((t % CRANE_S) + CRANE_S) % CRANE_S;
  const io = (a: number, b: number) => ease.inOut(span(s, a, b));
  const slew = s < 17.5 ? lerp(0, PICK, io(0, 6)) : lerp(PICK, 0, io(17.5, 25.5));
  const lift =
    s < 17.5
      ? lerp(0, LIFT.yard, io(6, 9))
      : s < 33
        ? lerp(LIFT.yard, LIFT.hull, io(17.5, 25.5))
        : lerp(LIFT.hull, 0, io(33, 36));
  const cable =
    s < 17.5
      ? lerp(rig.cable, downTo(rig, LIFT.yard, HOOK_OVER.yard), io(9, 12.5)) * (1 - io(14, 17.5)) +
        rig.cable * io(14, 17.5)
      : lerp(rig.cable, downTo(rig, LIFT.hull, HOOK_OVER.hull), io(25.5, 28.5)) * (1 - io(30, 33)) +
        rig.cable * io(30, 33);
  return craneState(rig, slew, lift, cable);
}
