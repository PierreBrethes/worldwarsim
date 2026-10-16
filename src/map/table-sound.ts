import { tableSoundOn } from '@/data/settings';

/**
 * **Les bruits de la table** (POC « Manipuler les pions », `SOUNDS`) : du bois, de l'encre et de
 * la toile, synthétisés — une pièce qu'on lève, qu'on pose, qui s'emboîte, qui dit non. Aucun
 * fichier : quelques oscillateurs et un souffle filtré, comme le tic-tac du télégraphe.
 */
type Sound =
  | 'lift'
  | 'drop'
  | 'snap'
  | 'tick'
  | 'bad'
  | 'whoosh'
  | 'board'
  | 'merge'
  | 'fire'
  | 'stamp'
  | 'engine';

let audio: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function tone(
  a: AudioContext,
  t0: number,
  {
    type = 'sine',
    f0,
    f1,
    dur,
    gain,
  }: { type?: OscillatorType; f0: number; f1: number; dur: number; gain: number },
): void {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function hiss(
  a: AudioContext,
  t0: number,
  {
    dur,
    gain,
    f0 = 2000,
    f1 = f0,
    q = 1,
    type = 'bandpass',
  }: { dur: number; gain: number; f0?: number; f1?: number; q?: number; type?: BiquadFilterType },
): void {
  const s = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  s.buffer = noise;
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(a.destination);
  s.start(t0);
  s.stop(t0 + dur + 0.02);
}

const SOUNDS: Readonly<Record<Sound, (a: AudioContext, t: number) => void>> = {
  lift: (a, t) => {
    hiss(a, t, { dur: 0.09, gain: 0.05, f0: 900, f1: 2600 });
    tone(a, t, { f0: 330, f1: 520, dur: 0.06, gain: 0.03 });
  },
  drop: (a, t) => {
    tone(a, t, { f0: 240, f1: 105, dur: 0.11, gain: 0.22 });
    hiss(a, t, { dur: 0.025, gain: 0.08, f0: 3800, type: 'highpass' });
  },
  snap: (a, t) => tone(a, t, { type: 'triangle', f0: 1500, f1: 1000, dur: 0.03, gain: 0.05 }),
  tick: (a, t) => tone(a, t, { type: 'triangle', f0: 2200, f1: 1800, dur: 0.02, gain: 0.04 }),
  bad: (a, t) => {
    tone(a, t, { f0: 150, f1: 85, dur: 0.2, gain: 0.16 });
    tone(a, t + 0.09, { f0: 120, f1: 70, dur: 0.18, gain: 0.12 });
  },
  whoosh: (a, t) => hiss(a, t, { dur: 0.3, gain: 0.05, f0: 500, f1: 1800, q: 0.7 }),
  board: (a, t) => {
    tone(a, t, { type: 'triangle', f0: 1300, f1: 900, dur: 0.03, gain: 0.06 });
    tone(a, t + 0.07, { type: 'triangle', f0: 1700, f1: 1200, dur: 0.03, gain: 0.06 });
    tone(a, t + 0.02, { f0: 160, f1: 90, dur: 0.12, gain: 0.12 });
  },
  merge: (a, t) =>
    [0, 0.06, 0.12].forEach((d, i) =>
      tone(a, t + d, { f0: 260 + i * 50, f1: 120 + i * 20, dur: 0.09, gain: 0.16 }),
    ),
  fire: (a, t) => {
    hiss(a, t, { dur: 0.32, gain: 0.22, f0: 1400, f1: 200, type: 'lowpass' });
    tone(a, t, { f0: 90, f1: 40, dur: 0.25, gain: 0.2 });
  },
  stamp: (a, t) => {
    tone(a, t, { f0: 110, f1: 50, dur: 0.14, gain: 0.22 });
    hiss(a, t, { dur: 0.05, gain: 0.07, f0: 1200 });
  },
  engine: (a, t) => tone(a, t, { type: 'sawtooth', f0: 70, f1: 140, dur: 0.8, gain: 0.025 }),
};

/** Joue `name`, si les bruits de la table sont allumés et l'onglet regardé. */
export function playTableSound(name: Sound): void {
  try {
    if (!tableSoundOn() || document.hidden) return;
    if (audio === null) {
      audio = new AudioContext();
      noise = audio.createBuffer(1, audio.sampleRate * 0.5, audio.sampleRate);
      const wave = noise.getChannelData(0);
      for (let i = 0; i < wave.length; i++) wave[i] = Math.random() * 2 - 1;
    }
    if (audio.state === 'suspended') void audio.resume();
    SOUNDS[name](audio, audio.currentTime + 0.005);
  } catch {
    // L'audio est un agrément : un navigateur qui le refuse n'a rien à dire au joueur.
  }
}
