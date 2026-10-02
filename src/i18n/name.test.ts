import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fr } from './fr';

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });

/** The displayed name lives in `fr.masthead` and nowhere else; `worldwarsim` stays the code
 *  name (repo, package, Convex, domain, storage keys), so only the displayed spelling is banned. */
describe('the game is called La Manchette', () => {
  it('has no trace of the old name in what ships to the player', () => {
    const shipped = [
      ...filesUnder('src').filter((f) => !f.endsWith('name.test.ts')),
      'index.html',
      ...filesUnder('public').filter((f) => /\.(svg|html|json|webmanifest)$/.test(f)),
    ];
    const offenders = shipped.filter((f) => readFileSync(f, 'utf8').includes('WorldWarSim'));
    expect(offenders).toEqual([]);
  });

  it('keeps no dead masthead key', () => {
    expect(Object.keys(fr.masthead).sort()).toEqual(['article', 'dateline', 'title', 'word']);
  });

  it('ships the favicon cut from the real glyph, byte for byte', () => {
    expect(readFileSync('public/favicon.svg')).toEqual(
      readFileSync('Claude outputs/marque/favicon-manchette.svg'),
    );
  });
});
