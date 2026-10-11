'use strict';
const { createCanvas } = require('@napi-rs/canvas');

// Deliberately synthetic illustration, NOT the user's fixed dog artwork.
function dogFixture() {
  const canvas = createCanvas(840, 720), c = canvas.getContext('2d');
  let seed = 12345;
  function random() { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }
  function ellipse(x, y, rx, ry, fill, stroke = null, line = 2) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = line; c.stroke(); }
  }
  // Body, ears and face use half-transparent edges against a transparent source.
  ellipse(430, 564, 161, 143, '#E8D4BC', '#BFA890', 4);
  ellipse(253, 300, 82, 178, '#D3B99C', '#B09577', 4);
  ellipse(615, 300, 82, 178, '#D3B99C', '#B09577', 4);
  ellipse(432, 324, 192, 220, '#F3EBE0', '#CBBBAB', 3);
  ellipse(359, 252, 106, 97, '#E6D1B7'); ellipse(516, 252, 106, 97, '#E6D1B7');
  for (let i = 0; i < 750; i++) {
    const x = 258 + random() * 347, y = 118 + random() * 421;
    const nx = (x - 432) / 174, ny = (y - 324) / 207;
    if (nx * nx + ny * ny > 0.94) continue;
    c.strokeStyle = i % 3 === 0 ? 'rgba(173,148,124,0.32)' : 'rgba(255,255,255,0.73)'; c.lineWidth = 1 + random() * 3;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + random() * 6, y + 5, x + (random() - 0.5) * 14, y + 8 + random() * 14); c.stroke();
  }
  for (const x of [358, 507]) {
    ellipse(x, 302, 44, 50, '#C4B19E'); ellipse(x, 302, 33, 37, '#DCE5EB', '#635C58', 4);
    ellipse(x + 1, 307, 22, 27, '#6C849A'); ellipse(x + 2, 308, 12, 20, '#29313A');
    ellipse(x - 9, 289, 7, 9, '#FFFFFF'); ellipse(x + 8, 313, 3, 4, '#DCE5EB');
  }
  ellipse(386, 396, 78, 63, '#FAF8F4'); ellipse(480, 396, 78, 63, '#FAF8F4');
  c.beginPath(); c.moveTo(390, 358); c.bezierCurveTo(402, 343, 462, 343, 475, 358);
  c.bezierCurveTo(485, 378, 455, 401, 433, 400); c.bezierCurveTo(411, 401, 380, 379, 390, 358);
  c.fillStyle = '#A58F8D'; c.fill(); c.strokeStyle = '#745E60'; c.lineWidth = 3; c.stroke();
  ellipse(419, 358, 16, 5, '#D8C5BF');
  c.strokeStyle = '#8D7575'; c.lineWidth = 4; c.beginPath(); c.moveTo(433, 399); c.lineTo(433, 422);
  c.quadraticCurveTo(410, 445, 389, 421); c.moveTo(433, 422); c.quadraticCurveTo(457, 446, 478, 421); c.stroke();
  for (const x of [389, 477]) for (let i = 0; i < 3; i++) ellipse(x + (i - 1) * 12, 403 + (i % 2) * 8, 2, 2, '#A08866');
  c.font = 'bold 115px sans-serif'; c.fillStyle = '#6C849A'; c.fillText('?', 694, 155);
  c.font = 'bold 74px sans-serif'; c.fillStyle = '#887255'; c.fillText('?', 55, 337);
  c.font = 'bold 27px sans-serif'; c.fillText('Woof!', 15, 390);
  ellipse(742, 611, 28, 25, '#A58F8D');
  for (const [x, y] of [[706, 574], [730, 563], [755, 563], [777, 578]]) ellipse(x, y, 10, 14, '#A58F8D');
  // Alpha edge probe detached from the subject.
  ellipse(80, 620, 20, 20, 'rgba(108,132,154,0.4)');
  return canvas;
}
module.exports = { dogFixture };
