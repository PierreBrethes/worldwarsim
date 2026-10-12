import {
  Box3,
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
import { figurineFor } from './figurine';

/**
 * **The dev review page** (`/figurines.html`): every French role beside its plate, under the
 * board's own lights, turning slowly. It is where a figurine is judged against its plate
 * before it reaches the map — never shipped, `vite build` only knows `index.html`.
 */
const ROLES = Object.keys(TIERS_BY_ROLE) as ReadonlyArray<UnitRole>;
const root = document.getElementById('review')!;
const views: Array<() => void> = [];

for (const role of ROLES) {
  for (let tier = 1 as UnitTier; tier <= TIERS_BY_ROLE[role]; tier = (tier + 1) as UnitTier) {
    const card = document.createElement('figure');
    const plate = spriteUrl('france', role, tier);
    card.innerHTML = `${plate ? `<img src="${plate}" alt="">` : '<div></div>'}<figcaption>${role} MK${tier}</figcaption>`;
    root.append(card);
    const figurine = figurineFor('france', role, tier);
    if (figurine === null) {
      card.querySelector('figcaption')!.textContent += ' — pas de figurine, la planche reste';
      continue;
    }
    const canvas = document.createElement('canvas');
    card.insertBefore(canvas, card.querySelector('figcaption'));
    const renderer = new WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(devicePixelRatio);
    const scene = new Scene();
    scene.add(new HemisphereLight('#fff3dc', '#5a4e3a', 1.35));
    const sun = new DirectionalLight('#fffaf0', 0.5);
    sun.position.set(-180, 320, 160);
    scene.add(sun);
    const ground = new Mesh(
      new PlaneGeometry(4, 4),
      new MeshStandardMaterial({ color: '#d5c5a0' }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground, figurine.object);
    const camera = new PerspectiveCamera(30, 1, 0.01, 50);
    views.push(() => {
      const { clientWidth: w, clientHeight: h } = canvas;
      if (canvas.width !== w * devicePixelRatio) renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const size = new Box3().setFromObject(figurine.object).getSize(new Vector3()).length() || 1;
      const angle = performance.now() / 4000;
      camera.position.set(Math.sin(angle) * size * 1.6, size * 0.9, Math.cos(angle) * size * 1.6);
      camera.lookAt(0, size * 0.2, 0);
      camera.updateProjectionMatrix();
      figurine.spin(1 / 60);
      renderer.render(scene, camera);
    });
  }
}

const frame = () => {
  for (const view of views) view();
  requestAnimationFrame(frame);
};
frame();
