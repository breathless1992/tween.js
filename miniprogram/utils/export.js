'use strict';
const { layout, exportParts, drawSheet } = require('./render');
const { canvasNode, nextFrame, png } = require('./wx-canvas');

async function exportSheets(page, pattern, options = {}) {
  const parts = exportParts(pattern, options.codes !== false), files = [];
  const { node: canvas } = await canvasNode(page, '#exporter');
  try {
    for (let i = 0; i < parts.length; i++) {
      const renderOptions = Object.assign({}, options, { region: parts.length === 1 ? undefined : parts[i] });
      const l = layout(pattern, renderOptions);
      if (l.width > 2048 || l.height > 2048) throw new Error('色卡或色号过多，图纸超出安全画布范围');
      canvas.width = l.width; canvas.height = l.height;
      drawSheet(canvas.getContext('2d'), pattern, renderOptions);
      await nextFrame(canvas);
      const path = await png(canvas, page);
      files.push({ path, region: parts[i], width: l.width, height: l.height });
      if (options.progress) options.progress(i + 1, parts.length);
      // Each PNG is exported sequentially; only one backing store is allocated.
      canvas.width = 1; canvas.height = 1;
    }
  } finally { canvas.width = 1; canvas.height = 1; }
  return files;
}
function savePhoto(path) {
  return new Promise((resolve, reject) => wx.saveImageToPhotosAlbum({ filePath: path, success: resolve, fail: reject }));
}
async function saveAll(files, progress) {
  let saved = 0;
  for (const file of files) {
    try { await savePhoto(file.path); saved++; if (progress) progress(saved, files.length); }
    catch (error) { error.saved = saved; error.total = files.length; throw error; }
  }
  return saved;
}
module.exports = { exportSheets, saveAll };
