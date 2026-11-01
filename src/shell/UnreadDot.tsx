/** Le point rouge d'une mise à jour non lue, posé au coin d'un bouton `relative`. Décoratif : il ne change pas le nom du bouton, et le tampon « non lu » de la liste dit la même chose en texte. */
export function UnreadDot({ className = '-top-[5px] -right-[5px]' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`absolute ${className} h-3 w-3 rounded-full bg-[var(--critical)] shadow-[0_0_0_2px_var(--paper)]`}
    />
  );
}
