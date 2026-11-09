import { s } from './ui.js';
import { niceCeil, maxOf } from './core.js';

// One coordinate system in CSS pixels, so text never scales with the chart.
export function frame({ width, height, x0, x1, yMax, pad }) {
  const p = Object.assign({ l: 44, r: 16, t: 12, b: 28 }, pad);
  const pw = Math.max(10, width - p.l - p.r);
  const ph = Math.max(10, height - p.t - p.b);
  const x = (year) => p.l + ((year - x0) / (x1 - x0)) * pw;
  const y = (v) => p.t + ph - (Math.max(0, Math.min(v, yMax)) / yMax) * ph;
  const yearAt = (px) => x0 + ((px - p.l) / pw) * (x1 - x0);
  const valueAt = (py) => ((p.t + ph - py) / ph) * yMax;
  return { width, height, p, pw, ph, x, y, yearAt, valueAt, x0, x1, yMax };
}

export function yearStep(span, width) {
  const room = Math.max(2, Math.floor(width / 64));
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100]) if (span / step <= room) return step;
  return 100;
}

// Tick count that lands on round numbers for each "nice" axis maximum.
export function tickCount(yMax) {
  const m = yMax / Math.pow(10, Math.floor(Math.log10(yMax)));
  const r = Math.round(m * 10) / 10;
  return { 1: 5, 1.5: 3, 2: 4, 2.5: 5, 3: 3, 4: 4, 5: 5, 6: 3, 8: 4, 10: 5 }[r] || 4;
}

export function tickLabel(v) {
  return v === 0 ? '0' : String(Number(v.toPrecision(6)));
}

export function axes(f, { showY = true } = {}) {
  const g = s('g', { class: 'axes' });
  const n = tickCount(f.yMax);
  for (let i = 0; i <= n; i++) {
    const v = (f.yMax * i) / n;
    const yy = f.y(v);
    g.appendChild(s('line', { x1: f.p.l, x2: f.width - f.p.r, y1: yy, y2: yy, class: i === 0 ? 'baseline' : 'grid' }));
    if (showY) g.appendChild(s('text', { x: f.p.l - 8, y: yy + 4, class: 'tick', 'text-anchor': 'end' }, tickLabel(v)));
  }
  const step = yearStep(f.x1 - f.x0, f.pw);
  const first = Math.ceil(f.x0 / step) * step;
  for (let yr = first; yr <= f.x1; yr += step) {
    const xx = f.x(yr);
    const anchor = xx - f.p.l < 16 ? 'start' : f.width - f.p.r - xx < 16 ? 'end' : 'middle';
    g.appendChild(s('text', { x: xx, y: f.height - 8, class: 'tick', 'text-anchor': anchor }, String(yr)));
  }
  return g;
}

// values[i] belongs to year start + i. Null values break the line.
export function pathFor(f, values, start) {
  let d = '';
  let pen = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { pen = false; continue; }
    d += (pen ? 'L' : 'M') + f.x(start + i).toFixed(1) + ' ' + f.y(v).toFixed(1);
    pen = true;
  }
  return d;
}

export function yMaxFrom(values, headroom = 1.15) {
  return niceCeil(maxOf(values.filter((v) => v != null)) * headroom);
}

// Draws a stroke on with stroke-dashoffset. Resolves when done.
export function drawOn(path, ms) {
  return new Promise((resolve) => {
    let len = 0;
    try { len = path.getTotalLength(); } catch { len = 0; }
    if (!len || ms <= 0) return resolve();
    path.style.strokeDasharray = len + ' ' + len;
    path.style.strokeDashoffset = String(len);
    path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset ${ms}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    path.style.strokeDashoffset = '0';
    const done = () => {
      path.style.strokeDasharray = '';
      path.style.strokeDashoffset = '';
      path.style.transition = '';
      resolve();
    };
    setTimeout(done, ms + 30);
  });
}

// A small static chart for summaries and tiles.
export function spark(values, start, { width = 120, height = 40, split = null, guess = null, guessStart = null, mark = null } = {}) {
  const yMax = yMaxFrom(values.concat(guess || []).concat([1e-9]), 1.08);
  const f = frame({ width, height, x0: start, x1: start + values.length - 1, yMax, pad: { l: 2, r: 2, t: 3, b: 3 } });
  const svg = s('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'spark', 'aria-hidden': 'true' });
  if (split != null) {
    svg.appendChild(s('rect', { x: f.x(split), y: 0, width: f.width - f.p.r - f.x(split), height, class: 'hidden-zone' }));
  }
  if (mark != null) svg.appendChild(s('line', { x1: f.x(mark), x2: f.x(mark), y1: 0, y2: height, class: 'mark-line' }));
  svg.appendChild(s('path', { d: pathFor(f, values, start), class: 'line-actual thin' }));
  if (guess) svg.appendChild(s('path', { d: pathFor(f, guess, guessStart), class: 'line-you thin' }));
  return svg;
}
