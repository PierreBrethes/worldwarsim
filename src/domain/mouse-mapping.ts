/**
 * **La grammaire de la carte ne se règle pas ; quel bouton la porte, si.** Trois rôles sur trois
 * boutons, une permutation — un bouton oriente, un bouton déplace, un bouton agit. Le retour de
 * la partie du 11/09 tient en une phrase : deux joueurs, deux habitudes, et aucune des deux n'est
 * une règle du jeu. La décision du 30/08 (« la carte au clic droit agit ») reste le défaut.
 *
 * Ce qui ne se règle pas et n'a donc aucun champ ici : le clic net gauche qui lit, l'alias
 * `espace + glisser gauche` qui déplace, et le fait qu'`agir` soit un clic net quand `orienter`
 * et `déplacer` sont des glissers.
 */
export type MouseRole = 'orient' | 'pan' | 'act';
export type MouseButton = 'left' | 'middle' | 'right';
export type MouseMapping = Readonly<Record<MouseButton, MouseRole>>;

export const MOUSE_BUTTONS: ReadonlyArray<MouseButton> = ['left', 'middle', 'right'];
export const MOUSE_ROLES: ReadonlyArray<MouseRole> = ['orient', 'pan', 'act'];

export const CLASSIC_MAPPING: MouseMapping = { left: 'orient', middle: 'pan', right: 'act' };

/** Le retour de la partie du 11/09 : la rose au clic molette, la carte au clic droit. */
export const WHEEL_ACTS_MAPPING: MouseMapping = { left: 'orient', middle: 'act', right: 'pan' };

export const DEFAULT_MOUSE_MAPPING = CLASSIC_MAPPING;

export type MousePresetKey = 'classic' | 'wheelActs';

export const MOUSE_PRESETS: ReadonlyArray<{
  readonly key: MousePresetKey;
  readonly mapping: MouseMapping;
}> = [
  { key: 'classic', mapping: CLASSIC_MAPPING },
  { key: 'wheelActs', mapping: WHEEL_ACTS_MAPPING },
];

/**
 * Un mappage n'est valide qu'en permutation : trois rôles distincts sur trois boutons. Tout le
 * reste — une clé en trop, un rôle inconnu, deux boutons qui agissent — est un état que l'écran
 * ne sait pas montrer, donc un état qu'on refuse à la lecture plutôt que de le rattraper.
 */
export function isMouseMapping(value: unknown): value is MouseMapping {
  if (typeof value !== 'object' || value === null) return false;
  const kept = value as Record<string, unknown>;
  const roles = MOUSE_BUTTONS.map((button) => kept[button]);
  return (
    roles.every((role): role is MouseRole => MOUSE_ROLES.includes(role as MouseRole)) &&
    new Set(roles).size === MOUSE_ROLES.length
  );
}

/**
 * Choisir un rôle l'**échange** avec le bouton qui l'avait. C'est ce qui rend l'invalide
 * impossible : il n'y a pas de sélecteur grisé, pas de refus, et jamais deux boutons sur le même
 * métier — la permutation entre et sort intacte (ADR 0015, pour la même raison qu'ailleurs).
 */
export function withRole(
  mapping: MouseMapping,
  button: MouseButton,
  role: MouseRole,
): MouseMapping {
  const held = buttonOfRole(mapping, role);
  if (held === button) return mapping;
  return { ...mapping, [button]: role, [held]: mapping[button] };
}

export function buttonOfRole(mapping: MouseMapping, role: MouseRole): MouseButton {
  // La permutation est un invariant du type : un rôle a toujours son bouton.
  return MOUSE_BUTTONS.find((button) => mapping[button] === role) as MouseButton;
}

/** L'ordre dans lequel `PointerEvent.button` numérote les trois boutons, et le seul endroit du
 *  dépôt où ces trois numéros s'écrivent. */
const BY_INDEX: ReadonlyArray<MouseButton> = ['left', 'middle', 'right'];

/** `null` pour les boutons latéraux, que le navigateur garde pour précédent / suivant. */
export const buttonAt = (index: number): MouseButton | null => BY_INDEX[index] ?? null;

export function roleAt(mapping: MouseMapping, index: number): MouseRole | null {
  const button = buttonAt(index);
  return button === null ? null : mapping[button];
}
