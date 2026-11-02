import { useQuery } from 'convex/react';
import { useEffect, useMemo, useRef } from 'react';
import { api } from '../../convex/_generated/api';
import { sharedAudio, soundNow, ticTac } from './audio';
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

/**
 * Le tic-tac du télégraphe (`ticTac`) à l'arrivée d'un message des autres. Muet quand l'onglet
 * est caché : le son annonce ce qu'on n'a pas vu passer, pas ce qui se passe dans une fenêtre
 * qu'on a quittée.
 */
function tick(): void {
  if (soundNow() === 'off' || document.hidden) return;
  try {
    const audio = sharedAudio();
    void audio.resume();
    ticTac(audio, audio.destination, audio.currentTime, 1);
  } catch {
    // Un navigateur qui refuse l'audio n'a rien à dire au joueur : le badge suffit.
  }
}
