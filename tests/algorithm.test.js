'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { preparePalette, nearest, linearToLab, LINEAR, toByte } = require('../miniprogram/utils/color');
const { resample, detectMode } = require('../miniprogram/utils/image');
const { generate, SIZES } = require('../miniprogram/utils/pattern');
const { palette } = require('../miniprogram/utils/palette');
const { exportParts, layout, ticks, partStats } = require('../miniprogram/utils/render');

function solid(w, h, rgba) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width: w, height: h, data };
}
test('linear-light area average does not muddy black/white edges', async () => {
  const image = solid(104, 104, [0, 0, 0, 255]);
  for (let y = 0; y < 104; y++) for (let x = 1; x < 104; x += 2) image.data.set([255, 255, 255, 255], (y * 104 + x) * 4);
  const out = await resample(image, 52);
  assert.ok(Math.abs(toByte(out.pixels[0]) - 188) <= 1);
});
test('transparent RGB cannot introduce red or black fringes', async () => {
  const a = await resample(solid(104, 104, [255, 0, 0, 0]), 52);
  assert.ok(a.pixels.every(v => v === 1));
  const b = await resample(solid(104, 104, [0, 0, 0, 128]), 52);
  assert.ok(Math.abs(toByte(b.pixels[0]) - 187) <= 1);
});
test('contain preserves all four corner marks and aspect ratio', async () => {
  const im = solid(208, 104, [255, 255, 255, 255]);
  for (const [ox, oy] of [[0, 0], [200, 0], [0, 96], [200, 96]]) {
    for (let y = oy; y < oy + 8; y++) for (let x = ox; x < ox + 8; x++) im.data.set([0, 0, 0, 255], (y * 208 + x) * 4);
  }
  const out = await resample(im, 52);
  assert.deepEqual(out.fit, { x: 0, y: 13, width: 52, height: 26 });
  for (const [x, y] of [[0, 13], [51, 13], [0, 38], [51, 38]]) assert.equal(out.pixels[(y * 52 + x) * 3], 0);
  assert.equal(out.pixels[0], 1);
});
test('muted rose/brown is matched to muted palette entry rather than saturated red', async () => {
  const muted = [{ code: 'A01', hex: '#A58F8D' }, { code: 'A02', hex: '#B32020' }, { code: 'A03', hex: '#503333' }];
  const p = await generate(solid(104, 104, [165, 143, 141, 255]), { size: 52, mode: 'illustration', palette: muted });
  assert.ok(p.cells.every(c => c === 0));
});
test('all demo colors round-trip to their own ID and palette rejects duplicate/malformed codes', () => {
  const prepared = preparePalette(palette);
  for (let i = 0; i < prepared.length; i++) assert.equal(nearest(prepared[i].lab, prepared).index, i);
  assert.throws(() => preparePalette([{ code: 'A01', hex: '#FFFFFF' }, { code: 'A01', hex: '#000000' }]));
  assert.throws(() => preparePalette([{ code: 'RED', hex: '#xyzxyz' }]));
  assert.throws(() => preparePalette([]));
});
test('OKLab reference white/black and sRGB transfer round-trip', () => {
  const white = linearToLab(1, 1, 1);
  assert.ok(Math.abs(white[0] - 1) < 1e-6 && Math.abs(white[1]) < 1e-6 && Math.abs(white[2]) < 1e-6);
  assert.deepEqual(linearToLab(0, 0, 0), [0, 0, 0]);
  for (let n = 0; n < 256; n++) assert.equal(toByte(LINEAR[n]), n);
});
for (const size of [...SIZES, 100]) test(`size ${size}: cell, palette and count invariants; photo dithering too`, async () => {
  const im = solid(156, 104, [220, 202, 180, 255]);
  for (let y = 0; y < 104; y++) for (let x = 0; x < 156; x++) if (x > 40 && x < 100 && y > 30 && y < 80) im.data.set([90, 114, 140, 200], (y * 156 + x) * 4);
  for (const mode of ['illustration', 'photo']) {
    const p = await generate(im, { size, internalTest: true, palette, mode, dither: true });
    assert.equal(p.cells.length, size * size);
    assert.equal(p.stats.reduce((n, c) => n + c.count, 0), size * size);
    assert.ok(p.cells.every(c => c < palette.length));
    assert.ok(p.stats.every((c, i) => i === 0 || c.count <= p.stats[i - 1].count));
    for (const codes of [true, false]) {
      const cover = new Uint8Array(size * size);
      const sums = new Map();
      for (const r of exportParts(p, codes)) {
        const l = layout(p, { codes, region: r });
        assert.ok(l.width <= 2048 && l.height <= 2048);
        for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) cover[y * size + x]++;
        assert.equal(partStats(p, r).reduce((sum, s) => sum + s.count, 0), r.width * r.height);
        for (const s of partStats(p, r)) sums.set(s.code, (sums.get(s.code) || 0) + s.count);
      }
      assert.ok(cover.every(c => c === 1), 'each bead exported exactly once');
      for (const stat of p.stats) assert.equal(sums.get(stat.code), stat.count);
    }
  }
});
test('512-color palette dynamically partitions within safe canvas dimensions', () => {
  const p = { size: 120, palette: Array.from({ length: 512 }, (_, i) => ({ code: 'T' + i, hex: '#FFFFFF' })), cells: Uint16Array.from({ length: 14400 }, (_, i) => i % 512) };
  for (const codes of [true, false]) {
    let count = 0;
    for (const r of exportParts(p, codes)) { const l = layout(p, { region: r, codes }); assert.ok(l.height <= 2048 && l.width <= 2048); count += r.width * r.height; }
    assert.equal(count, 14400);
  }
});
test('coordinate first/last match and three-digit labels cannot overlap', () => {
  for (const size of [...SIZES, 100]) for (const cell of [12, 28]) {
    const t = ticks(0, size, cell); assert.equal(t[0], 1); assert.equal(t[t.length - 1], size);
    for (let i = 1; i < t.length; i++) assert.ok((t[i] - t[i - 1]) * cell >= 32);
  }
});
test('invalid image/size/mode and cancellation fail explicitly', async () => {
  await assert.rejects(generate(solid(2, 2, [0, 0, 0, 255]), { size: 100, palette }));
  await assert.rejects(generate(solid(2, 2, [0, 0, 0, 255]), { size: 52, mode: 'other', palette }));
  await assert.rejects(generate({ width: 2, height: 2, data: [] }, { palette }));
  await assert.rejects(generate(solid(2, 2, [0, 0, 0, 255]), { palette, cancelled: () => true }), e => e.cancelled === true);
  assert.equal(detectMode(solid(10, 10, [0, 0, 0, 0])), 'illustration');
});
test('isolated one-cell eye highlight is not erased by a majority filter', async () => {
  const im = solid(52, 52, [0, 0, 0, 255]); im.data.set([255, 255, 255, 255], (26 * 52 + 26) * 4);
  const p = await generate(im, { palette: [{ code: 'A01', hex: '#000000' }, { code: 'A02', hex: '#FFFFFF' }], mode: 'illustration' });
  assert.equal(p.cells[26 * 52 + 26], 1); assert.equal(p.stats.find(s => s.code === 'A02').count, 1);
});
