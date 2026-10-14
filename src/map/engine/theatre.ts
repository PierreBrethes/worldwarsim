import { Color, Mesh, ShaderMaterial, type BufferGeometry, type Scene } from 'three';
import type { Theatre } from '@/domain/theatres';
import { COUNTRY_THICKNESS, SEA_LEVEL } from './frame';
import { PALETTE } from './palette';

/** Over the night veil, under reaches, threads and pieces. */
const FRAME_LIFT = COUNTRY_THICKNESS + 0.012;
const FRAME_RANK = 3;
/** How much paper covers what lies outside: read, never played. */
const WASH = 0.6;
/** The frame's stroke, in degrees: a printed border, not a hairline. */
const STROKE_DEG = 0.35;

/**
 * **Le cadre d'une Blitz** (B1, lot 5) : ce qui est hors du théâtre se délave sous un papier, et
 * la boîte se trace à l'encre. Calculé au fragment sur le `lonLat` de la feuille, comme la nuit ;
 * `east` au-delà de 180 lit le Pacifique d'un seul tenant.
 */
function frameMaterial(theatre: Theatre): ShaderMaterial {
  const { west, south, east, north } = theatre.box;
  return new ShaderMaterial({
    uniforms: {
      box: { value: [west, south, east, north] },
      paper: { value: new Color(PALETTE.paper) },
      ink: { value: new Color(PALETTE.border) },
    },
    vertexShader: `
      attribute vec2 lonLat;
      varying vec2 vLonLat;
      void main() {
        vLonLat = lonLat;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec4 box;
      uniform vec3 paper;
      uniform vec3 ink;
      varying vec2 vLonLat;
      void main() {
        float lon = vLonLat.x < box.x ? vLonLat.x + 360.0 : vLonLat.x;
        float dx = min(lon - box.x, box.z - lon);
        float dy = min(vLonLat.y - box.y, box.w - vLonLat.y);
        float margin = min(dx, dy);
        if (margin >= ${STROKE_DEG.toFixed(2)}) discard;
        gl_FragColor = margin < 0.0 ? vec4(paper, ${WASH.toFixed(2)}) : vec4(ink, 0.85);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
}

export class TheatreFrame {
  private mesh: Mesh | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly surface: BufferGeometry,
  ) {}

  show(theatre: Theatre | null): void {
    if (this.mesh !== null) {
      this.mesh.removeFromParent();
      (this.mesh.material as ShaderMaterial).dispose();
      this.mesh = null;
    }
    if (theatre === null) return;
    this.mesh = new Mesh(this.surface, frameMaterial(theatre));
    this.mesh.position.y = FRAME_LIFT - SEA_LEVEL;
    this.mesh.renderOrder = FRAME_RANK;
    this.scene.add(this.mesh);
  }
}
