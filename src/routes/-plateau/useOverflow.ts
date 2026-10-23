import { useEffect, useState, type RefObject } from 'react';

/** Under this many pixels of travel left, a scroller counts as at its end. */
const EDGE_PX = 2;

/**
 * **Y a-t-il une suite ?** Ce qui dépasse d'un défileur, de chaque côté de son axe : `before` en
 * deçà de sa position, `after` au-delà. Relu au défilement et quand lui ou son contenu change de
 * taille — le fondu et les flèches ne se posent que du côté où il y a quelque chose à voir.
 */
export function useOverflow(
  ref: RefObject<HTMLElement | null>,
  axis: 'x' | 'y',
  /** What makes the ref point at another node (the layout): the measure starts over with it. */
  layout: unknown = null,
): { readonly before: boolean; readonly after: boolean } {
  const [edges, setEdges] = useState({ before: false, after: false });
  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const read = () => {
      const [at, room, size] =
        axis === 'x'
          ? [node.scrollLeft, node.clientWidth, node.scrollWidth]
          : [node.scrollTop, node.clientHeight, node.scrollHeight];
      const next = { before: at > EDGE_PX, after: at + room < size - EDGE_PX };
      setEdges((last) => (last.before === next.before && last.after === next.after ? last : next));
    };
    read();
    node.addEventListener('scroll', read, { passive: true });
    const observer = new ResizeObserver(read);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    return () => {
      node.removeEventListener('scroll', read);
      observer.disconnect();
    };
  }, [ref, axis, layout]);
  return edges;
}
