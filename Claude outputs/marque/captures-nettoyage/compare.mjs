import fs from 'fs'; import { PNG } from 'pngjs';
const [,, A, B, TOL='1'] = process.argv; const tol = +TOL;
const lines = [];
for (const f of fs.readdirSync(A).filter(f => f.endsWith('.png')).sort()) {
  if (!fs.existsSync(`${B}/${f}`)) { lines.push(`${f}: MISSING`); continue; }
  const a = PNG.sync.read(fs.readFileSync(`${A}/${f}`)), b = PNG.sync.read(fs.readFileSync(`${B}/${f}`));
  if (a.width !== b.width || a.height !== b.height) { lines.push(`${f}: SIZE ${a.width}x${a.height} vs ${b.width}x${b.height}`); continue; }
  let over = 0, max = 0, minx=1e9,miny=1e9,maxx=-1,maxy=-1;
  for (let i = 0; i < a.data.length; i += 4) {
    let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[i+c]-b.data[i+c]));
    if (d > max) max = d;
    if (d > tol) { over++; const p=i/4, x=p%a.width, y=(p/a.width)|0; minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y); }
  }
  lines.push(`${f}: pixels>${tol}: ${over} · écart max: ${max}/255${over?` · zone x${minx}-${maxx} y${miny}-${maxy}`:''}`);
}
console.log(lines.join('\n'));
