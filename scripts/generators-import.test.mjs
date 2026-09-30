import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Les générateurs tournent sous Node seul, sans Vite : ce que le domaine leur prête doit donc
 * se résoudre **tel quel**. Un import relatif sans extension passe partout ailleurs — Vite,
 * esbuild de Convex, tsc en mode bundler — et ne casse que là ; les tests d'égalité octet à
 * octet, eux, relisent des fichiers déjà cuits et restent verts pendant que le générateur ne
 * démarre plus.
 */
const importedFromSrc = new Set();
for (const file of readdirSync(root + 'scripts').filter((name) =>
  /^generate-.*\.mjs$/.test(name),
)) {
  const source = readFileSync(root + 'scripts/' + file, 'utf8');
  for (const [, path] of source.matchAll(/from '\.\.\/(src\/[^']+)'/g)) importedFromSrc.add(path);
}

describe('ce que les générateurs importent de src/', () => {
  it('en importe au moins un, sans quoi ce garde ne garde rien', () => {
    expect(importedFromSrc.size).toBeGreaterThan(0);
  });

  it.each([...importedFromSrc])('%s se charge sous Node seul', (path) => {
    const href = pathToFileURL(root + path).href;
    expect(() =>
      execFileSync(process.execPath, ['--input-type=module', '-e', `await import('${href}')`], {
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
