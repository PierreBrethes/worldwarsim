import { useEffect, useLayoutEffect, useRef } from 'react';
import { CueBubble } from '@/shell/CueBubble';
import type { BuildingKey } from '@/domain/ids';

/** The air kept between the bubble and the edge of what carries it. */
const EDGE_PX = 4;

/**
 * **La bulle d'un premier pas, posée sur la tuile qu'elle nomme** (#607) : elle la cherche par son
 * `data-tile`, et la désigne où qu'elle soit. Tuile hors de la bande, elle pointe le chevron du côté
 * où la rangée continue (le bord de la rangée au téléphone, qui n'en a pas) ; sans la tuile à
 * l'écran (un site tient la bande), elle se tait. Elle se pose dans le plus proche parent
 * positionné, `.hud` zoomé : les mesures d'écran se divisent par l'échelle.
 */
export function TileCue({ text, tile }: { text: string; tile: BuildingKey }) {
  const bubble = useRef<HTMLSpanElement>(null);

  const aim = () => {
    const node = bubble.current;
    const parent = node?.offsetParent;
    if (!node || !(parent instanceof HTMLElement)) return;
    const tileNode = document.querySelector<HTMLElement>(`[data-tile="${tile}"]`);
    const rail = tileNode?.closest<HTMLElement>('[role="group"]');
    if (!tileNode || !rail) {
      node.style.visibility = 'hidden';
      return;
    }
    const box = rail.getBoundingClientRect();
    const mine = tileNode.getBoundingClientRect();
    const middle = (mine.left + mine.right) / 2;
    let at = middle;
    if (middle < box.left || middle > box.right) {
      const side = middle < box.left ? 'previous' : 'next';
      const chevron = rail.parentElement
        ?.querySelector<HTMLElement>(`[data-side="${side}"]`)
        ?.getBoundingClientRect();
      at = chevron
        ? (chevron.left + chevron.right) / 2
        : side === 'next'
          ? box.right - 12
          : box.left + 12;
    }
    const frame = parent.getBoundingClientRect();
    const scale = parent.offsetWidth > 0 ? frame.width / parent.offsetWidth : 1;
    const centre = (at - frame.left) / scale;
    const left = Math.max(
      EDGE_PX,
      Math.min(parent.offsetWidth - node.offsetWidth - EDGE_PX, centre - node.offsetWidth / 2),
    );
    node.style.left = `${left}px`;
    node.style.setProperty('--tail', `${centre - left}px`);
    node.style.visibility = 'visible';
  };

  // After every draw: the tile's place follows the rail's scroll, the arrows and the sheet's step.
  useLayoutEffect(aim);
  useEffect(() => {
    const rail = document.querySelector(`[data-tile="${tile}"]`)?.closest('[role="group"]');
    const watched = rail?.parentElement;
    const observer = new ResizeObserver(aim);
    const arrows = new MutationObserver(aim);
    if (rail) observer.observe(rail);
    if (watched) arrows.observe(watched, { childList: true });
    window.addEventListener('resize', aim);
    document.addEventListener('scroll', aim, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      arrows.disconnect();
      window.removeEventListener('resize', aim);
      document.removeEventListener('scroll', aim, { capture: true });
    };
    // `aim` reads only `tile` and the DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile]);

  return (
    <CueBubble
      ref={bubble}
      text={text}
      place="first-step-cue--aimed absolute bottom-[calc(100%+9px)] left-0 invisible"
    />
  );
}
