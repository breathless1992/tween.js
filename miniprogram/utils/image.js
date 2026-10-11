'use strict';
const { LINEAR, clamp, linearToLab, linearToSRGB, sRGBToLinear } = require('./color');
const pause = () => new Promise(resolve => setTimeout(resolve, 0));

function checkCancelled(options) {
  if (options.cancelled && options.cancelled()) {
    const e = new Error('生成已取消'); e.cancelled = true; throw e;
  }
}
function validateImage(image) {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 ||
      image.width > 2048 || image.height > 2048 || !image.data || image.data.length !== image.width * image.height * 4) {
    throw new Error('图片像素无效，处理边长须不超过 2048');
  }
}
function detectMode(image) {
  // Stable heuristic, manual override is always available.
  const bins = new Set(); let transparent = 0, count = 0;
  const step = Math.max(1, Math.floor(image.width * image.height / 4096));
  for (let p = 0; p < image.width * image.height; p += step) {
    const i = p * 4; count++;
    if (image.data[i + 3] < 240) transparent++;
    if (image.data[i + 3] > 30) bins.add((image.data[i] >> 4) * 256 + (image.data[i + 1] >> 4) * 16 + (image.data[i + 2] >> 4));
  }
  return transparent / count > 0.03 || bins.size < 240 ? 'illustration' : 'photo';
}

// Exact area integration in linear light, alpha composited before filtering.
// Fit the full source into a square, never crop or stretch it.
async function resample(image, size, options = {}) {
  validateImage(image);
  const { width: w, height: h, data } = image;
  const scale = Math.min(size / w, size / h);
  const ox = (size - w * scale) / 2, oy = (size - h * scale) / 2;
  const pixels = new Float32Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    checkCancelled(options);
    for (let x = 0; x < size; x++) {
      const out = (y * size + x) * 3;
      const sx0 = Math.max(0, (x - ox) / scale), sx1 = Math.min(w, (x + 1 - ox) / scale);
      const sy0 = Math.max(0, (y - oy) / scale), sy1 = Math.min(h, (y + 1 - oy) / scale);
      const total = 1 / (scale * scale);
      let r = 0, g = 0, b = 0, gr = 0, gg = 0, gb = 0, covered = 0;
      let ir = 0, ig = 0, ib = 0, iw = 0, minL = 1, maxL = 0;
      // Upsampling uses the same exact box integration; no invented texture.
      if (sx1 > sx0 && sy1 > sy0) {
        for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
          const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
          for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
            const weight = wy * (Math.min(sx + 1, sx1) - Math.max(sx, sx0));
            const i = (sy * w + sx) * 4, alpha = data[i + 3] / 255;
            // Transparent RGB has no effect, even if it contains red/black garbage.
            const cr = LINEAR[data[i]] * alpha + 1 - alpha;
            const cg = LINEAR[data[i + 1]] * alpha + 1 - alpha;
            const cb = LINEAR[data[i + 2]] * alpha + 1 - alpha;
            r += weight * cr; g += weight * cg; b += weight * cb;
            if (options.mode === 'illustration') {
              gr += weight * (alpha === 1 ? data[i] / 255 : linearToSRGB(cr));
              gg += weight * (alpha === 1 ? data[i + 1] / 255 : linearToSRGB(cg));
              gb += weight * (alpha === 1 ? data[i + 2] / 255 : linearToSRGB(cb));
              const light = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
              const inkWeight = weight / (0.15 + light);
              ir += inkWeight * cr; ig += inkWeight * cg; ib += inkWeight * cb; iw += inkWeight;
              minL = Math.min(minL, light); maxL = Math.max(maxL, light);
            }
            covered += weight;
          }
        }
      }
      const pad = Math.max(0, total - covered);
      pixels[out] = clamp((r + pad) / total);
      pixels[out + 1] = clamp((g + pad) / total);
      pixels[out + 2] = clamp((b + pad) / total);
      if (options.mode === 'illustration') {
        // Perceptual area blend keeps thin ink legible. Alpha still composites in
        // linear light before this deliberate illustration-specific adjustment.
        pixels[out] = 0.2 * pixels[out] + 0.8 * sRGBToLinear(clamp((gr + pad) / total));
        pixels[out + 1] = 0.2 * pixels[out + 1] + 0.8 * sRGBToLinear(clamp((gg + pad) / total));
        pixels[out + 2] = 0.2 * pixels[out + 2] + 0.8 * sRGBToLinear(clamp((gb + pad) / total));
        if (maxL - minL > 0.25 && iw > 0) {
          // A bounded dark-coverage bias protects subcell ink. It cannot turn
          // a uniform area into a dark spot or copy the single darkest pixel.
          const whiteWeight = pad / 1.15, denominator = iw + whiteWeight;
          pixels[out] = 0.75 * pixels[out] + 0.25 * (ir + whiteWeight) / denominator;
          pixels[out + 1] = 0.75 * pixels[out + 1] + 0.25 * (ig + whiteWeight) / denominator;
          pixels[out + 2] = 0.75 * pixels[out + 2] + 0.25 * (ib + whiteWeight) / denominator;
        }
      }
    }
    if (y % 8 === 7) { if (options.progress) options.progress(0.05 + 0.4 * (y + 1) / size); await pause(); }
  }
  return { pixels, fit: { x: ox, y: oy, width: w * scale, height: h * scale } };
}

function enhance(pixels, size, mode) {
  const output = pixels.slice();
  const light = new Float32Array(size * size);
  for (let i = 0; i < light.length; i++) light[i] = 0.2126 * pixels[i * 3] + 0.7152 * pixels[i * 3 + 1] + 0.0722 * pixels[i * 3 + 2];
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const p = y * size + x, l = light[p];
    const neighbors = [light[p - 1], light[p + 1], light[p - size], light[p + size]];
    const mean = (neighbors[0] + neighbors[1] + neighbors[2] + neighbors[3] + 4 * l) / 8;
    const range = Math.max(l, ...neighbors) - Math.min(l, ...neighbors);
    // Protect thin outlines without strong halos; only modify luminance.
    let delta = clamp((l - mean) * (mode === 'illustration' ? 0.5 : 0.3), -0.045, 0.045);
    if (range < 0.025) delta = 0;
    // Same multiplicative factor for all channels preserves neutral/pink/brown hue.
    const ratio = l > 0.015 ? clamp((l + delta) / l, 0.78, 1.18) : 1;
    for (let c = 0; c < 3; c++) output[p * 3 + c] = clamp(pixels[p * 3 + c] * ratio);
  }
  return output;
}
function labs(pixels) {
  const out = new Float32Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 3) out.set(linearToLab(pixels[i], pixels[i + 1], pixels[i + 2]), i);
  return out;
}
module.exports = { resample, enhance, labs, detectMode, validateImage, checkCancelled, pause };
