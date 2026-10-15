import { useLayoutEffect, useRef, type RefObject } from 'react';

export type LayerSize = { width: number; height: number };

/**
 * **The size of a layer, kept by its observer.** Read from a per-frame callback that has just
 * written styles, `clientWidth` forced a synchronous layout every frame; the observer measures
 * when the layer is resized, and the callback reads a number.
 */
export function useLayerSize(layer: RefObject<HTMLElement | null>): RefObject<LayerSize> {
  const size = useRef<LayerSize>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = layer.current;
    if (node === null) return;
    const measure = () => {
      size.current = { width: node.clientWidth, height: node.clientHeight };
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [layer]);
  return size;
}
