import { Color, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import { ARC_COLORS, PALETTE } from './palette';

const VERTEX = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const FRAGMENT = `uniform vec3 uColor; uniform float uOpacity, uDash, uTime, uSpin, uInner, uTicks;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2. - 1.; float r = length(p); float a = atan(p.y, p.x) / 6.28318 + .5;
  float fw = fwidth(r) * 1.2;
  float ring = smoothstep(uInner - fw, uInner, r) * (1. - smoothstep(1. - fw, 1., r));
  if (uDash > 0.) ring *= step(.42, fract(a * uDash + uTime * uSpin));
  if (uTicks > 0.) { float t = abs(fract(a * 4. + .125) - .5); ring = max(ring, step(t, .02) * step(.55, r) * (1. - smoothstep(1. - fw, 1., r)) * step(r, uInner + .02)); }
  if (ring < .01) discard;
  gl_FragColor = vec4(uColor, ring * uOpacity);
  #include <colorspace_fragment>
}`;

const PLANE = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

/** What a ring says of its piece to the hand right now (POC, `ringStyle`). */
export type RingState =
  | 'hover'
  | 'selected'
  | 'target'
  | 'merge'
  | 'enemy'
  | 'bad'
  | 'avail'
  /** The reticle under the piece in hand: where it would land, an order or a refusal. */
  | 'aim'
  | 'aimFight'
  | 'aimRefused'
  /** Where a piece touches down, spreading out (POC, `ripple`). */
  | 'ripple'
  | 'rippleOchre'
  /** The pale copy waiting where an order sent it (POC, `settle`). */
  | 'settled';

const OCHRE = ARC_COLORS.mine.trace;
const ALARM = ARC_COLORS.enemyDetected.progress;
/** The prototype's table, its widths over its ring of 1.2: ink, width, opacity at rest and
 *  pulsing, dashes around, their spin, the four ticks of a target. */
const STYLE: Readonly<
  Record<RingState, readonly [string, number, number, number, number, number, number]>
> = {
  hover: [PALETTE.border, 0.058, 0.6, 0, 0, 0, 0],
  selected: [OCHRE, 0.117, 1, 0, 16, 0.12, 0],
  target: [OCHRE, 0.167, 0.7, 0.3, 0, 0, 0],
  merge: [OCHRE, 0.167, 0.7, 0.3, 10, -0.25, 0],
  enemy: [ALARM, 0.133, 0.85, 0.15, 6, 0.35, 1],
  bad: [ALARM, 0.067, 0.6, 0, 24, 0, 0],
  avail: [OCHRE, 0.058, 0.55, 0.25, 20, 0.1, 0],
  aim: [OCHRE, 0.1125, 1, 0, 0, 0, 1],
  aimFight: [ALARM, 0.1125, 1, 0, 0, 0, 1],
  aimRefused: [ALARM, 0.1125, 1, 0, 10, 0, 1],
  ripple: [PALETTE.border, 0.06, 0.55, 0, 0, 0, 0],
  rippleOchre: [OCHRE, 0.06, 0.55, 0, 0, 0, 0],
  settled: [OCHRE, 0.064, 0.9, 0, 18, 0.08, 0],
};

/** What the hand would drop onto beats as it pulses. */
const BEATS: ReadonlySet<RingState> = new Set(['target', 'merge', 'enemy']);
/** A ring that changes meaning lands like a stamp: wide, then home. */
const LANDING_S = 0.22;

/**
 * **A flat ring of ink round a piece** (POC « Manipuler les pions », `inkRing`): solid or dashed,
 * turning slowly, pulsing on what the hand would drop onto. One mesh, its radius 1: the piece
 * scales it to its footprint.
 */
export class InkRing extends Mesh<PlaneGeometry, ShaderMaterial> {
  private state: RingState | null = null;
  private since = 0;
  /** How much wider than its piece it is drawn right now: landing, beating. */
  beat = 1;

  constructor() {
    super(
      PLANE,
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uColor: { value: new Color() },
          uOpacity: { value: 1 },
          uDash: { value: 0 },
          uTime: { value: 0 },
          uSpin: { value: 0 },
          uInner: { value: 0.9 },
          uTicks: { value: 0 },
        },
      }),
    );
    this.renderOrder = 3;
    this.visible = false;
    // Drawn round a piece, never a piece: a click goes through it.
    this.raycast = () => {};
  }

  /** Styled for `state` at `seconds`, `null` to hide it; `still` holds every motion. */
  style(state: RingState | null, seconds: number, still: boolean): void {
    this.visible = state !== null;
    if (state === null) {
      this.state = null;
      return;
    }
    if (state !== this.state) {
      this.state = state;
      this.since = seconds;
    }
    const [color, width, opacity, pulsing, dashes, spin, ticks] = STYLE[state];
    const pulse = still ? 1 : 0.5 + 0.5 * Math.sin(seconds * 7);
    const u = this.material.uniforms;
    u.uColor!.value.set(color);
    u.uInner!.value = 1 - width;
    u.uOpacity!.value = opacity + pulsing * pulse;
    u.uDash!.value = dashes;
    u.uSpin!.value = still ? 0 : spin;
    u.uTime!.value = seconds;
    u.uTicks!.value = ticks;
    const landing = still
      ? 1
      : 1 + 0.4 * (1 - Math.min(1, (seconds - this.since) / LANDING_S)) ** 2;
    const beat = BEATS.has(state) && !still ? 1.06 + 0.05 * pulse : 1;
    this.beat = landing * beat;
  }

  /** Its ink's opacity, for what fades out on its own clock. */
  set opacity(value: number) {
    this.material.uniforms.uOpacity!.value = value;
  }

  /** Still turning or pulsing: the frames must keep coming. */
  get moving(): boolean {
    if (this.state === null) return false;
    const [, , , pulsing, , spin] = STYLE[this.state];
    return pulsing > 0 || spin !== 0;
  }
}
