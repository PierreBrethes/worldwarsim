/**
 * A key that drives the map must never steal a keystroke: space typed in a field writes a
 * space, and `?` writes a question mark. Without this guard, the game code would become
 * untypable as soon as a board shortcut exists.
 */
export function isTyping(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return (
    active.isContentEditable ||
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement
  );
}
