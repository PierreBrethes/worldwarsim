import { DataTexture, FloatType, type Material, NearestFilter, RGBAFormat, Vector2 } from 'three';
import { DAY_ALTITUDE_DEG, NIGHT_ALTITUDE_DEG } from '@/domain/daylight';
import type { WorldFrame } from './frame';

/**
 * **La nuit au pixel, pour tout ce qui se dessine sur la feuille** (#198) : le voile, mais aussi les
 * encres des contours et les dessins de terrain, lisent la même bande de nuit — celle qui dit qui
 * dort et où. Un fragment connaît sa place sur le plateau, pas sa longitude : une petite table,
 * cuite une fois, rend la latitude et la demi-largeur du monde à sa hauteur (`outline`), d'où la
 * longitude ; puis `nightOfAltitude`, écrite en GLSL, donne la bande douce du crépuscule.
 */
const SAMPLES = 1024;

export type NightUniforms = {
  readonly uSun: { value: Vector2 };
  readonly uWorldLL: { value: DataTexture };
  readonly uWorldY: { value: Vector2 };
};

export function nightUniforms(frame: WorldFrame, sun: { value: Vector2 }): NightUniforms {
  const data = new Float32Array(SAMPLES * 4);
  const top = -frame.height / 2;
  for (let k = 0; k < SAMPLES; k++) {
    const y = top + (frame.height * k) / (SAMPLES - 1);
    const latitude = frame.lonLatAt(frame.centerX, y + frame.centerY)[1];
    data[k * 4] = latitude;
    data[k * 4 + 1] = frame.edgeAtLatitude(latitude).eastX - frame.centerX;
  }
  const texture = new DataTexture(data, SAMPLES, 1, RGBAFormat, FloatType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return {
    uSun: sun,
    uWorldLL: { value: texture },
    uWorldY: { value: new Vector2(top, top + frame.height) },
  };
}

const degrees = (value: number) => value.toFixed(1);

/** `nightAtWorld(xz)`: 0 in full day, 1 in full night, at a point of the board (centred units). */
export const NIGHT_HERE_GLSL = `
uniform sampler2D uWorldLL;
uniform vec2 uWorldY, uSun;
float nightAtWorld(vec2 xz) {
  vec4 row = texture2D(uWorldLL, vec2(clamp((xz.y - uWorldY.x) / (uWorldY.y - uWorldY.x), 0.0, 1.0), 0.5));
  float longitude = row.g == 0.0 ? 0.0 : clamp(xz.x / row.g, -1.0, 1.0) * 180.0;
  vec2 here = radians(vec2(longitude, row.r));
  vec2 s = radians(uSun);
  float sine = sin(here.y) * sin(s.y) + cos(here.y) * cos(s.y) * cos(here.x - s.x);
  float altitude = degrees(asin(clamp(sine, -1.0, 1.0)));
  return 1.0 - smoothstep(${degrees(NIGHT_ALTITUDE_DEG)}, ${degrees(DAY_ALTITUDE_DEG)}, altitude);
}`;

/** An ink laid on the sheet goes down with it: left at its day colour it would be lighter than a
 *  moonlit page. @a-mesurer */
export const NIGHT_INK = 0.25;

/**
 * **Un trait de la feuille s'assombrit avec elle, la nuit** (#248) : la frontière est sépia, plus
 * claire que le sol éclairé par la lune, et une ligne three.js n'est pas éclairée. Elle lit la bande
 * de nuit au pixel, comme les dessins de terrain.
 */
export function inkDownAtNight<M extends Material>(material: M, night: NightUniforms): M {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, night);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vInkWorld;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvInkWorld = (modelMatrix * vec4(transformed, 1.0)).xz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${NIGHT_HERE_GLSL}\nvarying vec2 vInkWorld;\nvoid main() {`)
      .replace(
        '#include <colorspace_fragment>',
        `gl_FragColor.rgb *= mix(1.0, ${NIGHT_INK.toFixed(2)}, nightAtWorld(vInkWorld));
        #include <colorspace_fragment>`,
      );
  };
  return material;
}
