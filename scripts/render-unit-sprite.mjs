/**
 * Renders a figurine GLB to a unit sprite (WebP, transparent, 512 px wide, cropped to the
 * figure) in the framing of `src/emblems/units/<nation>/*.webp`: three-quarter view from above,
 * a warm key light from the upper left and a cool fill. Nothing here is a game rule.
 *
 *   PLAYWRIGHT_DIR=<dir with playwright-core@1.58> node scripts/render-unit-sprite.mjs \
 *     <in.glb> <out.webp> [--azimuth deg] [--elevation deg]
 *
 * Without arguments: the eight artilleries, `src/emblems/figurines/<nation>/artillery.glb` to
 * `src/emblems/units/<nation>/artillery.webp`.
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const k = args.indexOf(`--${name}`);
  return k < 0 ? fallback : Number(args[k + 1]);
};
const positional = args.filter((a, k) => !a.startsWith('--') && !args[k - 1]?.startsWith('--'));
const NATIONS = ['france', 'uk', 'usa', 'ussr', 'germany', 'china', 'italy', 'japan'];
const jobs =
  positional.length >= 2
    ? [[resolve(positional[0]), resolve(positional[1])]]
    : NATIONS.map((n) => [
        `${root}src/emblems/figurines/${n}/artillery.glb`,
        `${root}src/emblems/units/${n}/artillery.webp`,
      ]);

const dir = process.env.PLAYWRIGHT_DIR;
if (!dir)
  throw new Error('PLAYWRIGHT_DIR absent : dossier hors dépôt où `npm i playwright-core@1.58`');
const { chromium } = createRequire(`${dir}/`)('playwright-core');

const page = `<!doctype html><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<canvas id="c"></canvas><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
window.render = async (glb, azimuth, elevation) => {
  const W = 1024, H = 1024;
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x6b5a48, 1.1));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.6);
  key.position.set(-4, 6, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfd0ff, 0.6);
  fill.position.set(5, 2, -3);
  scene.add(fill);
  const gltf = await new GLTFLoader().loadAsync(glb);
  scene.add(gltf.scene);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const a = THREE.MathUtils.degToRad(azimuth), e = THREE.MathUtils.degToRad(elevation);
  const cam = new THREE.PerspectiveCamera(25, 1, size / 20, size * 20);
  cam.position.copy(centre).add(new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(size * 2.2));
  cam.lookAt(centre);
  renderer.render(scene, cam);
  // Crop to the figure's alpha bounding box, then fit 512 px wide.
  const src = document.getElementById('c');
  const probe = document.createElement('canvas'); probe.width = W; probe.height = H;
  const px = probe.getContext('2d', { willReadFrequently: true }); px.drawImage(src, 0, 0);
  const d = px.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = document.createElement('canvas'); out.width = 512; out.height = Math.round((512 * h) / w);
  out.getContext('2d').drawImage(probe, x0, y0, w, h, 0, 0, out.width, out.height);
  const blob = await new Promise((r) => out.toBlob(r, 'image/webp', 0.9));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (const b of buf) s += String.fromCharCode(b);
  return btoa(s);
};
window.ready = true;
</script>`;

const types = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.html': 'text/html' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') return res.setHeader('content-type', 'text/html').end(page);
  const file = path.startsWith('/glb/') ? path.slice(4) : resolve(root, `.${path}`);
  const ok = path.startsWith('/node_modules/three/') || path.startsWith('/glb/');
  if (!ok || !existsSync(file)) return res.writeHead(404).end();
  res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const cache = `${homedir()}/Library/Caches/ms-playwright/chromium-1243`;
const app = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const executablePath = existsSync(`${cache}/chrome-mac-arm64/${app}`)
  ? `${cache}/chrome-mac-arm64/${app}`
  : undefined;
const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const tab = await browser.newPage();
tab.on('pageerror', (e) => console.error(e));
await tab.goto(origin);
await tab.waitForFunction(() => globalThis.ready);
for (const [glb, out] of jobs) {
  const b64 = await tab.evaluate(
    ([g, az, el]) => globalThis.render(g, az, el),
    [`/glb${glb}`, option('azimuth', 35), option('elevation', 28)],
  );
  writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(out);
}
await browser.close();
server.close();
