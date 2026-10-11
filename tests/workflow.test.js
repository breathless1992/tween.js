'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCanvas, Image, loadImage } = require('@napi-rs/canvas');
const { dogFixture } = require('../tools/fixture');
const { decode } = require('../miniprogram/utils/wx-canvas');
const { exportSheets, saveAll } = require('../miniprogram/utils/export');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-workflow-'));
const source = path.join(tmp, 'dog.png'); fs.writeFileSync(source, dogFixture().toBuffer('image/png'));
const canvases = Object.fromEntries(['#preview', '#processing', '#exporter', '#zoomCanvas'].map(s => {
  const canvas = createCanvas(1, 1);
  canvas.createImage = () => new Image(); canvas.requestAnimationFrame = callback => setImmediate(callback);
  return [s, canvas];
}));
let exported = 0, pngFailure = false, albumCalls = 0, albumFailAt = Infinity;
global.wx = {
  createSelectorQuery: () => {
    let selected;
    const q = { in: () => q, select: s => { selected = s; return q; }, fields: () => q,
      exec: callback => setImmediate(() => callback([{ node: canvases[selected], width: 340, height: 340 }])) };
    return q;
  },
  getImageInfo: options => loadImage(options.src).then(img => options.success({ width: img.width, height: img.height, path: options.src }), options.fail),
  getWindowInfo: () => ({ pixelRatio: 2 }),
  chooseMedia: options => setImmediate(() => options.success({ tempFiles: [{ tempFilePath: source }] })),
  canvasToTempFilePath: options => {
    if (pngFailure) { options.fail({ errMsg: 'simulated export failure' }); return; }
    assert.equal(options.destWidth, options.canvas.width); assert.equal(options.destHeight, options.canvas.height);
    assert.ok(options.destWidth <= 2048 && options.destHeight <= 2048);
    const file = path.join(tmp, 'export-' + ++exported + '.png');
    fs.writeFileSync(file, options.canvas.toBuffer('image/png'));
    setImmediate(() => options.success({ tempFilePath: file }));
  },
  saveImageToPhotosAlbum: options => { albumCalls++; albumCalls === albumFailAt ? options.fail({ errMsg: 'auth denied' }) : options.success({}); },
  showModal: options => options.success({ confirm: false }),
  previewImage: options => { assert.ok(options.urls.length > 0); }
};
let definition;
global.Page = page => { definition = page; };
require('../miniprogram/pages/index/index');
function page() {
  const p = Object.assign({}, definition, { data: structuredClone(definition.data), setData(patch, callback) { Object.assign(this.data, patch); if (callback) setImmediate(callback); } });
  p.onLoad(); return p;
}
async function until(predicate) {
  const deadline = Date.now() + 15000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Workflow timeout'); await new Promise(r => setTimeout(r, 5)); }
}

test('upload -> automatic generation, rapid size switches, mode change, zoom and real PNG rendering through mocked WeChat bridge', async () => {
  const p = page(); p.choosePhoto();
  await until(() => p.data.hasPattern && !p.data.busy);
  assert.equal(p._pattern.size, 52); assert.equal(p.data.total, 2704);
  p.selectSize({ currentTarget: { dataset: { size: 78 } } });
  p.selectSize({ currentTarget: { dataset: { size: 104 } } });
  p.selectSize({ currentTarget: { dataset: { size: 120 } } });
  await until(() => p.data.hasPattern && !p.data.busy && p._pattern.size === 120);
  assert.equal(p.data.stats.reduce((sum, s) => sum + s.count, 0), 14400);
  p.selectMode({ currentTarget: { dataset: { mode: 'photo' } } });
  await until(() => !p.data.busy); assert.equal(p._pattern.mode, 'photo');
  await p.zoomPattern(); assert.equal(p.data.zoomOpen, true); p.closeZoom();
  await p.export(true); assert.equal(p.data.exportFiles.length, 9);
  const coded = p.data.exportFiles;
  for (const file of coded) {
    const img = await loadImage(file.path); assert.equal(img.width, file.width); assert.equal(img.height, file.height);
    assert.ok(fs.statSync(file.path).size > 1000);
  }
  assert.equal(canvases['#exporter'].width, 1);
  await p.export(false); assert.equal(p.data.exportFiles.length, 1);
  await p.saveExports(); assert.match(p.data.exportStatus, /已保存 1/);
  p.onUnload(); assert.equal(p._image, null);
});
test('actual JPG decode respects 1024px processing limit and releases backing store', async () => {
  const image = createCanvas(1600, 900), ctx = image.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 1600, 900); gradient.addColorStop(0, '#ECE4D9'); gradient.addColorStop(1, '#6C849A');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1600, 900);
  const jpg = path.join(tmp, 'sample.jpg'); fs.writeFileSync(jpg, image.toBuffer('image/jpeg'));
  const decoded = await decode(page(), jpg);
  assert.equal(decoded.width, 1024); assert.equal(decoded.height, 576); assert.equal(decoded.data.length, 1024 * 576 * 4);
  assert.ok(decoded.data.every((v, i) => i % 4 !== 3 || v === 255));
  assert.equal(canvases['#processing'].width, 1);
});
test('failed export releases backing store; partial album failure reports exact saved count', async () => {
  const p = page(); p.choosePhoto(); await until(() => p.data.hasPattern && !p.data.busy);
  pngFailure = true;
  await assert.rejects(exportSheets(p, p._pattern, { codes: true }));
  assert.equal(canvases['#exporter'].width, 1); pngFailure = false;
  albumCalls = 0; albumFailAt = 2;
  await assert.rejects(saveAll([{ path: source }, { path: source }, { path: source }]), e => e.saved === 1 && e.total === 3);
  albumFailAt = Infinity; p.onUnload();
});
test.after(() => { delete global.wx; delete global.Page; fs.rmSync(tmp, { recursive: true, force: true }); });
