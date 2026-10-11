'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { generate } = require('../miniprogram/utils/pattern');
const { palette, metadata } = require('../miniprogram/utils/palette');
const { preparePalette } = require('../miniprogram/utils/color');
const { statistics } = require('../miniprogram/utils/pattern');
const { drawPreview, drawSheet, layout, exportParts } = require('../miniprogram/utils/render');
const { dogFixture } = require('./fixture');

const font = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
if (fs.existsSync(font)) GlobalFonts.registerFromPath(font, 'sans-serif');
const args = process.argv.slice(2);
function option(name) { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; }
const input = option('--input'), reference = option('--reference');
const dir = path.resolve(option('--out') || path.join(__dirname, '../artifacts', input ? 'user-image' : 'synthetic'));
fs.mkdirSync(dir, { recursive: true });
function save(canvas, name) { fs.writeFileSync(path.join(dir, name), canvas.toBuffer('image/png')); }
function rawPreview(pattern, pixelSize = 6) {
  const canvas = createCanvas(pattern.size * pixelSize, pattern.size * pixelSize);
  drawPreview(canvas.getContext('2d'), pattern, canvas.width, canvas.height, false); return canvas;
}
function baseline(source, size) {
  const c = createCanvas(size, size), ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, size, size);
  const scale = Math.min(size / source.width, size / source.height);
  ctx.drawImage(source, (size - source.width * scale) / 2, (size - source.height * scale) / 2, source.width * scale, source.height * scale);
  const d = ctx.getImageData(0, 0, size, size).data, colors = preparePalette(palette), cells = new Uint16Array(size * size);
  for (let p = 0; p < cells.length; p++) {
    let min = Infinity;
    for (let i = 0; i < colors.length; i++) {
      const delta = colors[i].rgb.reduce((sum, v, ch) => sum + (v - d[p * 4 + ch]) ** 2, 0);
      if (delta < min) { min = delta; cells[p] = i; }
    }
  }
  return { size, cells, palette: colors, stats: statistics(cells, colors) };
}
async function main() {
  let source;
  if (input) {
    const img = await loadImage(path.resolve(input));
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
    source = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
    source.getContext('2d').drawImage(img, 0, 0, source.width, source.height);
  } else source = dogFixture();
  save(source, input ? 'source.png' : 'synthetic-dog-source.png');
  const raw = source.getContext('2d').getImageData(0, 0, source.width, source.height);
  const results = [];
  let test100;
  for (const size of [52, 78, 100, 104, 120]) {
    const begin = performance.now();
    const p = await generate(raw, { size, internalTest: true, mode: 'illustration', palette });
    const preview = rawPreview(p);
    save(preview, 'pattern-' + size + '.png');
    // Offline full sheets aid review; the phone uses bounded sequential partitions.
    if (size === 100 || size === 120) {
      const options = { codes: true, cell: 28, paletteName: metadata.name, isDemo: metadata.isDemo };
      const l = layout(p, options), canvas = createCanvas(l.width, l.height);
      drawSheet(canvas.getContext('2d'), p, options); save(canvas, 'sheet-' + size + '-offline.png');
    }
    const parts = exportParts(p, true);
    for (let i = 0; i < parts.length; i++) {
      if (size !== 120) break;
      const options = { region: parts[i], codes: true, paletteName: metadata.name, isDemo: metadata.isDemo };
      const l = layout(p, options), canvas = createCanvas(l.width, l.height);
      drawSheet(canvas.getContext('2d'), p, options); save(canvas, 'sheet-120-part-' + (i + 1) + '.png');
    }
    fs.writeFileSync(path.join(dir, 'pattern-' + size + '.json'), JSON.stringify({ size, mode: p.mode, palette: p.palette.map(({ code, hex }) => ({ code, hex })), cells: Array.from(p.cells), stats: p.stats, fit: p.fit }));
    results.push({ size, beads: p.cells.length, colors: p.stats.length, totalCount: p.stats.reduce((n, s) => n + s.count, 0), codedParts: parts.length, milliseconds: Math.round(performance.now() - begin) });
    if (size === 100) test100 = p;
  }
  const legacy = baseline(source, 100);
  save(rawPreview(legacy), 'baseline-100.png');
  const photo = await generate(raw, { size: 100, internalTest: true, mode: 'photo', dither: true, palette });
  save(rawPreview(photo), 'photo-mode-100.png');
  const comparison = createCanvas(1800, 680), ctx = comparison.getContext('2d');
  ctx.fillStyle = '#FAF8F5'; ctx.fillRect(0, 0, 1800, 680);
  ctx.font = '20px sans-serif'; ctx.fillStyle = '#4D3B2D';
  const views = [source, rawPreview(legacy), rawPreview(test100)];
  const labels = [input ? '用户原图（完整画幅）' : '合成犬类测试夹具（非用户原图）', '基础缩放 + RGB 配色（非成熟软件）', '面积重采样 + OKLab · 100×100'];
  views.forEach((view, i) => {
    ctx.fillText(labels[i], i * 600 + 12, 30); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(i * 600, 55, 600, 600);
    const scale = Math.min(600 / view.width, 600 / view.height); ctx.imageSmoothingEnabled = i === 0;
    ctx.drawImage(view, i * 600 + (600 - view.width * scale) / 2, 55 + (600 - view.height * scale) / 2, view.width * scale, view.height * scale); ctx.fillStyle = '#4D3B2D';
  });
  save(comparison, 'comparison-100.png');
  if (reference) {
    const ref = await loadImage(path.resolve(reference));
    const canvas = createCanvas(1400, 760), c = canvas.getContext('2d'); c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, 1400, 760);
    c.font = '20px sans-serif'; c.fillStyle = '#49382C'; c.fillText('用户提供的参考图（可能含图例/坐标）', 16, 30); c.fillText('本算法 100×100（演示色卡）', 716, 30);
    for (const [img, x] of [[ref, 0], [rawPreview(test100), 700]]) {
      const scale = Math.min(700 / img.width, 700 / img.height); c.imageSmoothingEnabled = x === 0;
      c.drawImage(img, x + (700 - img.width * scale) / 2, 50 + (700 - img.height * scale) / 2, img.width * scale, img.height * scale);
    }
    save(canvas, 'reference-comparison-100.png');
  }
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ fixture: input ? 'user-supplied' : 'synthetic dog, NOT user artwork', realBrandPalette: !metadata.isDemo, referenceProvided: Boolean(reference), results }, null, 2));
  console.log(JSON.stringify({ output: dir, fixture: input || 'synthetic dog, NOT user artwork', results }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
