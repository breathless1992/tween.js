'use strict';

const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
});
function clamp(v, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }
function toByte(v) {
  v = clamp(v);
  return Math.round(255 * linearToSRGB(v));
}
function linearToSRGB(v) { return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }
function sRGBToLinear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function linearToLab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function hexRGB(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
function preparePalette(palette) {
  if (!Array.isArray(palette) || !palette.length || palette.length > 512) throw new Error('色卡必须包含 1–512 种颜色');
  const codes = new Set();
  return palette.map(p => {
    if (!p || !/^[A-Z][A-Z0-9]{1,7}$/.test(p.code) || codes.has(p.code) || !/^#[0-9a-f]{6}$/i.test(p.hex)) {
      throw new Error('色卡需要唯一的字母数字色号及六位 HEX 颜色');
    }
    codes.add(p.code);
    const rgb = hexRGB(p.hex);
    const linear = rgb.map(v => LINEAR[v]);
    return { code: p.code, hex: p.hex.toUpperCase(), rgb, linear, lab: linearToLab(...linear) };
  });
}
function distance(a, b) {
  const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  // Chroma is deliberately important: neutral pink/brown must not match a saturated red.
  return dl * dl + 1.6 * (da * da + db * db);
}
function nearest(lab, palette) {
  let index = 0, error = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const e = distance(lab, palette[i].lab);
    if (e < error) { error = e; index = i; }
  }
  return { index, error };
}
function ink(hex) {
  const rgb = hexRGB(hex);
  const luminance = 0.2126 * LINEAR[rgb[0]] + 0.7152 * LINEAR[rgb[1]] + 0.0722 * LINEAR[rgb[2]];
  return luminance > 0.179 ? '#17212B' : '#FFFFFF';
}
module.exports = { LINEAR, clamp, toByte, linearToSRGB, sRGBToLinear, linearToLab, preparePalette, distance, nearest, ink };
