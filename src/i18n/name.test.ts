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
});

const pngSize = (file: string) => {
  const header = readFileSync(file);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
};

describe('the installable app ships its assets', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
    icons: { src: string; sizes: string }[];
  };
  const html = readFileSync('index.html', 'utf8');

  it('cites icons that exist at the announced size', () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      const { width, height } = pngSize(join('public', icon.src));
      expect(`${width}x${height}`).toBe(icon.sizes);
    }
  });

  it('is cited by index.html with its Apple icon and its link preview image', () => {
    expect(html).toContain('href="/manifest.webmanifest"');
    expect(html).toContain('href="/apple-touch-icon.png"');
    expect(html).toContain('/og-image.png');
    expect(pngSize('public/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
    expect(pngSize('public/og-image.png')).toEqual({ width: 1200, height: 630 });
  });

  it('keeps the favicon in the three colours of the charter', () => {
    const favicon = readFileSync('public/favicon.svg', 'utf8').toLowerCase();
    for (const colour of ['#e4d8bd', '#2a2118', '#9d4638']) expect(favicon).toContain(colour);
  });
});
