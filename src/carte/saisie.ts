/**
 * Une touche qui pilote la carte ne doit jamais voler une frappe : l'espace tapé dans un champ
 * y écrit un espace, et `?` y écrit un point d'interrogation. Sans ce garde-fou, le code de la
 * partie deviendrait intapable dès qu'un raccourci de plateau existe.
 */
export function saisieEnCours(): boolean {
  const actif = document.activeElement;
  if (!(actif instanceof HTMLElement)) return false;
  return (
    actif.isContentEditable ||
    actif instanceof HTMLInputElement ||
    actif instanceof HTMLTextAreaElement ||
    actif instanceof HTMLSelectElement
  );
}
