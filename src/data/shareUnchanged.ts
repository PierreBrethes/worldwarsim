/**
 * **Partage structurel** (#148) : chaque sous-arbre de `next` égal à celui de `previous` est
 * remplacé par ce dernier, si bien qu'une réponse du serveur qui ne change qu'un champ ne change
 * que l'identité de son chemin. Les `useMemo` qui lisent un sous-arbre resté égal ne recalculent
 * rien. Les tableaux se comparent rang par rang ; seuls les objets simples se descendent.
 */
export function shareUnchanged<T>(previous: unknown, next: T): T {
  if (Object.is(previous, next)) return next;
  if (!isPlain(previous) || !isPlain(next) || Array.isArray(previous) !== Array.isArray(next))
    return next;

  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  const keys = Object.keys(after);
  let same = keys.length === Object.keys(before).length;
  const shared = (Array.isArray(next) ? [] : {}) as Record<string, unknown>;
  for (const key of keys) {
    const value = shareUnchanged(before[key], after[key]);
    if (value !== before[key] || !(key in before)) same = false;
    shared[key] = value;
  }
  return (same ? previous : shared) as T;
}

const isPlain = (value: unknown): value is object => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === Array.prototype || prototype === null;
};
