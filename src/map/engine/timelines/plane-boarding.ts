import type { MapMotion } from '@/domain/map-motion';
import type { PartPose, Sequence } from '../sequences';
import { wayOf } from './beach-boats';
import { ease, span } from './curves';
import { RAZE_RING_MS } from './raze';
import { WALK_MIN_PX } from './walk';

export type Flat = readonly [x: number, z: number];
type Vec3 = readonly [x: number, y: number, z: number];

/** The storyboard's hours (« 2. En avion », `T` and `planPlane`), in ms, as written. `@a-mesurer` —
 *  read off the storyboard, not from a plane on a yard */
const T = {
  /** The door opens from here (`out3`). */
  open: 300,
  door: 500,
  doorShut: 450,
  plank: 350,
  /** A man climbs the plank, and the dark swallows him over the last `swallow` of it. */
  climb: 450,
  swallow: 200,
  /** The first man sets out this long in, the next ones this far apart at the soonest. */
  first: 250,
  file: 320,
  /** The plank comes in this long after the last man is in; the door shuts as it is in. */
  after: 150,
  /** It all rests this long once the door is shut. */
  rest: 300,
} as const;
/** **The door plays from 30 px** (#502), as the truck's tailgate does: the buildings' 150 px
 *  (`PLAY_PX`) would never let a plane, a quarter of the screen at best, play. `@a-mesurer` against
 *  a plane on a phone. */
export const PLANE_BOARDING_PX = 30;
/** A man's pace, in his heights a second, and where he waits before the plank, in his heights:
 *  out from the foot and aft of it. */
const MAN_SPEED = 1.9;
const SIDE: Flat = [0.6, -0.2];
/** The cabin door swings forward this far about y (`mer-air.js:850`; the GLB brief says 160°, the
 *  storyboard rules). */
const DOOR_ANGLE = (100 * Math.PI) / 180;

/** The door's sill is a point of its lower edge, at the storyboard's offset from the hinge
 *  (`mer-air.js:558`, `cabin_door.localToWorld`), in metres of the model. */
const SILL_FROM_HINGE: Vec3 = [0.05, -0.88, -0.4];
/** The provisional plank, 0.5 m wide and 0.08 thick, while the GLB has no `echelle`. */
const PLANK_WIDTH_M = 0.5;
const PLANK_THICK_M = 0.08;

/** What the plane drawn gives, in metres of its model, root at its wheels: the `cabin_door`'s hinge,
 *  `fx_porte` (x across, z along: the plank's foot, on the ground) and the tail-down rest, in
 *  radians. The eight GLB differ by metres, so the engine reads them off the rig (#502). */
export type PlaneRig = { readonly hinge: Vec3; readonly foot: Flat; readonly pitch: number };

/**
 * **A boarding by plane to play** (#480), on the board: the plane at its wheels (`metre` board
 * units to a metre of it, `heading` its nose's turn from +z), a man's height in board units, and
 * each squad's men at their places.
 */
export type PlaneBoarding = {
  readonly plane: {
    readonly at: Flat;
    readonly heading: number;
    readonly metre: number;
    readonly rig: PlaneRig;
  };
  readonly man: number;
  readonly squads: ReadonlyArray<{ readonly men: ReadonlyArray<Flat> }>;
  /** Where the men step out onto the plane's yard before they head for it, when their rank does
   *  not stand in its sight: the airfield's garrison stands between its hangars (#502). */
  readonly muster?: Flat;
};

/** The provisional plank at an instant: its two ends on the board, and its size in board units. */
export type Plank = {
  readonly from: Vec3;
  readonly to: Vec3;
  readonly width: number;
  readonly thick: number;
};

/**
 * **Monter en avion** (#480, storyboard « 2. En avion ») : la porte de cabine pivote de 100° vers
 * l'avant ; une planche se tend du seuil au pied `fx_porte` ; les hommes quittent le rang, passent
 * derrière le bord de fuite, attendent chez eux leur tour, puis montent un par un et s'effacent
 * dans le noir ; la planche rentre, la porte se ferme. L'avion ne bouge pas. Rend sa séquence,
 * celle de chaque escouade, la planche à chaque instant, et quand tout est rangé.
 *
 * En « réduites » rien ne joue : un anneau d'encre sur l'avion 0,6 s ; en « coupées », rien.
 */
export function planeBoardingOf(
  boarding: PlaneBoarding,
  motion: MapMotion = 'full',
): {
  readonly plane: Sequence<'airTransport'> | null;
  readonly squads: ReadonlyArray<Sequence>;
  plank(t: number): Plank | null;
  readonly ring: { readonly at: Flat; readonly ms: number } | null;
  readonly settled: number;
} {
  const { plane, man, squads, muster } = boarding;
  if (motion !== 'full') {
    const ring = motion === 'reduced' ? { at: plane.at, ms: RAZE_RING_MS } : null;
    return { plane: null, squads: [], plank: () => null, ring, settled: ring?.ms ?? 0 };
  }

  const cos = Math.cos(plane.heading);
  const sin = Math.sin(plane.heading);
  /** A point of the plane's frame (x its left flank, z its nose), in board units from its wheels. */
  const toBoard = ([x, z]: Flat): Flat => [
    plane.at[0] + x * cos + z * sin,
    plane.at[1] - x * sin + z * cos,
  ];
  const toLocal = (p: Flat): Flat => {
    const dx = p[0] - plane.at[0];
    const dz = p[1] - plane.at[1];
    return [dx * cos - dz * sin, dx * sin + dz * cos];
  };
  const { metre: m, rig } = plane;
  // The sill: the model's metres, turned about the wheels by the tail-down rest.
  const sillM: Vec3 = [
    rig.hinge[0] + SILL_FROM_HINGE[0],
    rig.hinge[1] + SILL_FROM_HINGE[1],
    rig.hinge[2] + SILL_FROM_HINGE[2],
  ];
  const pitch = -rig.pitch;
  const sillLocal: Flat = [
    sillM[0] * m,
    (sillM[1] * Math.sin(pitch) + sillM[2] * Math.cos(pitch)) * m,
  ];
  const sillY = (sillM[1] * Math.cos(pitch) - sillM[2] * Math.sin(pitch)) * m;
  // The foot stands on the ground, whatever the tail's tilt does to the marker's height.
  const footLocal: Flat = [rig.foot[0] * m, rig.foot[1] * Math.cos(pitch) * m];
  const sill = toBoard(sillLocal);
  const foot = toBoard(footLocal);
  const toSill = Math.atan2(sill[0] - foot[0], sill[1] - foot[1]);
  const sideLocal: Flat = [footLocal[0] + SIDE[0] * man, footLocal[1] + SIDE[1] * man];

  type Man = {
    readonly squad: number;
    readonly k: number;
    readonly place: Flat;
    readonly way: ReturnType<typeof wayOf>;
    start: number;
    climbAt: number;
  };
  // Each man goes along his column to the foot's depth, or out to the muster point, across to the
  // side, then in.
  const men: Man[] = squads.flatMap(({ men: places }, squad) =>
    places.map((place, k) => ({
      squad,
      k,
      place,
      way: wayOf([
        place,
        muster ?? toBoard([toLocal(place)[0], sideLocal[1]]),
        toBoard(sideLocal),
        foot,
      ]),
      start: 0,
      climbAt: 0,
    })),
  );
  const speed = (MAN_SPEED * man) / 1000;
  const walk = (x: Man): number => x.way.length / speed;
  // A man waits at his place until he can reach the foot just as the one before has climbed.
  // The door opens as the first man nears the foot, or at once when he is there already.
  const open = Math.max(T.open, T.first + Math.min(...men.map(walk)) - T.door * 0.6 - T.plank);
  let free = open + T.door + T.plank;
  [...men]
    .sort((a, b) => a.way.length - b.way.length)
    .forEach((x, i) => {
      const climb = Math.max(T.first + i * T.file + walk(x), free);
      x.start = climb - walk(x);
      x.climbAt = climb;
      free = climb + T.climb * 0.8;
    });
  const lastIn = Math.max(...men.map((x) => x.climbAt)) + T.climb;
  const plankDown = open + T.door * 0.6;
  const plankUp = lastIn + T.after;
  const shut = plankUp + T.plank;
  const total = shut + T.doorShut + T.rest;

  const planeSequence: Sequence<'airTransport'> = {
    family: 'airTransport',
    ms: total,
    minPx: PLANE_BOARDING_PX,
    at(t) {
      if (t < 0 || t >= total) return {};
      const k =
        ease.out3(span(t, open, open + T.door)) * (1 - ease.in2(span(t, shut, shut + T.doorShut)));
      return k > 0 ? { cabin_door: { turn: [0, -DOOR_ANGLE * k, 0] } } : {};
    },
  };

  const squadSequences = squads.map((_, s): Sequence => {
    const mine = men.filter((x) => x.squad === s);
    const ms = Math.max(...mine.map((x) => x.climbAt + T.climb)) + 1;
    return {
      ms,
      minPx: WALK_MIN_PX,
      at(t) {
        if (t < 0 || t >= ms) return {};
        const pose: Record<string, PartPose> = {};
        for (const x of mine) {
          if (t < x.start) continue;
          if (t < x.climbAt) {
            const { at, heading } = x.way.at(span(t, x.start, x.climbAt));
            pose[`man_${x.k}`] = {
              travel: [at[0] - x.place[0], 0, at[1] - x.place[1]],
              heading,
              stride: (t - x.start) / 1000,
            };
            continue;
          }
          const c = span(t, x.climbAt, x.climbAt + T.climb);
          const along = ease.in2(c);
          pose[`man_${x.k}`] = {
            travel: [
              foot[0] + (sill[0] - foot[0]) * along - x.place[0],
              sillY * c,
              foot[1] + (sill[1] - foot[1]) * along - x.place[1],
            ],
            heading: toSill,
            ...(c < 1 ? { stride: (t - x.climbAt) / 1000 } : {}),
            fade: 1 - span(c, 1 - T.swallow / T.climb, 1),
          };
        }
        return pose;
      },
    };
  });

  return {
    plane: planeSequence,
    squads: squadSequences,
    plank(t) {
      const k =
        ease.out3(span(t, plankDown, plankDown + T.plank)) * (1 - ease.in2(span(t, plankUp, shut)));
      if (k <= 0.01) return null;
      return {
        from: [sill[0], sillY, sill[1]],
        to: [sill[0] + (foot[0] - sill[0]) * k, sillY * (1 - k), sill[1] + (foot[1] - sill[1]) * k],
        width: PLANK_WIDTH_M * m,
        thick: PLANK_THICK_M * m,
      };
    },
    ring: null,
    settled: total,
  };
}
