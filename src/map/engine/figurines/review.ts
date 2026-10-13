import {
  Box3,
  type Object3D,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { UnitRole } from '@/domain/ids';
import { TIERS_BY_ROLE, type UnitTier } from '@/domain/troops';
import { spriteUrl } from '@/emblems/units/manifest';
import { pilePieces } from '@/domain/pile-pieces';
import { fr } from '@/i18n/fr';
import { blockFigurine, washedBlock } from '../blocks';
import type { Smoke } from '../smoke';
import { Faces, pileObject } from '../standing';
import { figurineFor } from './figurine';

/**
 * **The dev review page** (`/figurines.html`): every French role beside its plate, under the
 * board's own lights, turning slowly. It is where a figurine is judged against its plate
 * before it reaches the map — never shipped, `vite build` only knows `index.html`.
 */
const ROLES = Object.keys(TIERS_BY_ROLE) as ReadonlyArray<UnitRole>;
const root = document.getElementById('review')!;
/** `?nation=germany` reviews another nation's figurines. */
const nation = new URLSearchParams(location.search).get('nation') ?? 'france';
const views: Array<() => void> = [];
// One renderer for every card, copied into each: a browser keeps about sixteen WebGL contexts
// alive, and a nation's whole catalogue holds more figurines than that.
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(devicePixelRatio);

function card(
  plate: string | null,
  caption: string,
  object: Object3D | null,
  still?: { readonly size: number; readonly angle: number },
): void {
  const figure = document.createElement('figure');
  figure.innerHTML = `${plate ? `<img src="${plate}" alt="">` : '<div></div>'}<figcaption>${caption}</figcaption>`;
  root.append(figure);
  if (object === null) {
    figure.querySelector('figcaption')!.textContent += ' — pas de figurine, la planche reste';
    return;
  }
  const canvas = document.createElement('canvas');
  figure.insertBefore(canvas, figure.querySelector('figcaption'));
  const context = canvas.getContext('2d')!;
  const scene = new Scene();
  scene.add(new HemisphereLight('#fff3dc', '#5a4e3a', 1.35));
  const sun = new DirectionalLight('#fffaf0', 0.5);
  sun.position.set(-180, 320, 160);
  scene.add(sun);
  const ground = new Mesh(new PlaneGeometry(4, 4), new MeshStandardMaterial({ color: '#d5c5a0' }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground, object);
  const camera = new PerspectiveCamera(30, 1, 0.01, 50);
  views.push(() => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (canvas.width !== w * devicePixelRatio) {
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
    }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const size =
      still?.size ?? (new Box3().setFromObject(object).getSize(new Vector3()).length() || 1);
    const angle = still?.angle ?? performance.now() / 4000;
    camera.position.set(Math.sin(angle) * size * 1.6, size * 0.9, Math.cos(angle) * size * 1.6);
    camera.lookAt(0, size * 0.2, 0);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(renderer.domElement, 0, 0);
  });
}

for (const role of ROLES) {
  for (let tier = 1 as UnitTier; tier <= TIERS_BY_ROLE[role]; tier = (tier + 1) as UnitTier) {
    const figurine = figurineFor(nation, role, [tier, tier, tier]);
    card(spriteUrl(nation, role, tier), `${role} MK${tier}`, figurine?.object ?? null);
  }
}

/** Piles as the board stands them: whole, worn and counted, and one left to its plate. */
const troop = (role: UnitRole, strength = 100, tier: UnitTier = 1) => ({
  role,
  tier,
  strength,
  nominalStrength: 100,
});
const faces = new Faces(() => {});
const smokes: Smoke[] = [];
const texts = { count: fr.troops.sheetCount, more: fr.troops.moreRoles };
for (const [caption, troops] of [
  ['pile · 1 infanterie', [troop('infantry')]],
  ['pile · 3 infanteries à 50 %', [1, 2, 3].map(() => troop('infantry', 50))],
  ['pile · 4 rôles', [troop('infantry'), troop('armor'), troop('landTransport'), troop('fighter')]],
  // MK2: France has no R35 yet. Smoke at half strength, thick smoke and a burnt hull at a quarter.
  ['pile · 2 blindés à 50 %', [1, 2].map(() => troop('armor', 50, 2))],
  ['pile · 2 blindés à 25 %', [1, 2].map(() => troop('armor', 25, 2))],
] as const) {
  const pile = pileObject(nation, pilePieces(troops), texts, faces);
  if (pile) smokes.push(...pile.smokes);
  card(spriteUrl(nation, 'infantry', 1), caption, pile?.object ?? null);
}

// Seen from behind, as on the board: the pictogram is what the page is there to judge.
const BLOCK_VIEW = { size: 1.1, angle: 0.5 };

/** The enemy as the board stands it: a block per medium, and a last known position. */
for (const medium of ['land', 'sea', 'air'] as const)
  card(null, `bloc adverse · ${medium}`, blockFigurine(medium).object, BLOCK_VIEW);
card(null, 'bloc adverse · dernière position connue', washedBlock('land'), BLOCK_VIEW);

/** `?motion=reduced` stills the smoke, as the board does. */
const still = new URLSearchParams(location.search).get('motion') === 'reduced';
const frame = () => {
  for (const smoke of smokes) smoke.frame(still ? 0 : performance.now() / 1000);
  for (const view of views) view();
  requestAnimationFrame(frame);
};
frame();
