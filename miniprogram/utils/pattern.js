'use strict';
const { preparePalette, nearest, distance, clamp } = require('./color');
const { resample, enhance, labs, detectMode, checkCancelled, pause } = require('./image');
const SIZES = [52, 78, 104, 120];

function statistics(cells, palette) {
  const counts = new Uint32Array(palette.length);
  for (const cell of cells) counts[cell]++;
  return palette.map((p, i) => ({ code: p.code, hex: p.hex, count: counts[i], index: i }))
    .filter(p => p.count).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}
async function generate(image, options = {}) {
  const size = options.size === undefined ? 52 : options.size;
  if (!SIZES.includes(size) && !(options.internalTest && size === 100)) throw new Error('不支持的图纸尺寸');
  if (!['auto', 'illustration', 'photo', undefined].includes(options.mode)) throw new Error('无效的优化模式');
  const palette = preparePalette(options.palette);
  const mode = !options.mode || options.mode === 'auto' ? detectMode(image) : options.mode;
  const sample = await resample(image, size, Object.assign({}, options, { mode }));
  const processed = enhance(sample.pixels, size, mode);
  const target = labs(processed), work = target.slice();
  const cells = new Uint16Array(size * size);
  const strength = mode === 'photo' && options.dither ? 0.55 : 0;
  for (let y = 0; y < size; y++) {
    checkCancelled(options);
    const reverse = y % 2 === 1, direction = reverse ? -1 : 1;
    for (let step = 0; step < size; step++) {
      const x = reverse ? size - 1 - step : step, p = y * size + x, i = p * 3;
      const chosen = nearest([work[i], work[i + 1], work[i + 2]], palette);
      cells[p] = chosen.index;
      if (strength) {
        const error = [0, 1, 2].map(c => clamp(work[i + c] - palette[chosen.index].lab[c], -0.06, 0.06));
        [[x + direction, y, 7 / 16], [x - direction, y + 1, 3 / 16], [x, y + 1, 5 / 16], [x + direction, y + 1, 1 / 16]].forEach(([nx, ny, weight]) => {
          if (nx < 0 || nx >= size || ny >= size) return;
          const ni = (ny * size + nx) * 3;
          // Avoid sending error across a strong edge (eye highlights / outlines).
          if (distance([target[i], target[i + 1], target[i + 2]], [target[ni], target[ni + 1], target[ni + 2]]) > 0.012) return;
          for (let c = 0; c < 3; c++) work[ni + c] += error[c] * weight * strength;
        });
      }
    }
    if (y % 8 === 7) { if (options.progress) options.progress(0.45 + 0.5 * (y + 1) / size); await pause(); }
  }
  // No unconditional majority filter: one-cell eyes/letters/paw details are valid.
  const stats = statistics(cells, palette);
  checkCancelled(options);
  if (options.progress) options.progress(1);
  return { size, width: size, height: size, cells, palette, stats, mode, fit: sample.fit, source: { width: image.width, height: image.height } };
}
module.exports = { SIZES, generate, statistics };
