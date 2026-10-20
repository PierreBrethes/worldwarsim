import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **Les plans sont une échelle, et elle se vérifie ici** (retours du 11/09, ligne 6 : les modales
 * passaient sous le bandeau des ressources). Un `z-index` écrit en dur dans un composant ne se
 * compare à rien : celui qui l'écrit ne voit pas les autres fichiers, et le jour où deux couches
 * se croisent personne ne sait laquelle avait raison. Les jetons de `tokens.css` sont la réponse,
 * et ce fichier est ce qui les empêche de se redéfaire — l'ordre attendu est du fond vers l'avant
 * et rien ne le rattrape à l'œil, sinon une partie en prod.
 */
const root = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** Du fond vers l'avant. La carte est le plan zéro : elle n'a pas de jeton, elle est le fond. */
const LADDER = [
  '--z-marker',
  '--z-indicator',
  '--z-band',
  '--z-menu',
  '--z-window',
  '--z-popin',
  '--z-rose',
  '--z-veil',
  '--z-notice',
] as const;

const tokens = (): ReadonlyMap<string, number> => {
  const declared = new Map<string, number>();
  for (const [, name, value] of read('src/styles/tokens.css').matchAll(
    /(--z-[a-z-]+):\s*(\d+);/g,
  )) {
    declared.set(name!, Number(value));
  }
  return declared;
};

const sourceFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
  });

describe('l’échelle des plans', () => {
  it('monte dans l’ordre, du fond vers l’avant', () => {
    const declared = tokens();
    const ranked = LADDER.map((name) => {
      const value = declared.get(name);
      expect(value, `${name} n’est pas déclaré dans tokens.css`).toBeTypeOf('number');
      return [name, value!] as const;
    });

    for (const [index, [name, value]] of ranked.entries()) {
      const next = ranked[index + 1];
      if (next === undefined) continue;
      expect(
        value,
        `${name} doit rester sous ${next[0]} : c’est l’ordre que l’écran tient.`,
      ).toBeLessThan(next[1]);
    }
  });

  /** Le bug de la partie de contrôle, en une ligne : c'est cette comparaison-là qui avait lâché. */
  it('tient toute fenêtre et toute modale au-dessus du bandeau', () => {
    const declared = tokens();
    expect(declared.get('--z-window')!).toBeGreaterThan(declared.get('--z-band')!);
  });

  it('n’emploie aucun jeton de plan qui ne soit déclaré', () => {
    const declared = tokens();
    const unknown = new Set<string>();
    for (const path of [...sourceFiles('src')]) {
      for (const [, name] of read(path).matchAll(/var\((--z-[a-z-]+)\)/g)) {
        if (!declared.has(name!)) unknown.add(`${name} (${path})`);
      }
    }
    expect([...unknown]).toEqual([]);
  });
});

/**
 * **Une étiquette dont le marqueur *est* une planche la garde au repli.** Le niveau de détail
 * générique éteint le bloc entier (`.label--glyph .label-block { opacity: 0 }`), ce qui convient
 * à une étiquette de mots et efface une étiquette d'image — c'est ainsi qu'une installation
 * relevée était invisible et insensible au pointeur hors du niveau détaillé, et que le seul geste
 * qui ouvre « saboter » n'existait pas pour le joueur (retours du 11/09, lignes 4 et 5).
 */
describe('les étiquettes qui portent une planche', () => {
  it('gardent leur planche visible et cliquable au niveau replié', () => {
    const css = read('src/styles/labels.css');
    for (const type of ['building', 'stack', 'installation']) {
      const rule = new RegExp(
        `\\.label--${type}\\.label--glyph \\.label-block \\{[^}]*opacity: 1;[^}]*pointer-events: auto;`,
      );
      expect(
        rule.test(css),
        `label--${type} perd sa planche au repli : le marqueur disparaît du plateau.`,
      ).toBe(true);
    }
  });
});
