import { sharedAudio, soundNow, ticTac } from '@/data/audio';
import {
  onReturn,
  PHRASE_GAP_MS,
  queued,
  type DistanceStep,
  type FrontChange,
} from '@/domain/front-sound';
import { COARSE, NARROW } from '@/shell/viewport';

/**
 * **La ligne du front** (#405, maquette D `front-qui-s-entend/ligne.html`) : chaque changement
 * relevé fait une phrase — le tic du télégraphe, puis la voix de la chose, nette si c'est proche,
 * sourde et traînante si c'est loin, du côté d'où elle vient. Synthétisée en Web Audio comme les
 * bruits de la table : aucun fichier. Chaque phrase s'imprime sur la bande du télégraphe.
 */

// ---------- les voix (commun/son.js de la maquette) ----------

type Out = AudioNode;
let noiseBuffer: AudioBuffer | null = null;
const noise = (c: AudioContext): AudioBuffer => {
  if (noiseBuffer === null) {
    noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const wave = noiseBuffer.getChannelData(0);
    for (let i = 0; i < wave.length; i++) wave[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
};

type Shape = { a?: number; peak: number; hold?: number; rel: number };

function envelope(g: GainNode, t: number, { a = 0.005, peak, hold = 0, rel }: Shape): number {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  return t + a + hold + rel;
}

function osc(
  c: AudioContext,
  out: Out,
  t: number,
  {
    type = 'sine',
    f0,
    f1 = f0,
    ...shape
  }: Shape & { type?: OscillatorType; f0: number; f1?: number },
): number {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  const end = envelope(g, t, shape);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, end);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(end + 0.05);
  return end;
}

function burst(
  c: AudioContext,
  out: Out,
  t: number,
  {
    type = 'lowpass',
    f0,
    f1 = f0,
    q = 0.7,
    a = 0.003,
    ...shape
  }: Shape & { type?: BiquadFilterType; f0: number; f1?: number; q?: number },
): number {
  const s = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  s.buffer = noise(c);
  s.loop = true;
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  const end = envelope(g, t, { a, ...shape });
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, end);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 1.8);
  s.stop(end + 0.05);
  return end;
}

const jitter = (s: number) => (Math.random() * 2 - 1) * s;

const canon = (c: AudioContext, out: Out, t: number, force: number): number => {
  burst(c, out, t, { f0: 900, f1: 110, a: 0.012, peak: 0.26 * force, rel: 0.85 });
  osc(c, out, t, { f0: 64, f1: 33, a: 0.01, peak: 0.23 * force, rel: 0.7 });
  return burst(c, out, t + 0.06, { f0: 220, f1: 90, a: 0.1, peak: 0.08 * force, rel: 1.5 });
};

const cloche = (c: AudioContext, out: Out, t: number): number => {
  osc(c, out, t, { f0: 660, peak: 0.07, rel: 1.6 });
  return osc(c, out, t, { f0: 660 * 2.76, peak: 0.014, rel: 0.7 });
};

/** Chaque flotte a sa note (±4 %) : deux flottes ne se confondent pas. */
const noteOf = (key: string) =>
  0.96 + ([...key].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 9) / 100;

type Voice = (c: AudioContext, out: Out, t: number, change: FrontChange) => number;

const VOICES: Readonly<Record<FrontChange['nature'], Voice>> = {
  // deux coups de canon lointain, jamais au même pas
  combat: (c, out, t) => {
    canon(c, out, t, 0.7 + Math.random() * 0.3);
    return canon(c, out, t + 0.38 + Math.random() * 0.7, 0.7 + Math.random() * 0.3);
  },
  capture: (c, out, t) => cloche(c, out, t),
  // la corne d'un navire : une tierce grave et ronde
  fleet: (c, out, t, change) => {
    const k = noteOf(change.key);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 620;
    f.Q.value = 1.4;
    f.connect(out);
    const blast = { type: 'sawtooth' as const, hold: 1, rel: 0.7 };
    osc(c, f, t, { ...blast, f0: 98 * k, f1: 95 * k, a: 0.28, peak: 0.075 });
    return osc(c, f, t, { ...blast, f0: 123.5 * k, f1: 120 * k, a: 0.32, peak: 0.055 });
  },
  // une colonne en marche : quatre pas sourds, un cliquetis tous les deux
  column: (c, out, t) => {
    let end = t;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const at = t + i * 0.5 + jitter(0.018);
      const swell = Math.sin((Math.PI * (i + 0.5)) / n);
      burst(c, out, at, {
        type: 'bandpass',
        f0: i % 2 ? 330 : 260,
        q: 1.1,
        peak: 0.48 * swell,
        rel: 0.09,
      });
      end = burst(c, out, at + 0.01, { f0: 180, peak: 0.24 * swell, rel: 0.17 });
      if (i % 2)
        osc(c, out, at + 0.04, { type: 'triangle', f0: 2600, peak: 0.016 * swell, rel: 0.05 });
    }
    return end;
  },
  // des moteurs : deux scies désaccordées, un battement lent
  aviation: (c, out, t) => {
    const dur = 1.9;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 520;
    f.Q.value = 0.8;
    const g = c.createGain();
    const trem = c.createOscillator();
    const depth = c.createGain();
    trem.frequency.value = 6 + Math.random() * 3;
    depth.gain.value = 0.25;
    trem.connect(depth).connect(g.gain);
    f.connect(g).connect(out);
    g.gain.value = 0.75;
    for (const [f0, peak] of [
      [74, 0.07],
      [76.6, 0.056],
    ] as const)
      osc(c, f, t, { type: 'sawtooth', f0, f1: f0 * 0.9, a: 0.9, peak, hold: dur - 1.8, rel: 0.9 });
    trem.start(t);
    trem.stop(t + dur + 0.1);
    return t + dur;
  },
  // trois coups de marteau, cuivre et bois
  construction: (c, out, t) => {
    let end = t;
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.62 + jitter(0.03);
      osc(c, out, at, { type: 'triangle', f0: 820, f1: 800, peak: 0.07, rel: 0.22 });
      osc(c, out, at, { f0: 1243, peak: 0.026, rel: 0.16 });
      end = burst(c, out, at, { type: 'highpass', f0: 2500, peak: 0.03, rel: 0.03 });
    }
    return end;
  },
  // la rotative, une dizaine de battements
  edition: (c, out, t) => {
    let end = t;
    for (let i = 0; i < 11; i++) {
      const at = t + i * 0.15;
      const swell = Math.sin((Math.PI * (i + 0.5)) / 11);
      burst(c, out, at, { type: 'bandpass', f0: 1150, q: 2.2, peak: 0.13 * swell, rel: 0.055 });
      if (i % 2 === 0) end = osc(c, out, at, { f0: 140, f1: 90, peak: 0.1 * swell, rel: 0.07 });
    }
    return end;
  },
};

function signe(
  c: AudioContext,
  out: Out,
  t: number,
  f: number,
  len: number,
  glide: number,
): number {
  osc(c, out, t, { f0: f, f1: f * glide, a: 0.006, peak: 0.05, hold: len, rel: 0.03 });
  return osc(c, out, t, {
    type: 'triangle',
    f0: f * 2,
    f1: f * 2 * glide,
    a: 0.006,
    peak: 0.006,
    hold: len,
    rel: 0.02,
  });
}

// ---------- la voie : côté et distance ----------

/**
 * **La distance se dit à trois** — volume, étouffement, écho : le seul indice qui tienne sur un
 * haut-parleur de téléphone est l'écho qui traîne.
 * @a-mesurer niveaux de la passe 2 de la maquette D (environ −8 dB par cran)
 */
const MUFFLE: Record<DistanceStep, number> = { near: 0, mid: 0.5, far: 0.85 };
const GAIN: Record<DistanceStep, number> = { near: 1, mid: 0.62, far: 0.36 };
const ECHO: Record<DistanceStep, number> = { near: 0, mid: 0.18, far: 0.32 };

let master: { readonly context: AudioContext; readonly node: AudioNode } | null = null;
function outOf(c: AudioContext): AudioNode {
  if (master?.context !== c) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    comp.connect(c.destination);
    master = { context: c, node: comp };
  }
  return master.node;
}

function lane(c: AudioContext, pan: number, muffle: number, gain: number): AudioNode {
  const lp = c.createBiquadFilter();
  const g = c.createGain();
  const p = c.createStereoPanner();
  lp.type = 'lowpass';
  lp.frequency.value = 280 + 9000 * Math.pow(1 - muffle, 2.4);
  g.gain.value = gain * (1 - 0.82 * muffle);
  p.pan.value = pan;
  lp.connect(g).connect(p).connect(outOf(c));
  return lp;
}

function echo(c: AudioContext, pan: number, send: number): AudioNode {
  const input = c.createGain();
  const delay = c.createDelay(1);
  const feedback = c.createGain();
  const lp = c.createBiquadFilter();
  delay.delayTime.value = 0.19;
  feedback.gain.value = 0.45;
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  input.connect(delay).connect(lp).connect(feedback).connect(delay);
  lp.connect(lane(c, pan, 0, send));
  return input;
}

/** Mono d'office sur un écran tactile étroit : un haut-parleur de téléphone n'a pas de côté. */
const panOf = (change: FrontChange): number =>
  change.bearing === null || (matchMedia(NARROW).matches && matchMedia(COARSE).matches)
    ? 0
    : Math.sin((change.bearing * Math.PI) / 180) * 0.8;

/**
 * Joue une phrase ; rend sa durée en secondes, 0 si rien n'a sonné. Le tic du télégraphe l'ouvre :
 * c'est la ligne qui parle, il reste net. Safari laisse un contexte `interrupted` au retour
 * d'arrière-plan : on le relance, et la phrase qui le trouve encore arrêté s'imprime sans son.
 */
function speak(change: FrontChange): number {
  const sound = soundNow();
  if (sound === 'off') return 0;
  try {
    const c = sharedAudio();
    const state: string = c.state;
    if (state === 'suspended' || state === 'interrupted') void c.resume();
    if (state !== 'running') return 0;
    const t = c.currentTime + 0.03;
    const pan = panOf(change);
    const tic = ticTac(c, lane(c, pan, 0, sound === 'reduced' ? 0.7 : 0.9), t, 0.9);
    if (sound === 'reduced') return tic - t;
    const { step } = change;
    const voice = lane(c, pan, MUFFLE[step], GAIN[step]);
    if (ECHO[step] > 0) voice.connect(echo(c, pan, ECHO[step] * GAIN[step]));
    let end = VOICES[change.nature](c, voice, t + 0.3, change);
    // « vers vous » : deux notes qui montent, nettes quelle que soit la distance
    if (change.inbound) {
      const near = lane(c, pan, 0, 0.9);
      signe(c, near, end + 0.08, 660, 0.09, 1.12);
      end = signe(c, near, end + 0.24, 880, 0.12, 1.15);
    }
    return end - t;
  } catch {
    // Le son est une politesse : un navigateur qui le refuse n'a rien à dire au joueur.
    return 0;
  }
}

// ---------- la bande ----------

export type TapeLine = {
  readonly id: number;
  readonly at: number;
  readonly change: FrontChange;
  /** Imprimée sans son : onglet masqué, son coupé, contexte arrêté, ou avant le premier geste. */
  readonly silent: boolean;
};

/** @a-mesurer ce que la bande garde */
const TAPE_MAX = 40;
/** La bande et ce qui parle, un seul instantané : la ligne qui parle se marque tant qu'elle sonne. */
type Tape = { readonly lines: ReadonlyArray<TapeLine>; readonly live: number | null };
let tape: Tape = { lines: [], live: null };
let printed = 0;
let liveTimer: ReturnType<typeof setTimeout> | null = null;
const readers = new Set<() => void>();

export const tapeNow = (): Tape => tape;
export function subscribeTape(reader: () => void): () => void {
  readers.add(reader);
  return () => {
    readers.delete(reader);
  };
}

function write(next: Tape): void {
  tape = next;
  for (const reader of readers) reader();
}

function print(change: FrontChange, silent: boolean): TapeLine {
  printed += 1;
  const line = { id: printed, at: Date.now(), change, silent };
  write({ ...tape, lines: [...tape.lines, line].slice(-TAPE_MAX) });
  return line;
}

function speakOn(line: TapeLine, seconds: number): void {
  if (seconds <= 0) return;
  if (liveTimer !== null) clearTimeout(liveTimer);
  write({ ...tape, live: line.id });
  liveTimer = setTimeout(
    () => {
      liveTimer = null;
      write({ ...tape, live: null });
    },
    seconds * 1000 + 100,
  );
}

/** Toucher une ligne la rejoue ; son coupé, la bande dit pourquoi rien ne sonne. */
export const replay = (line: TapeLine): void => speakOn(line, speak(line.change));

// ---------- la file ----------

let queue: ReadonlyArray<FrontChange> = [];
let missed: FrontChange[] = [];
let nextAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
/** La saison que la bande raconte : une autre la remet à blanc. */
let season: string | null = null;

/** Un navigateur ne joue rien avant le premier geste : la phrase s'imprime alors sans son. */
const mayPlay = () => navigator.userActivation?.hasBeenActive ?? true;

function pump(): void {
  timer = null;
  if (document.hidden || queue.length === 0) return;
  const wait = nextAt - Date.now();
  if (wait > 0) {
    timer = setTimeout(pump, wait);
    return;
  }
  const [change, ...rest] = queue;
  queue = rest;
  const seconds = mayPlay() ? speak(change!) : 0;
  speakOn(print(change!, seconds <= 0), seconds);
  nextAt = Date.now() + PHRASE_GAP_MS;
  if (queue.length > 0) timer = setTimeout(pump, PHRASE_GAP_MS);
}

const say = (changes: ReadonlyArray<FrontChange>) => {
  queue = changes.reduce(queued, queue);
  if (timer === null) pump();
};

/** Le retour : les trois plus chaudes à l'oreille, le reste imprimé sans son. */
function comeBack(changes: ReadonlyArray<FrontChange>): void {
  const { heard, printed: rest } = onReturn([...queue, ...changes]);
  queue = [];
  for (const change of rest) print(change, true);
  say(heard);
}

/**
 * **Ce que la vue a changé.** Onglet masqué, rien ne sonne et tout attend le retour ; une
 * reconnexion (`returning`) se traite comme un retour d'onglet.
 */
export function hearFront(changes: ReadonlyArray<FrontChange>, returning: boolean): void {
  if (changes.length === 0) return;
  if (document.hidden) missed.push(...changes);
  else if (returning) comeBack(changes);
  else say(changes);
}

/** **Le plateau s'ouvre sur une saison** : une autre que la dernière entendue remet la bande à
 *  blanc. */
export function enterFront(seasonId: string): void {
  if (season === seasonId) return;
  season = seasonId;
  printed = 0;
  write({ lines: [], live: null });
}

/** **Le plateau se démonte** (le salon, une autre route) : plus rien n'attend son tour. */
export function leaveFront(): void {
  queue = [];
  missed = [];
  nextAt = 0;
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Ce qui attendait son tour se rejoue au retour avec le reste, par chaleur.
      missed.push(...queue);
      queue = [];
      return;
    }
    const back = missed;
    missed = [];
    if (back.length > 0) comeBack(back);
  });
