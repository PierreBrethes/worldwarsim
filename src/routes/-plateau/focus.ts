import { useEffect, useRef } from 'react';

/**
 * The designated row, brought into sight and marked. **A designation is not an alert**: the
 * mark is the rail's amber — the ink of "you are here" — and never `--critical`, which the
 * board reserves for what is coming at the player.
 */
export const FOCUS_MARK = 'border-l-2 border-[var(--notable)] bg-[rgba(176,116,52,.09)]';

/**
 * Scrolls the designated row into its window when — and only when — the designation changes.
 * Scrolling on every render would fight the player's own scrolling for as long as the focus
 * stays in the URL.
 */
export function useFocusRow<T extends HTMLElement>(focused: boolean) {
  const node = useRef<T>(null);
  useEffect(() => {
    if (focused) node.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focused]);
  return node;
}
