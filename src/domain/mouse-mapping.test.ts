import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import {
  CLASSIC_MAPPING,
  MOUSE_BUTTONS,
  WHEEL_ACTS_MAPPING,
  buttonAt,
  buttonOfRole,
  cleanPressAt,
  dragRoleAt,
  isMouseMapping,
  roleAt,
  withRole,
  type MouseMapping,
} from './mouse-mapping';

describe('le mappage de la souris', () => {
  it('est une permutation, et refuse tout ce qui n’en est pas une', () => {
    expect(isMouseMapping(CLASSIC_MAPPING)).toBe(true);
    expect(isMouseMapping(WHEEL_ACTS_MAPPING)).toBe(true);
    expect(isMouseMapping({ left: 'orient', middle: 'orient', right: 'act' })).toBe(false);
    expect(isMouseMapping({ left: 'orient', middle: 'pan' })).toBe(false);
    expect(isMouseMapping({ left: 'orient', middle: 'pan', right: 'zoom' })).toBe(false);
    expect(isMouseMapping(null)).toBe(false);
    expect(isMouseMapping('classique')).toBe(false);
  });

  it('échange les rôles plutôt que d’en refuser un', () => {
    const swapped = withRole(CLASSIC_MAPPING, 'left', 'act');
    expect(swapped).toEqual({ left: 'act', middle: 'pan', right: 'orient' });
    expect(isMouseMapping(swapped)).toBe(true);
  });

  it('rend le même mappage quand le bouton porte déjà le rôle', () => {
    expect(withRole(CLASSIC_MAPPING, 'right', 'act')).toBe(CLASSIC_MAPPING);
  });

  /** Neuf choix, neuf permutations : aucun clic des Réglages ne peut ouvrir un état invalide. */
  it('reste une permutation quel que soit le choix', () => {
    for (const button of MOUSE_BUTTONS) {
      for (const role of ['orient', 'pan', 'act'] as const) {
        expect(isMouseMapping(withRole(WHEEL_ACTS_MAPPING, button, role))).toBe(true);
      }
    }
  });

  it('lit le numéro de bouton du navigateur, et laisse les boutons latéraux muets', () => {
    expect(buttonAt(0)).toBe('left');
    expect(buttonAt(1)).toBe('middle');
    expect(buttonAt(2)).toBe('right');
    expect(buttonAt(3)).toBeNull();
    expect(roleAt(CLASSIC_MAPPING, 2)).toBe('act');
    expect(roleAt(WHEEL_ACTS_MAPPING, 1)).toBe('act');
    expect(roleAt(WHEEL_ACTS_MAPPING, 4)).toBeNull();
  });

  it('nomme le bouton d’un rôle', () => {
    expect(buttonOfRole(CLASSIC_MAPPING, 'act')).toBe('right');
    expect(buttonOfRole(WHEEL_ACTS_MAPPING, 'pan')).toBe('right');
  });
});

/** Le préréglage « gauche agit » n'est pas une entrée de `MOUSE_PRESETS` : c'est le troisième
 *  mappage qu'un joueur compose aux Réglages, et celui qu'un écran tactile faisait espérer. */
const LEFT_ACTS_MAPPING = withRole(CLASSIC_MAPPING, 'left', 'act');

describe('le rôle d’un geste selon le pointeur', () => {
  const mappings = [CLASSIC_MAPPING, WHEEL_ACTS_MAPPING, LEFT_ACTS_MAPPING];

  it('laisse la souris telle que le joueur l’a réglée, sur les trois mappages', () => {
    for (const mapping of mappings) {
      for (const [index, button] of MOUSE_BUTTONS.entries()) {
        expect(dragRoleAt(mapping, 'mouse', index)).toBe(mapping[button]);
        expect(cleanPressAt(mapping, 'mouse', index)).toEqual({
          picks: button === 'left',
          reads: button === 'left',
          acts: mapping[button] === 'act',
          cancels: false,
        });
      }
    }
    expect(cleanPressAt(CLASSIC_MAPPING, 'mouse', 2)).toEqual({
      picks: false,
      reads: false,
      acts: true,
      cancels: false,
    });
    expect(cleanPressAt(WHEEL_ACTS_MAPPING, 'mouse', 1)).toEqual({
      picks: false,
      reads: false,
      acts: true,
      cancels: false,
    });
    expect(cleanPressAt(LEFT_ACTS_MAPPING, 'mouse', 0)).toEqual({
      picks: true,
      reads: true,
      acts: true,
      cancels: false,
    });
  });

  it('traite le stylet comme une souris : il a des boutons', () => {
    expect(dragRoleAt(CLASSIC_MAPPING, 'pen', 0)).toBe('orient');
    expect(cleanPressAt(CLASSIC_MAPPING, 'pen', 0)).toEqual({
      picks: true,
      reads: true,
      acts: false,
      cancels: false,
    });
  });

  it('au doigt : un toucher net lit et agit, un glissé déplace — quel que soit le réglage', () => {
    for (const mapping of mappings) {
      expect(cleanPressAt(mapping, 'touch', 0)).toEqual({
        picks: true,
        reads: true,
        acts: true,
        cancels: false,
      });
      expect(dragRoleAt(mapping, 'touch', 0)).toBe('pan');
    }
  });

  it('pièce en main, le clic net gauche pose au lieu de lire, et touche encore les pièces', () => {
    for (const mapping of mappings) {
      expect(cleanPressAt(mapping, 'mouse', 0, true)).toEqual({
        picks: true,
        reads: false,
        acts: true,
        cancels: false,
      });
      expect(cleanPressAt(mapping, 'touch', 0, true)).toEqual({
        picks: true,
        reads: false,
        acts: true,
        cancels: false,
      });
    }
  });

  /** **Pièce en main, tout clic net qui ne pose pas annule** (#229), quel que soit le rôle de son
   *  bouton : comme Échap, rien n'est envoyé et aucune rose ne s'ouvre. Le clic gauche pose. */
  it('pièce en main, tout clic net hors du gauche annule, sur les trois mappages', () => {
    for (const mapping of mappings) {
      for (const index of [1, 2]) {
        expect(cleanPressAt(mapping, 'mouse', index, true)).toEqual({
          picks: false,
          reads: false,
          acts: false,
          cancels: true,
        });
      }
    }
    expect(cleanPressAt(WHEEL_ACTS_MAPPING, 'mouse', 2, true).cancels).toBe(true);
    expect(cleanPressAt(CLASSIC_MAPPING, 'mouse', 0, true)).toMatchObject({
      acts: true,
      cancels: false,
    });
  });

  it('ne change rien sans pièce en main, au doigt, ni quand c’est le gauche qui agit', () => {
    expect(cleanPressAt(CLASSIC_MAPPING, 'mouse', 2)).toMatchObject({ acts: true, cancels: false });
    for (const mapping of mappings) {
      expect(cleanPressAt(mapping, 'touch', 0, true)).toMatchObject({ acts: true, cancels: false });
    }
    expect(cleanPressAt(LEFT_ACTS_MAPPING, 'mouse', 0, true)).toMatchObject({
      acts: true,
      cancels: false,
    });
  });
});

/**
 * **Un seul endroit traduit un bouton en rôle.** Un numéro écrit en dur ailleurs serait un
 * second mappage : le jour où le joueur permute deux boutons, un seul des deux aurait bougé.
 */
describe('la carte ne lit aucun numéro de bouton', () => {
  const root = join(import.meta.dirname, '..');

  const sources = (directory: string): ReadonlyArray<string> =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sources(path);
      return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
    });

  it('n’écrit `button ===` nulle part dans `src/map`', () => {
    const guilty = sources(join(root, 'map')).filter((path) =>
      /\bbutton\s*===\s*\d/.test(readFileSync(path, 'utf8')),
    );
    expect(guilty).toEqual([]);
  });
});

/**
 * La fiche `?` et l'aide-mémoire décrivent le mappage courant : deux mappages, deux textes.
 * Une phrase écrite en dur mentirait au premier joueur qui permute deux boutons.
 */
describe('les notices lisent le mappage', () => {
  const sentence = (mapping: MouseMapping): string =>
    fr.mapUi
      .gestures(mapping)
      .map(({ gesture, effect }) => `${gesture} — ${effect}`)
      .join(' · ');

  it('nomme le bouton qui agit dans la fiche des commandes', () => {
    expect(sentence(CLASSIC_MAPPING)).toContain('clic droit net — ouvrir la rose des vents');
    expect(sentence(WHEEL_ACTS_MAPPING)).toContain('clic molette net — ouvrir la rose des vents');
    expect(sentence(WHEEL_ACTS_MAPPING)).toContain('clic droit glissé — déplacer la carte');
  });

  /** Lever et poser restent au gauche quel que soit le mappage (ADR 0026 §6). */
  it('nomme le clic gauche pour lever et poser, sous tout mappage', () => {
    for (const mapping of [CLASSIC_MAPPING, WHEEL_ACTS_MAPPING]) {
      expect(sentence(mapping)).toContain('clic gauche net sur une pile — la lever');
      expect(fr.mapUi.gestureHint(mapping).lift).toContain(
        'glisser une pile, ou clic gauche net puis clic gauche net',
      );
    }
  });

  it('nomme le même bouton dans l’aide-mémoire et dans le bandeau', () => {
    const columns = (mapping: MouseMapping) =>
      fr.briefing.columns(60, 25, 120, { finger: false, phone: false, mapping });
    const column = (mapping: MouseMapping) => columns(mapping)[0]!.lines.join(' ');
    expect(column(CLASSIC_MAPPING)).toContain('La rose des vents : clic droit net');
    expect(column(WHEEL_ACTS_MAPPING)).toContain('La rose des vents : clic molette net');
    expect(column(WHEEL_ACTS_MAPPING)).toContain('Déplacer la carte : clic droit glissé');
    expect(columns(WHEEL_ACTS_MAPPING)[1]!.lines.join(' ')).toContain(
      'Clic molette net sur un avant-poste à vous',
    );

    expect(fr.mapUi.gestureHint(CLASSIC_MAPPING).pan).toContain('molette enfoncée');
    expect(fr.mapUi.gestureHint(WHEEL_ACTS_MAPPING).pan).toContain('clic droit glissé');
  });
});

/** **Au doigt, la notice ne nomme aucun bouton** (refonte mobile) : le « ? » du coin de carte
 *  n'existe plus sous le seuil, et ses gestes vivent dans l'aide-mémoire. */
describe('l’aide-mémoire au doigt', () => {
  it('dit les gestes du doigt et les bureaux du téléphone, sans un mot de souris', () => {
    const notice = fr.briefing
      .columns(60, 25, 120, { finger: true, phone: true, mapping: CLASSIC_MAPPING })
      .flatMap((column) => column.lines)
      .join(' ');
    expect(notice).toContain('deux doigts pincent pour zoomer');
    expect(notice).toContain('Le drapeau de la réglette ouvre le dossier de la nation');
    expect(notice).toContain('Toucher net sur un avant-poste à vous');
    expect(notice).not.toMatch(/clic|souris|molette|rail/);
  });
});
