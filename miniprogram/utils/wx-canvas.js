'use strict';

function canvasNode(page, selector) {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery().in(page).select(selector).fields({ node: true, size: true }).exec(result => {
      const found = result && result[0];
      if (!found || !found.node) reject(new Error('Canvas 未就绪，请重试'));
      else resolve(found);
    });
  });
}
function imageInfo(path) { return new Promise((resolve, reject) => wx.getImageInfo({ src: path, success: resolve, fail: reject })); }
function loadImage(canvas, path) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => resolve(img); img.onerror = () => reject(new Error('图片无法解码')); img.src = path;
  });
}
async function decode(page, path) {
  const info = await imageInfo(path);
  const selected = await canvasNode(page, '#processing');
  const canvas = selected.node;
  const scale = Math.min(1, 1024 / Math.max(info.width, info.height));
  canvas.width = Math.max(1, Math.round(info.width * scale)); canvas.height = Math.max(1, Math.round(info.height * scale));
  try {
    const img = await loadImage(canvas, info.path || path);
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: pixels.width, height: pixels.height, data: pixels.data };
  } finally {
    // Release the processing backing store, including on readback failure.
    canvas.width = 1; canvas.height = 1;
  }
}
function nextFrame(canvas) {
  return new Promise(resolve => {
    if (canvas.requestAnimationFrame) canvas.requestAnimationFrame(resolve);
    else setTimeout(resolve, 32);
  });
}
function png(canvas, page) {
  return new Promise((resolve, reject) => wx.canvasToTempFilePath({ canvas, x: 0, y: 0, width: canvas.width, height: canvas.height,
    destWidth: canvas.width, destHeight: canvas.height, fileType: 'png', success: r => resolve(r.tempFilePath), fail: reject }, page));
}
module.exports = { canvasNode, decode, nextFrame, png };
