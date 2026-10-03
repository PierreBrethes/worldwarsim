import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../map/engine/palette';

/**
 * **Les couleurs suivent leurs variables** (charte-1b, 03/10/2026). Une encre écrite en dur à
 * côté de `--ink` est une encre qui ne suivra pas le jour où `--ink` change : le relevé de la
 * charte en avait trouvé 151. Ce fichier est ce qui empêche le retour.
 */
const root = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const sourceFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const tokenColors = (): ReadonlyMap<string, string> => {
  const declared = new Map<string, string>();
  for (const [, name, value] of read('src/styles/tokens.css').matchAll(
    /^\s*(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/gm,
  )) {
    declared.set(name!, value!.toLowerCase());
  }
  return declared;
};

/**
 * Où une variable CSS ne peut pas être lue, ou n'est pas la source : le moteur de carte (canvas
 * et three.js), les encres de nation, les planches, et `tokens.css` qui les déclare.
 */
const holdsLiterals = (path: string): boolean =>
  path.startsWith('src/map/engine/') ||
  path.startsWith('src/emblems/') ||
  path === 'src/domain/nations.ts' ||
  path === 'src/styles/tokens.css';

describe('les couleurs suivent leurs variables', () => {
  it('n’écrit plus l’encre ni le bureau de la carte en transparence', () => {
    const offenders = sourceFiles('src').filter((path) =>
      /rgba\(\s*(42,\s*33,\s*24|23,\s*18,\s*8)\b/.test(read(path)),
    );
    expect(offenders, 'utiliser --ink ou --map-desk, voir src/styles/tokens.css').toEqual([]);
  });

  it('n’écrit plus en hexadécimal une couleur que tokens.css nomme', () => {
    const named = new Map<string, string>();
    for (const [name, hex] of tokenColors()) if (!named.has(hex)) named.set(hex, name);

    const offenders = sourceFiles('src')
      .filter((path) => !holdsLiterals(path))
      .flatMap((path) =>
        [...stripComments(read(path)).matchAll(/#[0-9a-fA-F]{6}\b/g)]
          .filter(([hex]) => named.has(hex.toLowerCase()))
          .map(([hex]) => `${path}: ${hex} est ${named.get(hex.toLowerCase())}`),
      );
    expect(offenders).toEqual([]);
  });

  it('garde la palette du moteur de carte égale à tokens.css', () => {
    const declared = tokenColors();
    const shared = {
      desk: '--map-desk',
      paper: '--paper',
      sea: '--sea',
      seaInk: '--sea-ink',
      neutralLand: '--land',
      border: '--ink',
      graticule: '--ink-quiet',
      plinthTop: '--plinth-top',
      plinthBottom: '--plinth-bottom',
      worldRim: '--border-world',
    } as const satisfies Partial<Record<keyof typeof PALETTE, string>>;

    for (const [key, variable] of Object.entries(shared)) {
      const token = declared.get(variable);
      expect(token, `${variable} n’est pas déclaré dans tokens.css`).toBeDefined();
      expect(PALETTE[key as keyof typeof shared].toLowerCase(), `PALETTE.${key}`).toBe(token);
    }
  });
});
