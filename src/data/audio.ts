import { keepSound, readSound, type Sound } from './settings';

/**
 * **Un seul contexte audio** pour la table, le télégraphe et le front (#405) : un navigateur en
 * compte peu, et chacun naissait du sien.
 */
let audio: AudioContext | null = null;

export const sharedAudio = (): AudioContext => (audio ??= new AudioContext());

/** **Le réglage du son**, lu à chaque son : le changer agit à l'instant. */
let sound: Sound | null = null;
const listeners = new Set<() => void>();

export const soundNow = (): Sound => (sound ??= readSound());

export function setSound(next: Sound): void {
  sound = next;
  keepSound(next);
  for (const listener of listeners) listener();
}

export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * **Le tic-tac du télégraphe : deux clics amortis, synthétisés** — pas un fichier : un bruit blanc
 * étouffé en quatre millisecondes et passé au filtre sonne mécanique là où un oscillateur
 * sonnerait comme une notification de téléphone. Le second clic est plus bas et plus court :
 * c'est ce qui fait le *tic-tac* plutôt que deux tics. Il dit un message, et ouvre chaque phrase
 * du front (#405). Rend l'instant où il se tait.
 */
export function ticTac(context: AudioContext, out: AudioNode, at: number, level: number): number {
  click(context, out, at, 2400, 0.09 * level);
  click(context, out, at + 0.085, 1700, 0.06 * level);
  return at + 0.085 + CLICK_SECONDS;
}

const CLICK_SECONDS = 0.02;

function click(
  context: AudioContext,
  out: AudioNode,
  at: number,
  hertz: number,
  level: number,
): void {
  const length = Math.ceil(context.sampleRate * CLICK_SECONDS);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const wave = buffer.getChannelData(0);
  const decay = context.sampleRate * 0.0035;
  for (let sample = 0; sample < length; sample += 1) {
    wave[sample] = (Math.random() * 2 - 1) * Math.exp(-sample / decay);
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  const shape = context.createBiquadFilter();
  shape.type = 'bandpass';
  shape.frequency.value = hertz;
  shape.Q.value = 1.6;
  const volume = context.createGain();
  volume.gain.value = level;
  source.connect(shape).connect(volume).connect(out);
  source.start(at);
}
