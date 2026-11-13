import { CatmullRomCurve3, Vector3 } from 'three';
import { troopMetres } from '@/domain/piece-size';
import { MOLE } from '@/emblems/kits/manifest';
import { ease, span } from './curves';

/**
 * **A hull at a port, a pure function of time** (#270, `storyboard-port/commun/port.js`, passe B+
 * du 03/11): its middle in `port.glb`'s metres (+z the sea beyond the quay), its heading `yaw`
 * from +z (`π`: the stem toward the land), its bow `pitch` up. Times in milliseconds.
 */
type Hull = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
};
export type HullTrack = { readonly ms: number; at(t: number): Hull };
export type SeaRole = 'cargo' | 'escort' | 'carrier';

/** The manoeuvres stretch by hull: the escort brisk, the carrier heavy (23/10). */
const PACE: Readonly<Record<SeaRole, number>> = { cargo: 1, escort: 0.85, carrier: 1.25 };
const DEG = Math.PI / 180;
/** The mole's head, where the basin opens. */
const MUSOIR = MOLE.quay + MOLE.length + MOLE.head;
/** **Where its thread meets the port**, out at sea off the basin's open side. `@a-mesurer` */
export const OFFSHORE = { x: -160, z: 640 } as const;

/** **A hull's beam**, a share of its length, until the models are measured for it (#270): the widest of the 24 files reads 0.242 (#479).
 *  `@a-mesurer` */
export const HULL_BEAM_SHARE = 0.25;
/** Where it stands at rest, its middle in the model's metres, and its heading there. */
export type Berth = { readonly x: number; readonly z: number; readonly yaw: number };
const toward = (from: number, to: number): number =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** **Its berth**: along the mole's basin face, the stem to the land, 3 m off the quay. */
export const berthOf = (role: SeaRole, beam: number): Berth => ({
  x: MOLE.inner - 1 - beam / 2,
  z: MOLE.quay + 3 + troopMetres(role) / 2,
  yaw: Math.PI,
});

/** **A berth in the roads**, past the mole's head: no basin to round, no haul across (#487). */
const inRoads = (role: SeaRole, b: Berth): boolean => b.z - troopMetres(role) / 2 > MUSOIR;
/** The heading from `a` toward `b`, from +z. */
const bearing = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.atan2(b.x - a.x, b.z - a.z);

const clamp = (t: number, ms: number) => Math.min(Math.max(t / 1000, 0), ms / 1000);
const curve = (points: ReadonlyArray<readonly [number, number]>) =>
  new CatmullRomCurve3(
    points.map(([x, z]) => new Vector3(x, 0, z)),
    false,
    'centripetal',
  );

/**
 * **It docks** (storyboard « Accostage »): from the offshore it rounds into the basin and slows,
 * parallel to the mole a beam and a half off, then comes across against the fenders.
 */
export function docking(role: SeaRole, beam: number, b = berthOf(role, beam)): HullTrack {
  const p = PACE[role];
  if (inRoads(role, b)) return anchoring(p, b);
  const off = b.x - beam * 1.5;
  const path = curve([
    [OFFSHORE.x, OFFSHORE.z],
    [-110, 470],
    [-20, 380],
    [off, 300],
    [off, b.z + 20],
    [off, b.z],
  ]);
  const [ta, tx] = [8.5 * p, 2.4 * p];
  const ms = (ta + tx) * 1000;
  return {
    ms,
    at(t) {
      const s = clamp(t, ms);
      if (s <= ta) {
        const u = 1 - (1 - s / ta) ** 2.2;
        const at = path.getPointAt(u);
        const tangent = path.getTangentAt(Math.min(u, 0.999));
        return { x: at.x, y: 0, z: at.z, yaw: Math.atan2(tangent.x, tangent.z), pitch: 0 };
      }
      const k = ease.inOut(span(s, ta, ta + tx));
      const yaw = Math.PI + toward(Math.PI, b.yaw) * k;
      return { x: off + (b.x - off) * k, y: 0, z: b.z, yaw, pitch: 0 };
    },
  };
}

/** **It anchors in the roads** (décision du 05/11, #487): straight in from the offshore, slowing,
 *  its stem swinging to the land, no basin to round and no haul across. */
function anchoring(p: number, b: Berth): HullTrack {
  const path = curve([
    [OFFSHORE.x, OFFSHORE.z],
    [(OFFSHORE.x + b.x) / 2 - 30, (OFFSHORE.z + b.z) / 2 + 20],
    [b.x, b.z],
  ]);
  const ta = 8.5 * p;
  const ms = ta * 1000;
  return {
    ms,
    at(t) {
      const u = 1 - (1 - clamp(t, ms) / ta) ** 2.2;
      const at = path.getPointAt(u);
      const tangent = path.getTangentAt(Math.min(u, 0.999));
      const go = Math.atan2(tangent.x, tangent.z);
      const yaw = go + toward(go, b.yaw) * ease.inOut(span(u, 0.6, 1));
      return { x: at.x, y: 0, z: at.z, yaw, pitch: 0 };
    },
  };
}

/** **The hull at the mole's side is hauled across to the mole** (#487): the last of its docking,
 *  from where it lay, when the hull at the mole has put to sea. */
export function hauling(role: SeaRole, from: Berth, to: Berth): HullTrack {
  const ms = 2400 * PACE[role];
  return {
    ms,
    at(t) {
      const k = ease.inOut(span(t, 0, ms));
      return {
        x: from.x + (to.x - from.x) * k,
        y: 0,
        z: from.z + (to.z - from.z) * k,
        yaw: from.yaw + toward(from.yaw, to.yaw) * k,
        pitch: 0,
      };
    },
  };
}

/**
 * **It puts to sea, going astern** (storyboard « Appareillage »): it swings its stern out on its
 * forward spring, backs out of the basin past the mole's head, turns and goes ahead, to the
 * offshore its thread starts from.
 */
export function undocking(role: SeaRole, beam: number, b = berthOf(role, beam)): HullTrack {
  const p = PACE[role];
  const h = troopMetres(role) / 2;
  if (inRoads(role, b)) return weighing(p, b);
  const a = -14 * DEG;
  // It swings on its bow, from its rest to its stern out by `a`.
  const bow = [b.x + h * Math.sin(b.yaw), b.z + h * Math.cos(b.yaw)] as const;
  const swing = (k: number) => {
    const yaw = b.yaw + toward(b.yaw, Math.PI + a) * k;
    return { x: bow[0] - h * Math.sin(yaw), z: bow[1] - h * Math.cos(yaw), yaw };
  };
  const s0 = swing(1);
  const back = MUSOIR + h + 30 - s0.z;
  const at = { x: s0.x - (Math.sin(s0.yaw) * back) / -Math.cos(s0.yaw), z: s0.z + back };
  const [td, tb, tt] = [1.6 * p, 6 * p, 3.4 * p];
  const turned = { x: at.x, z: at.z + 20, yaw: -0.45 };
  // Ahead to the offshore at 60 m/s at most on average: no leap at the end.
  const tg = Math.max(2.6 * p, Math.hypot(OFFSHORE.x - turned.x, OFFSHORE.z - turned.z) / 60);
  const ms = (td + tb + tt + tg) * 1000;
  return {
    ms,
    at(t) {
      const s = clamp(t, ms);
      if (s <= td) return { ...swing(ease.inOut(s / td)), y: 0, pitch: 0 };
      if (s <= td + tb) {
        const k = ease.drive((s - td) / tb);
        return { x: s0.x + (at.x - s0.x) * k, y: 0, z: s0.z + back * k, yaw: s0.yaw, pitch: 0 };
      }
      if (s <= td + tb + tt) {
        const k = ease.inOut((s - td - tb) / tt);
        const yaw = s0.yaw + Math.atan2(Math.sin(-0.45 - s0.yaw), Math.cos(-0.45 - s0.yaw)) * k;
        return { x: at.x - 25 * Math.sin(Math.PI * k), y: 0, z: at.z + 20 * k, yaw, pitch: 0 };
      }
      const k = ease.in2((s - td - tb - tt) / tg);
      const go = { x: OFFSHORE.x - turned.x, z: OFFSHORE.z - turned.z };
      return {
        x: turned.x + go.x * k,
        y: 0,
        z: turned.z + go.z * k,
        yaw: Math.atan2(go.x, go.z) * k + turned.yaw * (1 - k),
        pitch: 0,
      };
    },
  };
}

/** **It weighs anchor in the roads** (#487): it swings its bow to the offshore, then goes ahead. */
function weighing(p: number, b: Berth): HullTrack {
  const heading = bearing(b, OFFSHORE);
  const [tt, tg] = [
    2.4 * p,
    Math.max(2.6 * p, Math.hypot(OFFSHORE.x - b.x, OFFSHORE.z - b.z) / 60),
  ];
  const ms = (tt + tg) * 1000;
  return {
    ms,
    at(t) {
      const s = clamp(t, ms);
      const yaw = b.yaw + toward(b.yaw, heading) * ease.inOut(span(s, 0, tt));
      const k = ease.in2(span(s, tt, tt + tg));
      return {
        x: b.x + (OFFSHORE.x - b.x) * k,
        y: 0,
        z: b.z + (OFFSHORE.z - b.z) * k,
        yaw,
        pitch: 0,
      };
    },
  };
}

/** The slipway, in `port.glb`'s metres: its axis, where a hull's stern stands on it, its slope. */
const SLIP = { x: 0, stern: 85, slope: 0.025, top: 2.2 } as const;
const slipTop = (z: number) => SLIP.top + Math.max(0, (MOLE.quay - z) * SLIP.slope);

/**
 * **A new hull is launched stern first and hauled to its berth** (Décisions du 03/11): it dresses
 * on the slip (`dressed`, 0 to 1), its shores fall (`shores`), it slides, its stern floats, it
 * pivots on the slip's head, its bow drops, it runs on its way, braked, and is hauled across to
 * its berth. `keel` lifts its middle above the slides.
 */
export function launch(
  role: SeaRole,
  beam: number,
  keel: number,
  b = berthOf(role, beam),
): HullTrack & { dressed(ms: number): number; shores(ms: number, k: number): number } {
  const h = troopMetres(role) / 2;
  const H = MOLE.quay;
  const z0 = SLIP.stern - h;
  const tDressed = 1.4;
  const tSlide = tDressed + 0.8;
  const acc = 6;
  const sBow = H - (z0 - h);
  const tBow = tSlide + Math.sqrt((2 * sBow) / acc);
  const vBow = acc * (tBow - tSlide);
  // In the roads it runs on to its anchorage: no haul across (#487).
  const roads = inRoads(role, b);
  const drift = roads ? Math.max(60, b.z - (z0 + sBow)) : 60;
  const brake = (vBow * vBow) / (2 * drift);
  const tStop = tBow + vBow / brake;
  const zStop = z0 + sBow + drift;
  const tHauled = roads ? tStop : tStop + 3.4;
  const lift = 1.5 + keel;
  const yHead = slipTop(H) + lift;
  const ms = tHauled * 1000;
  return {
    ms,
    dressed: (t) => span(t / 1000, 0, tDressed),
    shores: (t, k) => ease.in2(span(t / 1000, tDressed + k * 0.04, tDressed + k * 0.04 + 0.5)),
    at(t) {
      const s = clamp(t, ms);
      const onSlip = { pitch: -Math.atan(SLIP.slope), yaw: Math.PI, x: SLIP.x };
      if (s < tSlide) return { ...onSlip, z: z0, y: slipTop(z0) + lift };
      if (s < tBow) {
        const z = z0 + 0.5 * acc * (s - tSlide) ** 2;
        const stern = z + h;
        if (stern <= H) return { ...onSlip, z, y: slipTop(z) + lift };
        // Its stern sinks till it floats; it pivots on the slip's head.
        const ys = (yHead - (stern - H) * SLIP.slope) * (1 - ease.inOut(span(stern - H, 0, 70)));
        const slope = (yHead - ys) / (stern - H);
        return { ...onSlip, z, y: yHead - slope * (z - H), pitch: -Math.atan(slope) };
      }
      if (s < tStop) {
        const τ = s - tBow;
        const settle = ease.inOut(span(τ, 0, 1.1));
        const slope0 = yHead / h / 2;
        const z = z0 + sBow + vBow * τ - 0.5 * brake * τ * τ;
        const veer = roads ? ease.inOut(span(z - (z0 + sBow), 0, drift)) : 0;
        return {
          x: SLIP.x + (b.x - SLIP.x) * veer,
          z,
          y: (yHead / 2) * (1 - settle) + Math.sin(τ * 5) * 0.6 * (1 - settle),
          pitch: -Math.atan(slope0) * (1 - settle),
          yaw: Math.PI + toward(Math.PI, b.yaw) * veer,
        };
      }
      const k = ease.inOut(span(s, tStop, tHauled));
      return {
        x: SLIP.x + (b.x - SLIP.x) * k,
        z: zStop + (b.z - zStop) * k,
        y: 0,
        pitch: 0,
        yaw: Math.PI + toward(Math.PI, b.yaw) * k,
      };
    },
  };
}
