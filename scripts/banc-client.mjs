/**
 * **Le banc client** (#189) : ce que coûtent les gestes et la carte, au téléphone puis au bureau.
 *
 *     PLAYWRIGHT_DIR=/chemin/pw npm run banc:client -- [--profil telephone|bureau] [--passes 3]
 *       [--sortie dossier] [--heure instant] [--sans-build] [--photos] [--cpu motif] [--couches]
 *       [--demarrage] [--repos] [--epingles]
 *
 * Prérequis de `npm run capture` (Docker levé, fonctions déployées, `npm run demo:mondiale` —
 * `--niveaux --edition` donne des bâtiments et une presse). Le banc construit un build de prod
 * dans un dossier temporaire avec `VITE_BANC=1` (React de profilage, noms de fonctions gardés, la
 * carte exposée en `window.mapEngine`), le sert par `vite preview` sur :4173, puis joue le même
 * parcours `--passes` fois par profil, chaque passe dans un onglet neuf :
 *
 * - **téléphone** : 390×844, `deviceScaleFactor` 3, toucher, CPU ralenti ×4 (CDP) ;
 * - **bureau** : 1440×900, souris.
 *
 * Par geste : durée des images (rAF, médiane et p95), tâches longues, délai de l'entrée à la
 * première image qui suit la salve de commits React du geste, commits et composants rendus (le
 * hook de React DevTools : il voit chaque racine sans `<Profiler>` à poser dans l'arbre, et le
 * build de profilage y ajoute la durée des rendus) ; côté carte, images rendues par seconde,
 * temps JS de la boucle, temps GPU (`EXT_disjoint_timer_query_webgl2`, le GPU du poste et non
 * celui d'un téléphone), appels de dessin, et le temps CPU du processus GPU de Chrome par seconde
 * (composition et commandes GL, hors du thread principal), et le temps de style et de mise en page
 * du thread principal (`Performance.getMetrics`). Une fois par passe, après les gestes de
 * la carte : pixel ratio, tampon, carte d'ombres, programmes, textures, bandes floues ; après le
 * zoom à fond, les octets de géométrie du socle par niveau et par couche, et ceux de tous les
 * tampons WebGL (ceux-là de la première passe). Chaque chiffre est la médiane des passes. Sortie : `banc-client.json` et `banc-client.txt` dans
 * `--sortie`.
 *
 * Le haut de `ps` est imprimé avant de mesurer : un vérifieur ou un autre navigateur à côté
 * fausse tout.
 */
/* global window, document, requestAnimationFrame, WebGL2RenderingContext, addEventListener, getComputedStyle, innerWidth, innerHeight -- les fonctions passées à `page.evaluate` tournent dans la page. */
import { execFileSync, execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};
const root = fileURLToPath(new URL('..', import.meta.url));
const passes = Number(option('passes', 3));
const out = option('sortie', `${tmpdir()}/banc-client`);
const dist = `${out}/dist`;
const only = option('profil', null);
/** `--photos` : une capture après chaque geste de la première passe, pour voir ce qui a été joué. */
const photos = args.includes('--photos');
/** `--cpu <motif>` : le profil CPU des gestes dont le nom y répond (première passe), et ses
 *  fonctions les plus coûteuses en temps propre. */
const cpu = option('cpu', null) === null ? null : new RegExp(option('cpu'), 'i');
/** `--sans-ombres` : la lampe ne porte plus d'ombre, pour lire ce que coûtent les ombres. */
const shadowless = args.includes('--sans-ombres');
/** `--heure 2026-10-21T00:00Z` : le soleil tenu à cet instant (nuit, crépuscule), `?heure=` du build de banc. */
const heure = option('heure', null);
/** `--demarrage` : le démarrage seul — délai jusqu'à la première image de la carte, tâches
 *  longues jusqu'à la fin de l'attente, décodage de `coast.json` (`performance.measure` de la
 *  carte) — sans les gestes. */
const bootOnly = args.includes('--demarrage');
/** `--repos` : le démarrage, puis dix secondes de repos au cadrage d'arrivée (courants, vent),
 *  sans les autres gestes. */
const restOnly = args.includes('--repos');
/** `--couches` : le temps GPU d'une image complète, de loin puis de près, chaque couche coupée à
 *  son tour (#199) ; l'écart à l'image entière est ce que la couche coûte. */
const layered = args.includes('--couches');
/** `--epingles` : le démarrage, puis les seuls gestes des épingles au loin (#234) — à jouer sur
 *  `npm run demo:mondiale -- --epingles`, mille piles sur la France. */
const pinsOnly = args.includes('--epingles');
const PORT = 4173;
const origin = `http://localhost:${PORT}`;

const dir = process.env.PLAYWRIGHT_DIR;
if (!dir)
  throw new Error('PLAYWRIGHT_DIR absent : dossier hors dépôt où `npm i playwright-core@1.58`');
const { chromium } = createRequire(`${dir}/`)('playwright-core');

const env = readFileSync(`${root}.env.local`, 'utf8');
const convexUrl = env.match(/^VITE_CONVEX_URL=(.*)$/m)?.[1]?.trim() ?? '';
if (!['127.0.0.1', 'localhost'].includes(new URL(convexUrl).hostname))
  throw new Error(`Refus : VITE_CONVEX_URL (${convexUrl}) n'est pas local.`);
const accountsFile = `${root}scripts/demo-mondiale.accounts.json`;
if (!existsSync(accountsFile)) throw new Error('Pas de comptes de démo : `npm run demo:mondiale`.');
const accounts = JSON.parse(readFileSync(accountsFile, 'utf8'));

const PROFILES = {
  telephone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    cpu: 4,
  },
  bureau: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, cpu: 1 },
};

// --- la machine, le build, le serveur ---------------------------------------------------------
const load = execSync('ps -Ao %cpu,command | sort -nr | head -7', { encoding: 'utf8' })
  .split('\n')
  .filter((line) => !line.includes('banc-client'))
  .map((line) => line.slice(0, 110))
  .join('\n');
console.log(`Charge avant mesure :\n${load}`);

mkdirSync(`${out}/photos`, { recursive: true });
const vite = `${root}node_modules/vite/bin/vite.js`;
if (!args.includes('--sans-build')) {
  console.log('build de prod (VITE_BANC=1)…');
  execFileSync(process.execPath, [vite, 'build', '--outDir', dist, '--emptyOutDir'], {
    cwd: root,
    env: { ...process.env, VITE_BANC: '1' },
    stdio: 'ignore',
  });
}
if (
  await fetch(origin).then(
    (r) => r.ok,
    () => false,
  )
)
  throw new Error(`${origin} répond déjà : un autre serveur y mesurerait un autre build.`);
const server = spawn(
  process.execPath,
  [vite, 'preview', '--outDir', dist, '--port', String(PORT), '--strictPort'],
  { cwd: root, stdio: 'ignore' },
);
process.on('exit', () => server.kill());
// Interrompu (Ctrl-C, un `kill`), le banc ne laisse pas :4173 occupé pour le suivant.
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.kill();
    process.exit(1);
  });
for (let k = 0; ; k++) {
  if (
    await fetch(origin).then(
      (r) => r.ok,
      () => false,
    )
  )
    break;
  if (k > 50) throw new Error(`vite preview muet sur ${origin}`);
  await new Promise((resolve) => setTimeout(resolve, 200));
}

/** Les processus GPU de Chrome for Testing : ceux d'avant le lancement ne sont pas les nôtres. */
const gpuProcesses = () =>
  execSync('ps -Ao pid,command', { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.includes('Chrome for Testing') && line.includes('--type=gpu-process'))
    .map((line) => line.trim().split(/\s+/)[0]);
/** Le temps CPU cumulé d'un processus, en ms (`ps -o time` : m:ss.cc). */
const cpuTimeMs = (pid) => {
  const [minutes, seconds] = execSync(`ps -o time= -p ${pid}`, { encoding: 'utf8' })
    .trim()
    .split(':');
  return (Number(minutes) * 60 + Number(seconds)) * 1000;
};
const foreignGpu = new Set(gpuProcesses());
const cache = `${homedir()}/Library/Caches/ms-playwright/chromium-1243`;
const app = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({
  executablePath: existsSync(`${cache}/chrome-mac-arm64/${app}`)
    ? `${cache}/chrome-mac-arm64/${app}`
    : `${cache}/chrome-mac/${app}`,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'],
});

// --- ce que la page relève -------------------------------------------------------------------
/** Posé avant tout script de la page : le hook de React DevTools, les images, les tâches longues. */
function instrument() {
  const B = {
    on: false,
    t0: 0,
    firstInput: null,
    frames: [],
    commits: [],
    names: {},
    longtasks: [],
    renders: [],
  };
  window.__banc = B;
  /** **Le démarrage** : la première image de la carte (son premier appel de dessin) et toutes les
   *  tâches longues depuis l'ouverture du document, sans attendre que le banc mesure. */
  B.boot = { firstDraw: null, longtasks: [] };
  for (const name of ['drawElements', 'drawArrays']) {
    const draw = WebGL2RenderingContext.prototype[name];
    WebGL2RenderingContext.prototype[name] = function (...rest) {
      if (B.boot.firstDraw === null) B.boot.firstDraw = performance.now();
      return draw.apply(this, rest);
    };
  }
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) B.boot.longtasks.push([e.startTime, e.duration]);
  }).observe({ type: 'longtask', buffered: true });
  /** **La mémoire des textures**, estimée : `renderer.info.memory` ne compte que des objets. Chaque
   *  téléversement de niveau 0 pèse largeur × hauteur × octets du format, une chaîne de mips un
   *  tiers de plus ; `texStorage2D` donne déjà toute la chaîne. */
  const GL2 = WebGL2RenderingContext.prototype;
  const sized = new Map();
  const bound = {};
  const perPixel = (gl, format) =>
    [gl.R8, gl.RED, gl.LUMINANCE, gl.ALPHA, gl.R8UI].includes(format)
      ? 1
      : [gl.RG8, gl.RG].includes(format)
        ? 2
        : [gl.RGBA16F, gl.RG32F].includes(format)
          ? 8
          : gl.RGBA32F === format
            ? 16
            : 4;
  const bindTexture = GL2.bindTexture;
  GL2.bindTexture = function (target, texture) {
    bound[target] = texture;
    return bindTexture.call(this, target, texture);
  };
  const texImage2D = GL2.texImage2D;
  GL2.texImage2D = function (target, level, format, ...rest) {
    if (level === 0 && bound[target]) {
      const source = rest.length >= 5 ? null : rest[2];
      const width = rest.length >= 5 ? rest[0] : (source?.width ?? source?.videoWidth ?? 0);
      const height = rest.length >= 5 ? rest[1] : (source?.height ?? source?.videoHeight ?? 0);
      sized.set(bound[target], {
        bytes: width * height * perPixel(this, format),
        mips: false,
        size: `${width}×${height}`,
      });
    }
    return texImage2D.call(this, target, level, format, ...rest);
  };
  const texStorage2D = GL2.texStorage2D;
  GL2.texStorage2D = function (target, levels, format, width, height) {
    if (bound[target]) {
      const base = width * height * perPixel(this, format);
      sized.set(bound[target], {
        bytes: levels > 1 ? (base * 4) / 3 : base,
        mips: true,
        size: `${width}×${height}`,
      });
    }
    return texStorage2D.call(this, target, levels, format, width, height);
  };
  const generateMipmap = GL2.generateMipmap;
  GL2.generateMipmap = function (target) {
    const entry = bound[target] && sized.get(bound[target]);
    if (entry && !entry.mips) {
      entry.bytes = (entry.bytes * 4) / 3;
      entry.mips = true;
    }
    return generateMipmap.call(this, target);
  };
  const deleteTexture = GL2.deleteTexture;
  GL2.deleteTexture = function (texture) {
    sized.delete(texture);
    return deleteTexture.call(this, texture);
  };
  /** **Les octets de géométrie** que le GPU tient : chaque `bufferData` de sommets ou d'index, à
   *  sa taille, rendu par `deleteBuffer`. */
  const buffers = new Map();
  const boundBuffer = {};
  const bindBuffer = GL2.bindBuffer;
  GL2.bindBuffer = function (target, buffer) {
    boundBuffer[target] = buffer;
    return bindBuffer.call(this, target, buffer);
  };
  const bufferData = GL2.bufferData;
  GL2.bufferData = function (target, data, ...rest) {
    if (boundBuffer[target])
      buffers.set(boundBuffer[target], typeof data === 'number' ? data : (data?.byteLength ?? 0));
    return bufferData.call(this, target, data, ...rest);
  };
  const deleteBuffer = GL2.deleteBuffer;
  GL2.deleteBuffer = function (buffer) {
    buffers.delete(buffer);
    return deleteBuffer.call(this, buffer);
  };
  B.bufferBytes = () => [...buffers.values()].reduce((sum, bytes) => sum + bytes, 0);
  B.textureBytes = () => [...sized.values()].reduce((sum, { bytes }) => sum + bytes, 0);
  /** Les plus lourdes, en Mo, avec leur taille : ce que la mémoire des textures paie d'abord. */
  B.heaviest = () =>
    [...sized.values()]
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 6)
      .map(({ bytes, size }) => `${size} ${(bytes / 2 ** 20).toFixed(1)}`);
  const tick = (t) => {
    if (B.on) B.frames.push(t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  new PerformanceObserver((list) => {
    if (B.on) for (const e of list.getEntries()) B.longtasks.push([e.startTime, e.duration]);
  }).observe({ type: 'longtask' });
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart'])
    addEventListener(
      type,
      (event) => {
        if (B.on && B.firstInput === null) B.firstInput = event.timeStamp;
      },
      { capture: true, passive: true },
    );
  const PERFORMED_WORK = 1;
  const nameOf = (fiber) => {
    const type = fiber.tag === 14 ? fiber.type.type : fiber.type;
    return type?.displayName || type?.name || type?.render?.name || '?';
  };
  /** Seuls les sous-arbres qui portent `PerformedWork` sont parcourus : une branche sautée par
   *  React garde les drapeaux de son dernier rendu, qu'il ne faut pas compter. */
  const walk = (fiber) => {
    let rendered = 0;
    const stack = [fiber];
    while (stack.length) {
      const node = stack.pop();
      if (node.sibling && node !== fiber) stack.push(node.sibling);
      const component = [0, 11, 14, 15].includes(node.tag);
      if (component && node.flags & PERFORMED_WORK) {
        rendered++;
        const name = nameOf(node);
        B.names[name] = (B.names[name] ?? 0) + 1;
      }
      if (node.child && node.subtreeFlags & PERFORMED_WORK) stack.push(node.child);
    }
    return rendered;
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    inject(renderer) {
      this.renderers.set(1, renderer);
      return 1;
    },
    checkDCE() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_id, fiberRoot) {
      if (!B.on) return;
      const at = performance.now();
      const rendered = walk(fiberRoot.current);
      B.commits.push([at, fiberRoot.current.actualDuration ?? 0, rendered]);
    },
  };
  /** La carte, une fois montée : chaque tour de boucle et chaque rendu, chronométrés. */
  const watchMap = () => {
    const engine = window.mapEngine;
    if (!engine) return setTimeout(watchMap, 200);
    const renderer = engine.renderer;
    const gl = renderer.getContext();
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const pending = [];
    let current = null;
    const render = renderer.render.bind(renderer);
    renderer.render = (scene, camera) => {
      const record = { t: performance.now(), whole: renderer.shadowMap.needsUpdate, gpu: null };
      const query = timer && B.on ? gl.createQuery() : null;
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      render(scene, camera);
      if (query) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        pending.push([query, record]);
      }
      record.calls = renderer.info.render.calls;
      record.triangles = renderer.info.render.triangles;
      if (B.on) B.renders.push(record);
      current = record;
    };
    const loop = engine.loop;
    engine.loop = () => {
      const start = performance.now();
      current = null;
      loop();
      if (current) current.loopMs = performance.now() - start;
    };
    const poll = () => {
      requestAnimationFrame(poll);
      if (!timer) return;
      const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
      for (let k = pending.length - 1; k >= 0; k--) {
        const [query, record] = pending[k];
        if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue;
        if (!disjoint) record.gpu = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(query);
        pending.splice(k, 1);
      }
    };
    requestAnimationFrame(poll);
  };
  addEventListener('DOMContentLoaded', watchMap);
}

/** La carte au repos, une fois par passe : ce qu'elle dessine et à quelle taille. */
function mapStatic() {
  const engine = window.mapEngine;
  const renderer = engine.renderer;
  const gl = renderer.getContext();
  const bands = [...document.querySelectorAll('div')].filter((node) => {
    const filter = getComputedStyle(node).backdropFilter;
    return filter && filter !== 'none' && !/blur\(0(px)?\)/.test(filter);
  });
  return {
    pixelRatio: renderer.getPixelRatio(),
    buffer: `${renderer.domElement.width}×${renderer.domElement.height}`,
    pixels: renderer.domElement.width * renderer.domElement.height,
    msaa: gl.getParameter(gl.SAMPLES),
    shadowMap: engine.lamp.light.shadow.mapSize.x,
    shadowType: renderer.shadowMap.type,
    programs: renderer.info.programs.length,
    textures: renderer.info.memory.textures,
    textureMB: window.__banc.textureBytes() / 2 ** 20,
    heaviest: window.__banc.heaviest(),
    geometries: renderer.info.memory.geometries,
    blurBands: bands.map((node) => getComputedStyle(node).backdropFilter),
  };
}

/**
 * **La géométrie du socle**, en Mo d'attributs et d'index, à chaque niveau de l'atlas (ADR 0034)
 * — tenus ensemble une fois le près construit — puis tous les tampons que WebGL garde.
 */
function geometryBytes() {
  const E = window.mapEngine;
  const seen = new Set();
  const bytesOf = (geometries) => {
    let bytes = 0;
    for (const geometry of geometries)
      for (const attribute of [...Object.values(geometry.attributes), geometry.index]) {
        const array = attribute?.isInterleavedBufferAttribute
          ? attribute.data.array
          : attribute?.array;
        if (!array || seen.has(array)) continue;
        seen.add(array);
        bytes += array.byteLength;
      }
    return bytes / 2 ** 20;
  };
  const meshesOf = (group) => group?.children.map((mesh) => mesh.geometry) ?? [];
  const levels = {};
  for (const [label, level, detail] of [
    ['loin', E.farLevel, 'far'],
    ['près', E.nearLevel, 'near'],
  ]) {
    if (!level) continue;
    levels[label] = {
      terre: bytesOf(level.lands.values()),
      encre: bytesOf([level.ink]),
      côte: bytesOf([level.coast]),
      lavis: bytesOf([level.wash]),
      régions: bytesOf(E.regions.lineLevels[detail] ? [E.regions.lineLevels[detail]] : []),
      contours: bytesOf(meshesOf(E.regions.contours.levels[detail])),
    };
  }
  return { levels, buffersMB: window.__banc.bufferBytes() / 2 ** 20 };
}

/**
 * **Ce que coûte chaque couche** (#199) : le GPU d'une image complète, médiane d'une seconde et
 * demie d'images remuées, la carte entière puis chaque couche retirée du rendu (masque de calques
 * vidé : ni dessinée, ni portée dans les ombres). Les ombres se coupent à la passe, la mer par un
 * matériau uni à la place du sien.
 */
async function layerCosts() {
  const E = window.mapEngine;
  const B = window.__banc;
  const R = E.renderer;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const measure = async () => {
    B.renders = [];
    B.on = true;
    const start = performance.now();
    while (performance.now() - start < 1500) {
      E.invalidate();
      await sleep(100);
    }
    B.on = false;
    await sleep(400);
    const gpu = B.renders
      .slice(6)
      .filter((r) => r.whole && r.gpu !== null)
      .map((r) => r.gpu)
      .sort((a, b) => a - b);
    return gpu.length ? gpu[gpu.length >> 1] : null;
  };
  const hide = (roots) => () => {
    const saved = [];
    for (const root of roots)
      root?.traverse((node) => {
        saved.push([node, node.layers.mask]);
        node.layers.mask = 0;
      });
    return () => {
      for (const [node, mask] of saved) node.layers.mask = mask;
    };
  };
  const scene = E.scene;
  const shade = scene.children.find((node) => node.material?.uniforms?.depth !== undefined);
  const ribbons = E.ambience.layers.map(({ layer }) => layer);
  const ribbon = (fx) => ribbons.find((l) => l.constructor.name === 'RibbonLayer' && l.fx === fx);
  const layers = [
    [
      'ombres',
      () => {
        R.shadowMap.enabled = false;
        return () => (R.shadowMap.enabled = true);
      },
    ],
    ['voile de nuit', hide([shade])],
    ['villes', hide([E.night.cities])],
    ['dessins et lavis', hide([E.drawings.drawing])],
    ['contours', hide([E.regions.contours.group])],
    ['régions', hide([E.regions.lines, E.regions.held, E.regions.hoverOutline])],
    ['halos', hide([E.halos.object])],
    ['courants', hide([ribbon('sea')?.mesh])],
    ['vent', hide([ribbon('wind')?.mesh])],
    ['pièces', hide([E.standing.group, E.maquettes.group, E.camps.group])],
    ['fils', hide([E.arcs.group, E.ink.group])],
    ['pays', hide(E.countries)],
    ['frontières', hide([E.borders, E.coast])],
    [
      'mer (shader)',
      () => {
        // Le même matériau sans la houle de `SeaLayer.swell` : ce que coûtent écume, rose et marbrure.
        const material = E.surface.material;
        const plain = material.clone();
        plain.onBeforeCompile = () => {};
        plain.customProgramCacheKey = () => 'banc-plain';
        E.surface.material = plain;
        return () => {
          E.surface.material = material;
          plain.dispose();
        };
      },
    ],
  ];
  // Chaque couche se compare à l'image entière mesurée juste avant elle : la carte d'un
  // téléphone ralenti dérive d'une seconde à l'autre, une seule image de référence fausserait tout.
  const wholes = [];
  const costs = {};
  for (const [name, cut] of layers) {
    const whole = await measure();
    const restore = cut();
    const without = await measure();
    restore();
    wholes.push(whole);
    costs[name] = whole === null || without === null ? null : whole - without;
  }
  const sorted = wholes.filter((w) => w !== null).sort((a, b) => a - b);
  return { whole: sorted.length ? sorted[sorted.length >> 1] : null, costs };
}

/** Pose la caméra à `distance` du point regardé (`lonLat`, sinon celui du moment). */
function frameAt([lonLat, distance]) {
  const E = window.mapEngine;
  const target = lonLat === null ? E.controls.target.clone() : E.frame.projectLonLat(lonLat, 0);
  const away = E.camera.position.clone().sub(E.controls.target).normalize();
  E.controls.target.copy(target);
  E.camera.position.copy(target).addScaledVector(away, distance);
  E.controls.update();
  E.invalidate();
}

// --- le parcours --------------------------------------------------------------------------------
const quantile = (xs, q) => {
  const sorted = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null;
};
const median = (xs) => quantile(xs, 0.5);
const round = (x, digits = 1) => (x === null ? null : Math.round(x * 10 ** digits) / 10 ** digits);

async function play(profileName, pass) {
  const profile = PROFILES[profileName];
  const phone = profile.isMobile === true;
  const context = await browser.newContext(profile);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`));
  await page.addInitScript(instrument);
  const cdp = await context.newCDPSession(page);
  // Le coût du style et de la mise en page, que ni React ni la carte ne voient (#199).
  await cdp.send('Performance.enable');
  const mainThread = async () =>
    Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]),
    );
  await page.goto(`${origin}/connexion`);
  await page.getByLabel('nom de guerre').fill(accounts.a.nickname);
  await page.getByLabel('mot de passe').fill(accounts.a.password);
  await page.getByRole('button', { name: 'entrer' }).click();
  await page.waitForURL('**/accueil', { timeout: 15000 });
  // Le ralenti avant le plateau : le démarrage se mesure au téléphone qu'il simule.
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  await page.goto(
    `${origin}/plateau?season=${accounts.seasonId}${heure === null ? '' : `&heure=${heure}`}`,
  );
  const understood = page.getByRole('button', { name: /compris/i }).first();
  if (
    await understood.waitFor({ timeout: 8000 }).then(
      () => true,
      () => false,
    )
  )
    await understood.click();
  await page.waitForFunction(() => window.mapEngine !== undefined);
  if (shadowless) await page.evaluate(() => (window.mapEngine.renderer.shadowMap.enabled = false));
  const gpu = gpuProcesses().find((pid) => !foreignGpu.has(pid));
  await page.waitForTimeout(8000);
  const boot = await page.evaluate(() => {
    const { firstDraw, longtasks } = window.__banc.boot;
    const decoded = performance.getEntriesByName('coast.json décodé')[0];
    return {
      mapMs: firstDraw === null ? null : Math.round(firstDraw),
      longTasks: longtasks.length,
      longTaskMs: Math.round(longtasks.reduce((sum, [, ms]) => sum + ms, 0)),
      longestMs: Math.round(Math.max(0, ...longtasks.map(([, ms]) => ms))),
      coastDecodeMs: decoded ? Math.round(decoded.duration * 10) / 10 : null,
      coastAtMs: decoded ? Math.round(decoded.startTime + decoded.duration) : null,
    };
  });
  console.log(`${profileName} : démarrage ${JSON.stringify(boot)}`);
  if (bootOnly) {
    await context.close();
    return { boot };
  }
  const { width, height } = profile.viewport;
  /** Le cadrage d'arrivée : celui du repos, et le « loin » des couches. */
  const home = await page.evaluate(() => {
    const E = window.mapEngine;
    const t = E.controls.target;
    return [
      E.frame.lonLatAt(t.x + E.frame.centerX, t.z + E.frame.centerY),
      E.camera.position.distanceTo(t),
    ];
  });

  const results = {};
  const gesture = async (name, act, settle = 1200) => {
    await page.evaluate(() => {
      const B = window.__banc;
      Object.assign(B, { on: true, t0: performance.now(), firstInput: null });
      for (const key of ['frames', 'commits', 'longtasks', 'renders']) B[key] = [];
      B.names = {};
    });
    const profiled = cpu !== null && pass === 0 && cpu.test(name);
    if (profiled) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
    }
    const gpuBefore = gpu ? cpuTimeMs(gpu) : 0;
    const threadBefore = await mainThread();
    await act();
    await page.waitForTimeout(settle);
    const gpuAfter = gpu ? cpuTimeMs(gpu) : 0;
    const threadAfter = await mainThread();
    const spent = (metric) => round((threadAfter[metric] - threadBefore[metric]) * 1000, 0);
    if (profiled) {
      const { profile } = await cdp.send('Profiler.stop');
      const file = `${out}/${profileName}-${name.replace(/\W+/g, '-')}.cpuprofile`;
      writeFileSync(file, JSON.stringify(profile));
      console.log(`profil CPU « ${name} » → ${file}\n${hottest(profile)}`);
    }
    const raw = await page.evaluate(() => {
      const B = window.__banc;
      B.on = false;
      return { ...B, end: performance.now() };
    });
    results[name] = summarize(raw);
    results[name].gpuProcessMsPerS = round((gpuAfter - gpuBefore) / results[name].seconds, 0);
    results[name].styleMs = spent('RecalcStyleDuration');
    results[name].layoutMs = spent('LayoutDuration');
    results[name].distance = round(await page.evaluate(() => window.mapEngine.cameraDistance()));
    if (photos && pass === 0)
      await page.screenshot({
        path: `${out}/photos/${profileName}-${name.replace(/\W+/g, '-')}.png`,
      });
  };
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([x, y], id) => ({ x, y, id })),
    });
  /** Un ou deux doigts, de `from` à `to` (listes de points), en `ms`. */
  const fingers = async (from, to, ms = 900) => {
    await touch('touchStart', from);
    const steps = Math.round(ms / 16);
    for (let k = 1; k <= steps; k++) {
      const at = from.map(([x, y], i) => [
        x + ((to[i][0] - x) * k) / steps,
        y + ((to[i][1] - y) * k) / steps,
      ]);
      await touch('touchMove', at);
    }
    await touch('touchEnd', []);
  };
  const drag = async (button, from, to, ms = 900) => {
    await page.mouse.move(...from);
    await page.mouse.down({ button });
    await page.mouse.move(...to, { steps: Math.round(ms / 16) });
    await page.mouse.up({ button });
  };
  const tap = (locator) => (phone ? locator.tap() : locator.click());
  const close = async () => {
    const button = page.getByRole('button', { name: /^fermer$/i }).first();
    if (phone && (await button.isVisible().catch(() => false))) await button.tap();
    else await page.keyboard.press('Escape');
  };
  const link = (name) => page.getByRole('link', { name }).first();
  const button = (name) => page.getByRole('button', { name }).first();
  const menu = () => tap(button(/ouvrir le menu des surfaces/));

  // Le journal s'ouvre seul à l'arrivée quand des dépêches attendent : on part de la carte nue.
  for (let k = 0; k < 3; k++) {
    if (
      !(await page
        .getByRole('button', { name: /^fermer$/i })
        .first()
        .isVisible())
    )
      break;
    await close();
    await page.waitForTimeout(800);
  }

  // Les surfaces : au téléphone par le menu (ou la fiche de nation pour les réglages).
  const surfaces = phone
    ? [
        ['journal', menu, () => link(/^journal/i)],
        ['presse', menu, () => link(/^presse/i)],
        ['télégraphe', menu, () => link(/^télégraphe/i)],
        ['abaque', menu, () => link(/^abaque/i)],
        ['recherche', menu, () => link(/^recherche/i)],
        ['nation', menu, () => link(/^nation/i)],
        ['à faire', menu, () => button(/^à faire/i)],
        [
          'réglages',
          () => tap(button(/^France$/)),
          () => page.getByText('Réglages', { exact: true }),
        ],
      ]
    : [
        ['journal', null, () => link(/^Journal d’événements/)],
        ['presse', null, () => link(/^Presse/)],
        ['télégraphe', null, () => link(/^Télégraphe/)],
        ['abaque', null, () => link(/^Abaque de tir/)],
        ['recherche', null, () => button(/^recherche$/)],
        ['nation', null, () => link(/fiche de nation/)],
        ['réglages', null, () => link(/^Réglages$/)],
      ];
  if (restOnly) {
    await gesture('repos 10 s', () => page.waitForTimeout(10000), 0);
    await context.close();
    return { boot, results };
  }
  /**
   * **Les épingles au loin** (#234) : la France vue de loin, où chaque pièce est une épingle et où
   * les grappes se refont à chaque pas de la caméra ; puis la bascule, de loin jusqu'aux figurines
   * et retour ; puis le repos, où la couche ne doit rien demander.
   */
  const pinGestures = async () => {
    await page.evaluate(frameAt, [[2.5, 46.8], 90]);
    await page.waitForTimeout(2500);
    const [cx, cy] = [Math.round(width / 2), Math.round(height * 0.45)];
    await gesture(
      'épingles glisser',
      async () => {
        for (let k = 0; k < 2; k++)
          if (phone) {
            await fingers([[cx - 80, cy]], [[cx + 80, cy + 60]]);
            await fingers([[cx + 80, cy + 60]], [[cx - 80, cy]]);
          } else {
            await drag('middle', [cx - 150, cy], [cx + 150, cy + 100]);
            await drag('middle', [cx + 150, cy + 100], [cx - 150, cy]);
          }
      },
      1700,
    );
    await gesture(
      'épingles bascule',
      async () => {
        if (phone) {
          const pair = (half) => [
            [cx - half, cy],
            [cx + half, cy],
          ];
          await fingers(pair(30), pair(140));
          await fingers(pair(140), pair(30));
          return;
        }
        await page.mouse.move(cx, cy);
        for (const dy of [...Array(8).fill(-120), ...Array(8).fill(120)]) {
          await page.mouse.wheel(0, dy);
          await page.waitForTimeout(60);
        }
      },
      1700,
    );
    await page.waitForTimeout(3000);
    await gesture('épingles repos 5 s', () => page.waitForTimeout(5000), 0);
  };
  if (pinsOnly) {
    await pinGestures();
    await context.close();
    return { boot, results };
  }
  if (phone) await gesture('menu des surfaces', menu).then(close);
  for (const [name, before, target] of surfaces) {
    if (before) {
      await before();
      await page.waitForTimeout(600);
    }
    await gesture(`ouvrir ${name}`, () => tap(target()));
    if (name === 'abaque')
      await gesture('trier abaque', () =>
        phone
          ? page.getByLabel('statistique à classer').selectOption({ index: 2 })
          : page.locator('thead button').nth(2).click(),
      );
    if (name === 'journal') {
      const box = await page.evaluate(() => {
        const scrollers = [...document.querySelectorAll('*')].filter((node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          const cx = rect.x + rect.width / 2;
          const cy = rect.y + rect.height / 2;
          return (
            /auto|scroll/.test(style.overflowY) &&
            node.scrollHeight > node.clientHeight + 20 &&
            cx > 0 &&
            cx < innerWidth &&
            cy > 0 &&
            cy < innerHeight &&
            node.contains(document.elementFromPoint(cx, cy))
          );
        });
        const largest = scrollers.sort((a, b) => b.clientHeight - a.clientHeight)[0];
        if (!largest) return null;
        const rect = largest.getBoundingClientRect();
        return {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          room: largest.scrollHeight - largest.clientHeight,
        };
      });
      if (!box) console.log('journal trop court pour défiler : geste non mesuré');
      else
        await gesture('défiler journal', async () => {
          for (const yDistance of [-600, 600])
            await cdp.send('Input.synthesizeScrollGesture', {
              x: Math.round(box.x),
              y: Math.round(box.y),
              yDistance,
              speed: 1200,
              gestureSourceType: phone ? 'touch' : 'mouse',
            });
        });
    }
    await gesture(`fermer ${name}`, close);
  }
  if (!phone) {
    const todo = button(/\d+ à faire$/);
    for (let k = 0; k < 2; k++) {
      const open = (await todo.getAttribute('aria-expanded')) === 'true';
      await gesture(open ? 'replier à faire' : 'déplier à faire', () => todo.click());
    }
  }

  // Le plateau personnel : la poignée, replié → mi-hauteur → plein → replié au téléphone.
  if (phone) {
    await gesture('plateau mi-hauteur', () => tap(button(/déplier le plateau personnel/)));
    await gesture('plateau plein', () => tap(button(/agrandir le plateau personnel/)));
    await gesture('plateau replié', () => tap(button(/replier le plateau personnel/)));
  } else {
    await gesture('plateau déplié', () => button(/^Plateau personnel$/).click());
    await gesture('plateau replié', () => button(/^Plateau personnel$/).click());
  }

  // La fiche d'un bâtiment : son étiquette quand la carte la montre (de loin, au téléphone),
  // sinon le point de l'écran où le rayon du moteur trouve la maquette et non une pièce devant.
  const at = await page.evaluate(() => {
    const engine = window.mapEngine;
    const canvas = engine.renderer.domElement;
    const inside = (x, y) => y > innerHeight * 0.15 && y < innerHeight * 0.7;
    for (const label of document.querySelectorAll('.label--building')) {
      const rect = label.getBoundingClientRect();
      const [x, y] = [rect.left + rect.width / 2, rect.top + rect.height / 2];
      if (inside(x, y) && label.contains(document.elementFromPoint(x, y))) return [x, y];
    }
    const box = canvas.getBoundingClientRect();
    for (const id of engine.maquettes.byId.keys()) {
      const rect = id.startsWith('building-') ? engine.pieceRect(id) : null;
      if (rect === null) continue;
      for (let i = 1; i < 6; i++)
        for (let j = 1; j < 6; j++) {
          const x = box.left + rect.left + ((rect.right - rect.left) * i) / 6;
          const y = box.top + rect.top + ((rect.bottom - rect.top) * j) / 6;
          if (
            inside(x, y) &&
            document.elementFromPoint(x, y) === canvas &&
            engine.castAt(x, y) &&
            engine.pieceUnder()?.id === id
          )
            return [x, y];
        }
    }
    return null;
  });
  if (at === null) console.log('aucun bâtiment dégagé à l’écran : fiche non mesurée');
  else {
    await gesture('ouvrir fiche bâtiment', () =>
      phone ? page.touchscreen.tap(...at) : page.mouse.click(...at),
    );
    if (page.url().includes('building')) await gesture('fermer fiche bâtiment', close);
    else console.log(`fiche restée fermée : ${page.url()}`);
  }

  // La carte : déplacer, zoomer, incliner, d'un point de mer en haut à gauche.
  /** Le point libre de la carte le plus proche : une carte d'interface posée dessus (la colonne
   *  « en cours » au téléphone) prendrait le geste, et la caméra ne bougerait pas. Libre aussi à
   *  `±spread` en x, où se posent les doigts d'un pincement : une étiquette ou une pièce sous l'un
   *  d'eux en ferait une prise, et le pincement ne zoomerait pas (#199). */
  const free = ([x, y], spread = [0]) =>
    page.evaluate(
      ([x0, y0, offsets]) => {
        const engine = window.mapEngine;
        const canvas = engine.renderer.domElement;
        const open = (x, y) =>
          document.elementFromPoint(x, y) === canvas &&
          !(engine.castAt(x, y) && engine.pieceUnder() !== null);
        for (let r = 0; r < 300; r += 10)
          for (let a = 0; a < 16; a++) {
            const x = Math.round(x0 + r * Math.cos((a * Math.PI) / 8));
            const y = Math.round(y0 + r * Math.sin((a * Math.PI) / 8));
            if (offsets.every((dx) => open(x - dx, y) && open(x + dx, y))) return [x, y];
          }
        return [x0, y0];
      },
      [x, y, spread],
    );
  const PINCH = [0, 30, 60, 100, 140, 160];
  const sea = await free([Math.round(width * 0.3), Math.round(height * 0.32)]);
  const centre = await free(
    [Math.round(width / 2), Math.round(height * 0.45)],
    phone ? PINCH : [0],
  );
  const by = ([x, y], dx, dy) => [x + dx, y + dy];
  if (phone) {
    await gesture(
      'carte déplacer',
      async () => {
        for (let k = 0; k < 2; k++) {
          await fingers([sea], [by(sea, 120, 180)]);
          await fingers([by(sea, 120, 180)], [sea]);
        }
      },
      1700,
    );
    await gesture(
      'carte zoomer',
      async () => {
        const [x, y] = centre;
        await fingers(
          [
            [x - 30, y],
            [x + 30, y],
          ],
          [
            [x - 140, y],
            [x + 140, y],
          ],
        );
        await fingers(
          [
            [x - 140, y],
            [x + 140, y],
          ],
          [
            [x - 30, y],
            [x + 30, y],
          ],
        );
      },
      1700,
    );
    await gesture(
      'carte incliner',
      async () => {
        const [x, y] = centre;
        await fingers(
          [
            [x - 60, y],
            [x + 60, y],
          ],
          [
            [x - 60, y - 160],
            [x + 60, y - 160],
          ],
        );
        await fingers(
          [
            [x - 60, y - 160],
            [x + 60, y - 160],
          ],
          [
            [x - 60, y],
            [x + 60, y],
          ],
        );
      },
      1700,
    );
  } else {
    await gesture(
      'carte déplacer',
      async () => {
        for (let k = 0; k < 2; k++) {
          await drag('middle', sea, by(sea, 300, 200));
          await drag('middle', by(sea, 300, 200), sea);
        }
      },
      1700,
    );
    await gesture(
      'carte zoomer',
      async () => {
        await page.mouse.move(...centre);
        for (const dy of [...Array(10).fill(-120), ...Array(10).fill(120)]) {
          await page.mouse.wheel(0, dy);
          await page.waitForTimeout(60);
        }
      },
      1700,
    );
    await gesture(
      'carte incliner',
      async () => {
        await drag('left', sea, by(sea, 0, 160));
        await drag('left', by(sea, 0, 160), sea);
      },
      1700,
    );
  }
  // L'inertie d'un geste de la souris court encore deux secondes : le repos commence après.
  await page.waitForTimeout(3000);
  const statics = await page.evaluate(mapStatic);
  await gesture('repos 10 s', () => page.waitForTimeout(10000), 0);

  // De bout en bout : du cadrage d'arrivée au plancher, puis jusqu'au plafond (#199), visé au
  // large de la Bretagne : au plancher, un doigt du pincement posé sur une pièce la prendrait.
  await page.evaluate(frameAt, [[-6, 46.5], home[1]]);
  await page.waitForTimeout(2500);
  // Les étiquettes ont bougé avec les gestes d'avant : le point libre se recherche.
  const middle = await free(
    [Math.round(width / 2), Math.round(height * 0.45)],
    phone ? PINCH : [0],
  );
  const pinches = async (from, to, count) => {
    const [x, y] = middle;
    for (let k = 0; k < count; k++)
      await fingers(
        [
          [x - from, y],
          [x + from, y],
        ],
        [
          [x - to, y],
          [x + to, y],
        ],
      );
  };
  const wheel = async (dy, count) => {
    await page.mouse.move(...middle);
    for (let k = 0; k < count; k++) {
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(40);
    }
  };
  await gesture('zoomer à fond', () => (phone ? pinches(30, 160, 4) : wheel(-120, 80)), 1700);
  await gesture('dézoomer à fond', () => (phone ? pinches(160, 30, 5) : wheel(120, 100)), 1700);
  await pinGestures();
  // Le près et le loin ont tous deux été dessinés : chacun est sur le GPU.
  const geometry = await page.evaluate(geometryBytes);

  const near = [[2.4, 46.6], 30];
  let layers = null;
  if (layered) {
    await page.mouse.move(2, 2).catch(() => {});
    // Le GPU se mesure sans le CPU ralenti : une boucle qui traîne laisse le GPU baisser sa
    // fréquence entre deux images, et une couche retirée semblait alors coûter moins que rien.
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    layers = {};
    for (const [label, framing] of [
      ['près', near],
      ['loin', home],
    ]) {
      await page.evaluate(frameAt, framing);
      await page.waitForTimeout(2500);
      layers[label] = await page.evaluate(layerCosts);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  }
  // **Le port tenu** (#221) : la première prise télécharge la côte (`/coast.json`) et la décode,
  // puis le fantôme suit le pointeur au large de Calais — l'aimant à chaque pas.
  await page.evaluate(frameAt, [[1.6, 50.9], 12]);
  await page.waitForTimeout(2500);
  // Une fiche ouverte par les gestes d'avant tient la place du plateau, au téléphone.
  for (let k = 0; k < 3; k++) {
    if (!(await button(/^fermer$/i).isVisible())) break;
    await close();
    await page.waitForTimeout(800);
  }
  // Au téléphone, le plateau tiré par un geste d'avant peut être déjà déplié : on ne le déplie
  // qu'au besoin. Au bureau, il est replié et sa tuile est dans le DOM, cachée : on le déplie.
  if (!phone) await button(/^Plateau personnel$/).click();
  else if (await button(/déplier le plateau personnel/).isVisible())
    await tap(button(/déplier le plateau personnel/));
  await page.waitForTimeout(800);
  await gesture(
    'prendre un port',
    () => page.getByText('Port', { exact: true }).first().click(),
    2500,
  );
  const coastFile = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.endsWith('/coast.json'))
      .map((entry) => ({
        ms: Math.round(entry.duration),
        ko: Math.round(entry.encodedBodySize / 1024),
      }))
      .at(0),
  );
  if (coastFile)
    console.log(`${profileName} : /coast.json en ${coastFile.ms} ms, ${coastFile.ko} Ko`);
  const shore = await free([Math.round(width / 2), Math.round(height * 0.35)]);
  await gesture('aimant du port', async () => {
    for (let k = 0; k <= 40; k++) {
      await page.mouse.move(shore[0] - 160 + k * 8, shore[1] - 40 + k * 2);
      await page.waitForTimeout(35);
    }
  });
  await page.keyboard.press('Escape');
  // **La mine tenue** (#239) : les bassins de charbon et de fer s'éveillent, le fil vise le plus
  // proche, puis l'aimant le prend au passage du bassin du Nord.
  await page.evaluate(frameAt, [[2.9, 50.3], 12]);
  await page.waitForTimeout(2500);
  await gesture(
    'prendre une mine',
    // L'étiquette de la mine du Nord porte le même mot : la tuile est celle qu'on voit.
    () => page.getByText('Mine', { exact: true }).filter({ visible: true }).first().click(),
    2500,
  );
  const coalfield = await free([Math.round(width / 2), Math.round(height * 0.35)]);
  await gesture('aimant de la mine', async () => {
    for (let k = 0; k <= 40; k++) {
      await page.mouse.move(coalfield[0] - 160 + k * 8, coalfield[1] - 40 + k * 2);
      await page.waitForTimeout(35);
    }
  });
  await page.keyboard.press('Escape');
  await (phone ? button(/replier le plateau personnel/) : button(/^Plateau personnel$/))
    .click({ timeout: 3000 })
    .catch(() => {});

  // Une région sous le pointeur, et sa fiche : la France à mi-distance.
  await page.evaluate(frameAt, near);
  await page.waitForTimeout(2500);
  const land = await free([Math.round(width / 2), Math.round(height * 0.45)]);
  if (phone) {
    // Le toucher lit la région sous le doigt : Échap ferme ce qu'il ouvre.
    await gesture('toucher région', () => page.touchscreen.tap(...land));
    await page.keyboard.press('Escape');
  } else
    await gesture('survol région', async () => {
      for (let k = 0; k <= 40; k++) {
        await page.mouse.move(land[0] - 160 + k * 8, land[1] - 40 + k * 2);
        await page.waitForTimeout(35);
      }
    });

  await context.close();
  return { boot, statics, results, layers, geometry };
}

const BURST_MS = 150;

/** Les fonctions au plus grand temps propre d'un profil CPU, avec leur fichier et leur ligne. */
function hottest(profile, count = 15) {
  const self = new Map();
  const gaps = profile.timeDeltas;
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  profile.samples.forEach((id, k) => {
    const { functionName, url, lineNumber } = byId.get(id).callFrame;
    const key = `${functionName || '(anonyme)'} ${url.split('/').pop()}:${lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (gaps[k] ?? 0) / 1000);
  });
  return [...self]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key, ms]) => `  ${ms.toFixed(0).padStart(6)} ms  ${key}`)
    .join('\n');
}

/** Un geste relevé, réduit à ses chiffres. */
function summarize(raw) {
  const { frames, commits, longtasks, renders, names, t0, end, firstInput } = raw;
  const deltas = frames.slice(1).map((t, k) => t - frames[k]);
  const start = firstInput ?? t0;
  /** La salve du geste : les commits qui se suivent à moins de `BURST_MS` depuis l'entrée. Le
   *  battement d'une horloge, une seconde plus loin, n'en est pas. */
  let settled = start;
  for (const [at] of commits) if (at >= start && at - settled < BURST_MS) settled = at;
  const shown = frames.find((t) => t > settled);
  const seconds = (end - t0) / 1000;
  const whole = renders.filter((r) => r.whole);
  return {
    seconds: round(seconds, 2),
    frameMedianMs: round(median(deltas)),
    frameP95Ms: round(quantile(deltas, 0.95)),
    frameMaxMs: round(Math.max(0, ...deltas)),
    longTasks: longtasks.length,
    longTaskMs: round(
      longtasks.reduce((sum, [, ms]) => sum + ms, 0),
      0,
    ),
    latencyMs: shown === undefined ? null : round(shown - start, 0),
    commits: commits.length,
    rendered: commits.reduce((sum, [, , n]) => sum + n, 0),
    reactMs: round(commits.reduce((sum, [, ms]) => sum + ms, 0)),
    topComponents: Object.entries(names)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, n]) => `${name}×${n}`),
    mapFps: round(renders.length / seconds),
    mapWholeFps: round(whole.length / seconds),
    mapLoopMs: round(median(renders.map((r) => r.loopMs))),
    mapLoopP95Ms: round(
      quantile(
        renders.map((r) => r.loopMs),
        0.95,
      ),
    ),
    mapGpuMs: round(median(whole.map((r) => r.gpu)), 2),
    mapCalls: renders.length ? Math.max(...renders.map((r) => r.calls)) : null,
    mapTriangles: renders.length ? Math.max(...renders.map((r) => r.triangles)) : null,
  };
}

/** Les passes d'un profil, réduites à la médiane de chaque chiffre. */
function merge(runs) {
  const gestures = {};
  for (const name of Object.keys(runs[0].results)) {
    const each = runs.map((run) => run.results[name]).filter(Boolean);
    const merged = {};
    for (const key of Object.keys(each[0]))
      merged[key] = key === 'topComponents' ? each[0][key] : median(each.map((one) => one[key]));
    gestures[name] = merged;
  }
  let layers = null;
  if (runs[0].layers) {
    layers = {};
    for (const [label, first] of Object.entries(runs[0].layers)) {
      const wholes = runs.map((run) => run.layers[label].whole);
      const costs = {};
      for (const name of Object.keys(first.costs))
        costs[name] = round(median(runs.map((run) => run.layers[label].costs[name])), 2);
      layers[label] = { whole: round(median(wholes), 2), costs };
    }
  }
  return { statics: runs[0].statics, gestures, layers, geometry: runs[0].geometry };
}

const COLUMNS = [
  ['geste', 22],
  ['img méd', 7, 'frameMedianMs'],
  ['img p95', 7, 'frameP95Ms'],
  ['longues', 7, 'longTasks'],
  ['ms long', 7, 'longTaskMs'],
  ['délai', 6, 'latencyMs'],
  ['commits', 7, 'commits'],
  ['compos.', 7, 'rendered'],
  ['React ms', 8, 'reactMs'],
  ['carte/s', 7, 'mapFps'],
  ['JS carte', 8, 'mapLoopMs'],
  ['GPU ms', 6, 'mapGpuMs'],
  ['proc GPU', 8, 'gpuProcessMsPerS'],
  ['appels', 6, 'mapCalls'],
  ['style', 5, 'styleMs'],
  ['layout', 6, 'layoutMs'],
];
const table = (gestures) =>
  [
    COLUMNS.map(([title, w]) => title.padStart(w)).join(' '),
    ...Object.entries(gestures).map(([name, g]) =>
      COLUMNS.map(([, w, key], k) =>
        k === 0 ? name.padEnd(w) : String(g[key] ?? '–').padStart(w),
      ).join(' '),
    ),
  ].join('\n');

const report = {
  at: new Date().toISOString(),
  commit: (() => {
    try {
      return execSync('git rev-parse --short HEAD', {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      }).trim();
    } catch {
      return 'hors git';
    }
  })(),
  seasonId: accounts.seasonId,
  passes,
  load,
  profiles: {},
};
let text = `Banc client — ${report.commit}, ${passes} passes, médianes\n`;
try {
  for (const name of only ? [only] : Object.keys(PROFILES)) {
    const runs = [];
    for (let k = 0; k < passes; k++) {
      console.log(`${name} : passe ${k + 1}/${passes}`);
      runs.push(await play(name, k));
    }
    const boot = Object.fromEntries(
      Object.keys(runs[0].boot).map((key) => [key, median(runs.map((run) => run.boot[key]))]),
    );
    text += `\n== ${name} : démarrage ==\ncarte affichée ${boot.mapMs} ms ; ${boot.longTasks} tâches longues, ${boot.longTaskMs} ms (la plus longue ${boot.longestMs}) ; coast.json décodé en ${boot.coastDecodeMs} ms, prêt à ${boot.coastAtMs} ms\n`;
    if (bootOnly) {
      report.profiles[name] = { boot, runs };
      continue;
    }
    if (restOnly || pinsOnly) {
      const { gestures } = merge(runs);
      report.profiles[name] = { boot, gestures, runs };
      text += `${table(gestures)}\n`;
      continue;
    }
    const merged = merge(runs);
    report.profiles[name] = { boot, ...merged, runs };
    const s = merged.statics;
    text += `\n== ${name} ==\ncarte : pixel ratio ${s.pixelRatio}, tampon ${s.buffer}, MSAA ${s.msaa}, ombres ${shadowless ? 'coupées' : `${s.shadowMap}²`}, ${s.programs} programmes, ${s.textures} textures (~${round(s.textureMB)} Mo : ${s.heaviest.join(', ')}), ${s.blurBands.length} bandes floues\n${table(merged.gestures)}\n`;
    const { levels, buffersMB } = merged.geometry;
    text += `géométrie : ${round(buffersMB)} Mo de tampons WebGL ; ${Object.entries(levels)
      .map(
        ([label, layers]) =>
          `${label} ${round(Object.values(layers).reduce((sum, mb) => sum + mb, 0))} Mo (${Object.entries(
            layers,
          )
            .map(([layer, mb]) => `${layer} ${round(mb)}`)
            .join(', ')})`,
      )
      .join(' ; ')}\n`;
    for (const [label, { whole, costs }] of Object.entries(merged.layers ?? {}))
      text += `couches, ${label} : image entière ${whole} ms GPU ; ${Object.entries(costs)
        .map(([layer, ms]) => `${layer} ${ms ?? '–'}`)
        .join(', ')}\n`;
  }
} finally {
  await browser.close();
  server.kill();
}
writeFileSync(`${out}/banc-client.json`, JSON.stringify(report, null, 2));
writeFileSync(`${out}/banc-client.txt`, text);
console.log(`\n${text}\n→ ${out}/banc-client.json`);
