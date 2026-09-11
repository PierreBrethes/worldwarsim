import { useQuery } from 'convex/react';
import { useEffect, useMemo, useRef } from 'react';
import { api } from '../../convex/_generated/api';
import { telegraphSoundOn } from './settings';
import type { Seat } from './session';

export type TelegraphMessage = {
  readonly id: string;
  readonly at: number;
  readonly text: string;
  readonly nickname: string;
  readonly nation: string | null;
  readonly ink: string;
  readonly mine: boolean;
};

export type Telegraph = {
  readonly messages: ReadonlyArray<TelegraphMessage>;
  /** Depuis la dernière fermeture, et des autres seulement : s'annoncer à soi-même ses propres
   *  messages ferait du badge un compteur d'envois. */
  readonly unread: number;
};

const QUIET: Telegraph = { messages: [], unread: 0 };

/**
 * **Le fil vit dans l'écran, pas dans la fenêtre.** Au plateau, le badge du rail compte quand la
 * fenêtre est fermée et le tic-tac sonne quand on regarde ailleurs : les deux tiennent de
 * l'abonnement ouvert en permanence, donc la route le tient une fois et la fenêtre n'est plus
 * qu'un afficheur. Au salon il n'y a ni rail ni badge, mais le même abonnement et le même
 * tic-tac — d'où la remontée hors de `-plateau/`.
 */
export function useTelegraph(seat: Seat): Telegraph {
  const served = useQuery(api.messages.recent, seat);
  const telegraph = useMemo<Telegraph>(
    () =>
      served === undefined
        ? QUIET
        : {
            messages: served.messages,
            unread: served.messages.filter(
              (message) => !message.mine && (served.readAt === null || message.at > served.readAt),
            ).length,
          },
    [served],
  );

  /**
   * **Le tic-tac ne sonne que pour ce qui arrive après qu'on est là.** La première réponse du
   * serveur est l'arriéré du fil — la faire sonner accueillerait le joueur par deux cents clics.
   * D'où l'amorçage : le premier passage n'apprend qu'une chose, l'identité du dernier message.
   */
  const primed = useRef(false);
  const lastSeen = useRef<string | null>(null);
  useEffect(() => {
    if (served === undefined) return;
    const previous = lastSeen.current;
    const last = telegraph.messages.at(-1)?.id ?? null;
    lastSeen.current = last;
    if (!primed.current) {
      primed.current = true;
      return;
    }
    if (last === null || last === previous) return;
    // Un message tombé hors des deux cents derniers ne se retrouve plus : tout ce qui est là
    // est alors nouveau, ce qui est la lecture prudente.
    const fresh = telegraph.messages.slice(
      telegraph.messages.findIndex((message) => message.id === previous) + 1,
    );
    if (fresh.some((message) => !message.mine)) tick();
  }, [served, telegraph]);

  return telegraph;
}

let audio: AudioContext | null = null;

/**
 * **Deux clics amortis, synthétisés** — pas un fichier : un bruit blanc étouffé en quatre
 * millisecondes et passé au filtre sonne mécanique là où un oscillateur sonnerait comme une
 * notification de téléphone. Le second clic est plus bas et plus court : c'est ce qui fait le
 * *tic-tac* plutôt que deux tics.
 *
 * Muet quand l'onglet est caché : le son annonce ce qu'on n'a pas vu passer, pas ce qui se passe
 * dans une fenêtre qu'on a quittée.
 */
function tick(): void {
  if (!telegraphSoundOn() || document.hidden) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    click(audio, audio.currentTime, 2400, 0.09);
    click(audio, audio.currentTime + 0.085, 1700, 0.06);
  } catch {
    // Un navigateur qui refuse l'audio n'a rien à dire au joueur : le badge suffit.
  }
}

function click(context: AudioContext, at: number, hertz: number, level: number): void {
  const length = Math.ceil(context.sampleRate * 0.02);
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
  source.connect(shape).connect(volume).connect(context.destination);
  source.start(at);
}
