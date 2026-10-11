'use strict';
const { ink } = require('./color');
const { statistics } = require('./pattern');

function region(pattern, part) {
  const r = part || { x: 0, y: 0, width: pattern.size, height: pattern.size };
  if (![r.x, r.y, r.width, r.height].every(Number.isInteger) || r.x < 0 || r.y < 0 || r.width < 1 || r.height < 1 || r.x + r.width > pattern.size || r.y + r.height > pattern.size) throw new Error('无效的分区');
  return r;
}
function partStats(pattern, r) {
  const cells = new Uint16Array(r.width * r.height);
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) cells[y * r.width + x] = pattern.cells[(r.y + y) * pattern.size + r.x + x];
  return statistics(cells, pattern.palette);
}
function layout(pattern, options = {}) {
  const r = region(pattern, options.region);
  const cell = options.cell || (options.codes === false ? 12 : 28);
  const margin = 44, top = 76, stats = partStats(pattern, r);
  const width = Math.max(520, r.width * cell + margin * 2);
  const gx = Math.floor((width - r.width * cell) / 2), gy = top;
  const columns = Math.max(1, Math.floor((width - 40) / 140));
  const legendTop = gy + r.height * cell + 56;
  const height = legendTop + 36 + Math.ceil(stats.length / columns) * 32 + 20;
  return { region: r, cell, width, height, gx, gy, columns, stats, legendTop };
}
function exportParts(pattern, codes = true) {
  const span = !codes || pattern.size <= 52 ? pattern.size : pattern.size === 120 ? 40 : pattern.size === 104 ? 52 : 39;
  const parts = [];
  for (let y = 0; y < pattern.size; y += span) for (let x = 0; x < pattern.size; x += span) parts.push({ x, y, width: Math.min(span, pattern.size - x), height: Math.min(span, pattern.size - y) });
  const safe = [];
  function split(r) {
    const l = layout(pattern, { region: r, codes });
    if (l.width <= 2048 && l.height <= 2048) { safe.push(r); return; }
    if (r.width >= r.height && r.width > 1) {
      const left = Math.floor(r.width / 2);
      split({ x: r.x, y: r.y, width: left, height: r.height });
      split({ x: r.x + left, y: r.y, width: r.width - left, height: r.height });
    } else if (r.height > 1) {
      const top = Math.floor(r.height / 2);
      split({ x: r.x, y: r.y, width: r.width, height: top });
      split({ x: r.x, y: r.y + top, width: r.width, height: r.height - top });
    } else throw new Error('无法在安全画布范围内排版');
  }
  parts.forEach(split);
  return safe;
}
function ticks(start, count, cell) {
  const result = [start + 1];
  for (let n = start + 2; n <= start + count; n++) if (n % 10 === 0) result.push(n);
  const end = start + count;
  if (result[result.length - 1] !== end) {
    if ((end - result[result.length - 1]) * cell < 32 && result.length > 1) result.pop();
    result.push(end);
  }
  // Preserve endpoints; omit a nearby tenth tick.
  return result.filter((n, i) => i === 0 || i === result.length - 1 || (n - result[0]) * cell >= 32);
}
function rounded(ctx, x, y, w, h, radius) {
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius); ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h); ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius); ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath(); ctx.fill();
}
function drawPreview(ctx, pattern, width, height, grid = true) {
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height);
  const side = Math.min(width, height), cell = side / pattern.size;
  const ox = (width - side) / 2, oy = (height - side) / 2;
  for (let y = 0; y < pattern.size; y++) for (let x = 0; x < pattern.size; x++) {
    ctx.fillStyle = pattern.palette[pattern.cells[y * pattern.size + x]].hex;
    ctx.fillRect(ox + x * cell, oy + y * cell, cell + 0.1, cell + 0.1);
  }
  if (grid && cell >= 5) {
    ctx.strokeStyle = 'rgba(81,68,56,0.17)'; ctx.lineWidth = 0.5; ctx.beginPath();
    for (let k = 0; k <= pattern.size; k++) {
      ctx.moveTo(ox + k * cell, oy); ctx.lineTo(ox + k * cell, oy + side);
      ctx.moveTo(ox, oy + k * cell); ctx.lineTo(ox + side, oy + k * cell);
    }
    ctx.stroke();
  }
}
function drawSheet(ctx, pattern, options = {}) {
  const l = layout(pattern, options), r = l.region, { cell, gx, gy, width, height } = l;
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#49382C'; ctx.font = 'bold 20px sans-serif';
  ctx.fillText('拼豆图纸 · ' + pattern.size + '×' + pattern.size, 20, 22);
  ctx.font = '12px sans-serif';
  const subtitle = (options.paletteName || '色卡') + (options.isDemo ? '（演示编号，非品牌色号）' : '') + ' · ' +
    '列 ' + (r.x + 1) + '–' + (r.x + r.width) + ' / 行 ' + (r.y + 1) + '–' + (r.y + r.height);
  ctx.fillText(subtitle, 20, 46);
  ctx.textAlign = 'center';
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
    const p = pattern.palette[pattern.cells[(r.y + y) * pattern.size + r.x + x]];
    ctx.fillStyle = p.hex; ctx.fillRect(gx + x * cell, gy + y * cell, cell, cell);
    if (options.codes !== false) {
      let font = Math.min(9, cell * 0.36); ctx.font = font + 'px sans-serif';
      while (ctx.measureText(p.code).width > cell - 3 && font > 2) { font -= 0.5; ctx.font = font + 'px sans-serif'; }
      ctx.fillStyle = ink(p.hex); ctx.fillText(p.code, gx + (x + 0.5) * cell, gy + (y + 0.5) * cell);
    }
  }
  ctx.strokeStyle = 'rgba(90,71,54,0.26)'; ctx.lineWidth = 0.5; ctx.beginPath();
  for (let x = 0; x <= r.width; x++) { ctx.moveTo(gx + x * cell, gy); ctx.lineTo(gx + x * cell, gy + r.height * cell); }
  for (let y = 0; y <= r.height; y++) { ctx.moveTo(gx, gy + y * cell); ctx.lineTo(gx + r.width * cell, gy + y * cell); }
  ctx.stroke();
  ctx.strokeStyle = '#896449'; ctx.lineWidth = 2; ctx.strokeRect(gx, gy, r.width * cell, r.height * cell);
  ctx.fillStyle = '#644A35'; ctx.font = '11px sans-serif';
  for (const n of ticks(r.x, r.width, cell)) {
    const x = gx + (n - r.x - 0.5) * cell;
    ctx.fillText(String(n), x, gy - 13); ctx.fillText(String(n), x, gy + r.height * cell + 14);
  }
  for (const n of ticks(r.y, r.height, cell)) {
    const y = gy + (n - r.y - 0.5) * cell;
    ctx.fillText(String(n), gx - 23, y); ctx.fillText(String(n), gx + r.width * cell + 23, y);
  }
  ctx.textAlign = 'left'; ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#49382C';
  ctx.fillText('颜色对照表（' + l.stats.length + ' 种' + (options.region ? ' · 本分区用量' : '') + '）', 20, l.legendTop + 12);
  const tagW = (width - 40) / l.columns - 5;
  l.stats.forEach((p, i) => {
    const x = 20 + (i % l.columns) * ((width - 40) / l.columns), y = l.legendTop + 36 + Math.floor(i / l.columns) * 32;
    ctx.fillStyle = p.hex; rounded(ctx, x, y, tagW, 27, 5);
    ctx.strokeStyle = 'rgba(80,65,50,0.18)'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.fillStyle = ink(p.hex); ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(p.code + ' (' + p.count + ')', x + tagW / 2, y + 13.5);
  });
  return l;
}
module.exports = { layout, exportParts, ticks, drawPreview, drawSheet, partStats };
