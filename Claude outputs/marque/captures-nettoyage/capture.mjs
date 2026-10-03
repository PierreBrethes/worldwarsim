import { chromium } from 'playwright-core';
import fs from 'fs';
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const B = 'http://localhost:5173'; const c2 = fs.readFileSync('code2.txt','utf8');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const vp = { width: 1440, height: 900 };
const noMotion = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;
async function shot(page, name) { await page.addStyleTag({ content: noMotion }); await page.waitForTimeout(600); await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); }
// anonymous
let ctx = await browser.newContext({ viewport: vp }); let p = await ctx.newPage();
await p.goto(B + '/connexion'); await p.waitForTimeout(2000); await shot(p, '01-connexion');
await p.goto(B + '/rejoindre/' + c2); await p.waitForTimeout(2500); await shot(p, '02-rejoindre');
await ctx.close();
// A
ctx = await browser.newContext({ viewport: vp, storageState: 'a.json' }); p = await ctx.newPage();
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto(B + '/accueil'); await p.waitForTimeout(2500); await shot(p, '03-accueil');
await p.getByText('salon ' + c2).click(); await p.waitForURL('**/salon'); await p.waitForTimeout(2500); await shot(p, '04-salon');
await p.goto(B + '/accueil'); await p.waitForTimeout(2000);
await p.getByText(/AX8GN3/).first().click(); await p.waitForURL('**/plateau', { timeout: 15000 }); await p.waitForTimeout(12000);
await shot(p, '11-aide-memoire');
await p.getByRole('button', { name: /compris/ }).click(); await p.waitForTimeout(1000);
await shot(p, '05-plateau');
for (const [name, rx] of [['06-economie', /^écon\./i], ['07-abaque', /^abaque/i], ['08-presse', /^presse/i]]) {
  await p.getByRole('link', { name: rx }).first().click(); await p.waitForTimeout(2000); await shot(p, name);
  await p.keyboard.press('Escape'); await p.waitForTimeout(800);
}
await p.locator('a[href*="journal"]').first().click(); await p.waitForTimeout(2000); await shot(p, '10-journal');
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
console.log(await p.locator('[title]').evaluateAll(e => e.map(x => x.getAttribute('title')).filter(Boolean).join(' | ')));
await browser.close();
