'use strict';
const { palette, metadata } = require('../../utils/palette');
const { SIZES, generate } = require('../../utils/pattern');
const { canvasNode, decode } = require('../../utils/wx-canvas');
const { drawPreview } = require('../../utils/render');
const { exportSheets, saveAll } = require('../../utils/export');

Page({
  data: {
    sourcePath: '', sizes: SIZES, size: 52, mode: 'auto', dither: false,
    modes: [{ value: 'auto', label: '自动' }, { value: 'illustration', label: '插画优化' }, { value: 'photo', label: '照片优化' }],
    busy: false, exporting: false, progress: 0, error: '', hasPattern: false, stats: [], total: 0,
    patternSize: 52, actualMode: '', isDemo: metadata.isDemo, zoomOpen: false, exportFiles: [], exportStatus: ''
  },
  onLoad() { this._version = 0; this._decodeVersion = 0; this._alive = true; },
  onUnload() { this._alive = false; this._version++; this._decodeVersion++; this._image = null; this._pattern = null; },
  takePhoto() { this.pick('camera'); },
  choosePhoto() { this.pick('album'); },
  async pick(source) {
    if (wx.requirePrivacyAuthorize) {
      try { await new Promise((resolve, reject) => wx.requirePrivacyAuthorize({ success: resolve, fail: reject })); }
      catch (e) { if (this._alive) this.setData({ error: '需要同意微信隐私授权后才能选择图片。' }); return; }
    }
    if (!this._alive) return;
    wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: [source],
      success: async result => {
        if (!this._alive) return;
        const file = result.tempFiles && result.tempFiles[0];
        if (!file) return;
        const version = ++this._decodeVersion;
        this._version++; this._image = null; this._pattern = null;
        this.setData({ sourcePath: file.tempFilePath, busy: true, progress: 0, error: '', hasPattern: false, stats: [], exportFiles: [], exportStatus: '' });
        try {
          // Serialize decoding to avoid sharing a processing canvas between images.
          const previous = this._decoding || Promise.resolve();
          this._decoding = previous.catch(() => {}).then(() => decode(this, file.tempFilePath));
          const image = await this._decoding;
          if (!this._alive || version !== this._decodeVersion) return;
          this._image = image; await this.regenerate();
        } catch (e) { if (this._alive && version === this._decodeVersion) this.setData({ busy: false, error: '图片读取失败：' + (e.message || e.errMsg || '请重试') }); }
      },
      fail: e => { if (!/cancel/i.test(e.errMsg || '')) this.setData({ error: '无法选择图片，请检查相机或相册权限。' }); }
    });
  },
  selectSize(e) { const size = Number(e.currentTarget.dataset.size); if (size !== this.data.size) { this.setData({ size }); this.regenerate(); } },
  selectMode(e) { const mode = e.currentTarget.dataset.mode; if (mode !== this.data.mode) { this.setData({ mode }); this.regenerate(); } },
  toggleDither(e) { this.setData({ dither: e.detail.value }); this.regenerate(); },
  async regenerate() {
    if (!this._image) return;
    const version = ++this._version;
    this._pattern = null;
    this.setData({ busy: true, hasPattern: false, stats: [], progress: 0, error: '', exportFiles: [], exportStatus: '' });
    try {
      const pattern = await generate(this._image, { size: this.data.size, mode: this.data.mode, dither: this.data.dither, palette,
        cancelled: () => !this._alive || version !== this._version,
        progress: p => { if (this._alive && version === this._version) this.setData({ progress: Math.round(p * 100) }); }
      });
      if (!this._alive || version !== this._version) return;
      this._pattern = pattern;
      await new Promise(resolve => this.setData({ hasPattern: true, patternSize: pattern.size, stats: pattern.stats, total: pattern.cells.length,
        actualMode: pattern.mode === 'photo' ? '照片优化' : '插画优化' }, resolve));
      await this.paint('#preview', pattern);
      if (this._alive && version === this._version) this.setData({ busy: false });
    } catch (e) {
      if (!e.cancelled && this._alive && version === this._version) this.setData({ busy: false, error: e.message || '生成失败，请重试' });
    }
  },
  async paint(selector, pattern) {
    const found = await canvasNode(this, selector);
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const width = Math.max(1, found.width), height = Math.max(1, found.height);
    const ratio = Math.min(2, info.pixelRatio || 1);
    found.node.width = Math.round(width * ratio); found.node.height = Math.round(height * ratio);
    const ctx = found.node.getContext('2d'); ctx.scale(ratio, ratio);
    drawPreview(ctx, pattern, width, height);
  },
  viewSource() { wx.previewImage({ current: this.data.sourcePath, urls: [this.data.sourcePath] }); },
  async zoomPattern() {
    if (!this._pattern || this.data.busy) return;
    await new Promise(resolve => this.setData({ zoomOpen: true }, resolve));
    try { await this.paint('#zoomCanvas', this._pattern); } catch (e) { this.setData({ error: e.message }); }
  },
  closeZoom() { this.setData({ zoomOpen: false }); },
  exportCoded() { this.export(true); },
  exportPlain() { this.export(false); },
  async export(codes) {
    if (!this._pattern || this.data.busy || this.data.exporting) return;
    this.setData({ exporting: true, error: '', exportStatus: '正在绘制图纸…', exportFiles: [] });
    try {
      const files = await exportSheets(this, this._pattern, { codes, paletteName: metadata.name, isDemo: metadata.isDemo,
        progress: (done, all) => { if (this._alive) this.setData({ exportStatus: '正在导出 ' + done + '/' + all }); }
      });
      if (!this._alive) return;
      this.setData({ exportFiles: files, exportStatus: files.length > 1 ? '已导出 ' + files.length + ' 张分区图纸，坐标为全图坐标，色表为各分区用量。' : '图纸已导出，可查看或保存到相册。' });
    } catch (e) { if (this._alive) this.setData({ error: '导出失败：' + (e.message || e.errMsg || '设备内存不足，请重试'), exportStatus: '' }); }
    finally { if (this._alive) this.setData({ exporting: false }); }
  },
  viewExports() { const urls = this.data.exportFiles.map(f => f.path); if (urls.length) wx.previewImage({ current: urls[0], urls }); },
  async saveExports() {
    if (this.data.exporting || !this.data.exportFiles.length) return;
    this.setData({ exporting: true, error: '' });
    try {
      const count = await saveAll(this.data.exportFiles, (done, all) => { if (this._alive) this.setData({ exportStatus: '保存到相册 ' + done + '/' + all }); });
      if (this._alive) this.setData({ exportStatus: '已保存 ' + count + ' 张图纸到相册。' });
    } catch (e) {
      if (!this._alive) return;
      this.setData({ error: '已保存 ' + (e.saved || 0) + '/' + (e.total || 0) + ' 张。剩余图纸仍可查看；请检查相册权限后重试。' });
      if (/auth|deny|denied/i.test(e.errMsg || '')) wx.showModal({ title: '需要相册权限', content: '请在设置中允许保存到相册。', confirmText: '打开设置', success: r => { if (r.confirm) wx.openSetting({}); } });
    } finally { if (this._alive) this.setData({ exporting: false }); }
  }
});
