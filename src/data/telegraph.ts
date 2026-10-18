import { useQuery } from 'convex/react';
import { useEffect, useMemo, useRef } from 'react';
import { api } from '../../convex/_generated/api';
import { telegraphSoundOn } from './settings';
import type { Seat } from './session';
import { unreadCount } from '@/domain/telegraph';
import type { Id } from '../../convex/_generated/dataModel';

export type TelegraphMessage = {
  readonly id: string;
  readonly at: number;
  readonly text: string;
  readonly nickname: string;
  readonly nation: string | null;
  readonly ink: string;
  readonly mine: boolean;
  /** Lu par le teneur d'Istanbul (P11) : le fil porte le tampon. Absent d'un serveur d'avant. */
  readonly readAtIstanbul?: boolean;
};

type DirectChannel = {
  readonly with: Id<'players'>;
  readonly nickname: string;
  readonly nation: string | null;
  readonly ink: string;
  readonly messages: ReadonlyArray<TelegraphMessage>;
  /** From the others only, since the channel was last closed. */
  readonly unread: number;
};

export type Telegraph = {
  readonly general: ReadonlyArray<TelegraphMessage>;
  readonly generalUnread: number;
  readonly direct: ReadonlyArray<DirectChannel>;
  readonly unread: number;
};

const QUIET: Telegraph = { general: [], generalUnread: 0, direct: [], unread: 0 };

/**
 * **Le fil vit dans l'écran, pas dans la fenêtre.** Au plateau, le badge du rail compte quand la
 * fenêtre est fermée et le tic-tac sonne quand on regarde ailleurs : les deux tiennent de
 * l'abonnement ouvert en permanence, donc la route le tient une fois et la fenêtre n'est plus
 * qu'un afficheur. Au salon il n'y a ni rail ni badge, mais le même abonnement et le même
 * tic-tac — d'où la remontée hors de `-plateau/`.
 */
export function useTelegraph(seat: Seat): Telegraph {
  const served = useQuery(api.messages.recent, seat);
  const telegraph = useMemo<Telegraph>(() => {
    if (served === undefined) return QUIET;
    const generalUnread = unreadCount(served.messages, served.readAt);
    const direct = served.direct.map((channel) => ({
      ...channel,
      unread: unreadCount(channel.messages, channel.readAt),
    }));
    return {
      general: served.messages,
      generalUnread,
      direct,
      unread: direct.reduce((total, channel) => total + channel.unread, generalUnread),
    };
  }, [served]);

  /**
   * **The tick only rings for what arrives after the player is there.** The first server answer
   * is the backlog of every thread, and ringing for it would greet the player with hundreds of
   * clicks: the first pass only learns which messages already exist. After that, any message from
   * another player on any channel that was not there rings.
   */
  const heard = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (served === undefined) return;
    const channels = telegraph.direct.flatMap((c) => c.messages);
    const others = [...telegraph.general, ...channels].filter((message) => !message.mine);
    const before = heard.current;
    heard.current = new Set(others.map((message) => message.id));
    if (before !== null && others.some((message) => !before.has(message.id))) tick();
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
