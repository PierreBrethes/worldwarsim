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
 *  follow at every step, as in the machine. Angles in radians about x, shifts in (y, z). */
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
export const WHEEL_SPEED = 2.5;
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
/** Over its rest: raised 18° over the yard, lowered 8° over the hull (20° → 38°, 12°). */
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
  const headAt = (raised: number) => turned(rig.head, -raised, rig.foot);
  const downTo = (raised: number, over: number) => headAt(raised)[1] + rig.height - over;
  const cable =
    s < 17.5
      ? lerp(rig.cable, downTo(LIFT.yard, HOOK_OVER.yard), io(9, 12.5)) * (1 - io(14, 17.5)) +
        rig.cable * io(14, 17.5)
      : lerp(rig.cable, downTo(LIFT.hull, HOOK_OVER.hull), io(25.5, 28.5)) * (1 - io(30, 33)) +
        rig.cable * io(30, 33);
  return { slew, lift, head: headAt(lift), cable };
}
