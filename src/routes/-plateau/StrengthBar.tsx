/**
 * **L'effectif est la barre de vie** (ADR 0014) : un filet d'encre sur sa piste, rien d'autre — ni
 * seuil ni couleur, une troupe entamée n'est pas une alerte. La fiche d'une troupe et les cartes
 * de la garnison la portent sous le chiffre (refonte mobile, 1b et 1e).
 */
export function StrengthBar({
  strength,
  nominal,
  height = 4,
}: {
  strength: number;
  nominal: number;
  height?: number;
}) {
  const ratio = nominal > 0 ? Math.max(0, Math.min(1, strength / nominal)) : 0;
  return (
    <span aria-hidden className="block w-full bg-(--ink)/16" style={{ height }}>
      <span className="block h-full bg-[var(--ink)]" style={{ width: `${ratio * 100}%` }} />
    </span>
  );
}
