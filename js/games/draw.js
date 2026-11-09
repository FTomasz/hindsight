import { h, s, icon, button, reducedMotion } from '../ui.js';
import { frame, axes, pathFor, drawOn, spark } from '../chart.js';
import { ROUNDS } from '../data.js';
import { series } from '../words.js';
import {
  yMaxFor, anchorValue, visibleValues, hiddenValues, hiddenCount, emptyGuess, drawTo,
  isComplete, filledGuess, scoreGuess, flatScore, formatValue, idsForDay, shuffled,
  encodeLine, decodeLine, ngramUrl, maxOf,
} from '../core.js';

const byId = Object.fromEntries(ROUNDS.map((r) => [r.id, r]));
const allIds = ROUNDS.map((r) => r.id);

export default {
  id: 'draw',
  title: 'Draw the rest',
  blurb: 'See how often books used a word up to some year, then draw where the line went next',
  rounds: 5,
  unitPlural: 'charts',

  build(rng, { seed, day }) {
    const ids = seed.startsWith('d') ? idsForDay(day, allIds) : shuffled(allIds, rng).slice(0, 5);
    return ids.map((id) => byId[id]);
  },

  label: (r) => `“${r.phrase}”`,

  tile({ large }) {
    const w = large ? 360 : 96;
    const hgt = large ? 200 : 48;
    // A real curve that is not in the daily pool: "telegraph" in English books.
    return spark(series('telegraph'), 1850, { width: w, height: hgt, split: 1890 });
  },

  summaryVisual(r, rec) {
    const guess = rec && Array.isArray(rec.guess) ? rec.guess : null;
    const actual = r.values;
    return spark(actual, r.start, {
      width: 96, height: 40, split: r.cutoff,
      guess: guess ? [anchorValue(r)].concat(guess) : null, guessStart: r.cutoff,
    });
  },

  challengeExtra(items, extras) {
    return items.map((r, i) => (extras[i] ? extras[i] : null));
  },

  play(area, r, ctx) {
    return new Promise((resolve) => {
      const yMax = yMaxFor(r);
      const anchor = anchorValue(r);
      const n = hiddenCount(r);
      let guess = emptyGuess(r);
      let revealed = false;
      let prev = null;
      let drawing = false;
      let hover = null; // year under the pointer
      let kbIndex = -1;
      let kbValue = anchor;
      let rivalLine = null;
      if (ctx.rival && typeof ctx.rival.extra === 'string') {
        const l = decodeLine(ctx.rival.extra, yMax);
        if (l && l.length === n) rivalLine = l;
      }

      const title = h('h2', { class: 'chart-title' }, 'How often books say ', h('span', { class: 'phrase', text: `“${r.phrase}”` }));
      const sub = h('p', { class: 'chart-sub', text: `Uses per million words, ${r.start}–${r.end}` });
      const setup = r.setup ? h('p', { class: 'setup', text: r.setup }) : null;
      const box = h('div', { class: 'chart-box draw-box' });
      const live = h('p', { class: 'sr', 'aria-live': 'polite' });
      const hint = h('p', { class: 'hint' });
      const clearBtn = button('Clear', { iconLeft: 'undo', onclick: clear });
      const checkBtn = button('Check my line', { kind: 'primary', onclick: submit, disabled: true });
      const controls = h('div', { class: 'controls' }, hint, h('div', { class: 'control-btns' }, clearBtn, checkBtn));
      const legend = h('div', { class: 'legend', hidden: true });
      area.append(...[title, sub, setup, box, legend, controls, live].filter(Boolean));

      let f = null;
      let svg = null;
      let userPath = null;
      let tag = null;
      let hintGroup = null;

      function paint() {
        const width = Math.max(280, box.clientWidth);
        const height = Math.round(Math.min(440, Math.max(260, width * 0.6)));
        f = frame({ width, height, x0: r.start, x1: r.end, yMax });
        svg = s('svg', {
          width, height, viewBox: `0 0 ${width} ${height}`, class: 'chart',
          role: 'application', tabindex: revealed ? '-1' : '0',
          'aria-label': `Chart of “${r.phrase}” from ${r.start} to ${r.cutoff}. Draw the line from ${r.cutoff + 1} to ${r.end}. Use left and right arrows to pick a year and up and down arrows to set its value, then press Enter.`,
        });
        const zoneX = f.x(r.cutoff);
        svg.appendChild(s('rect', { x: zoneX, y: f.p.t, width: f.width - f.p.r - zoneX, height: f.ph, class: 'hidden-zone' }));
        svg.appendChild(axes(f));
        svg.appendChild(s('line', { x1: zoneX, x2: zoneX, y1: f.p.t, y2: f.p.t + f.ph, class: 'cutoff' }));
        svg.appendChild(s('path', { d: pathFor(f, visibleValues(r), r.start), class: 'line-actual' }));

        if (!revealed && !guess.some((v) => v != null)) {
          hintGroup = s('g', { class: 'draw-hint' });
          const cx = (zoneX + f.width - f.p.r) / 2;
          const cy = f.p.t + f.ph * 0.42;
          const fo = s('foreignObject', { x: cx - 80, y: cy - 22, width: 160, height: 48 });
          fo.appendChild(h('div', { class: 'draw-hint-inner' }, icon('pencil', 18), h('span', { text: 'Draw the rest' })));
          hintGroup.appendChild(fo);
          svg.appendChild(hintGroup);
        } else hintGroup = null;

        if (revealed) {
          const hiddenPath = s('path', { d: pathFor(f, [anchor].concat(hiddenValues(r)), r.cutoff), class: 'line-actual reveal' });
          svg.appendChild(hiddenPath);
          if (rivalLine) svg.appendChild(s('path', { d: pathFor(f, [anchor].concat(rivalLine), r.cutoff), class: 'line-rival' }));
          svg._reveal = hiddenPath;
        }
        userPath = s('path', { class: 'line-you' });
        svg.appendChild(userPath);
        svg.appendChild(s('circle', { cx: zoneX, cy: f.y(anchor), r: 5, class: 'anchor' }));
        tag = s('g', { class: 'tag', visibility: 'hidden' });
        svg.appendChild(tag);
        updateUser();
        box.replaceChildren(svg);
        bind();
      }

      function updateUser() {
        const vals = [anchor].concat(revealed ? filledGuess(guess, anchor) : guess);
        // Draw untouched gaps as the straight lines that scoring will use.
        const pts = [];
        vals.forEach((v, i) => { if (v != null) pts.push([r.cutoff + i, v]); });
        userPath.setAttribute('d', pts.map(([yr, v], i) => (i ? 'L' : 'M') + f.x(yr).toFixed(1) + ' ' + f.y(v).toFixed(1)).join(''));
        const complete = isComplete(guess);
        checkBtn.disabled = !complete || revealed;
        if (!revealed) {
          const touched = guess.some((v) => v != null);
          hint.textContent = !touched
            ? 'Drag across the shaded area to draw your line'
            : complete ? 'Happy with it? Check your line' : `Keep going to ${r.end}`;
        }
        if (hintGroup && guess.some((v) => v != null)) { hintGroup.remove(); hintGroup = null; }
        paintTag();
      }

      function paintTag() {
        tag.replaceChildren();
        if (hover == null) { tag.setAttribute('visibility', 'hidden'); return; }
        const yr = hover;
        const i = yr - r.cutoff - 1;
        const lines = [];
        let v = null;
        if (revealed) {
          const actual = r.values[yr - r.start];
          lines.push(`${yr} · ${formatValue(actual, yMax)}`);
          if (i >= 0) lines.push(`You ${formatValue(filledGuess(guess, anchor)[i], yMax)}`);
          if (i >= 0 && rivalLine) lines.push(`${ctx.rival.name} ${formatValue(rivalLine[i], yMax)}`);
          v = actual;
        } else {
          if (i < 0 || guess[i] == null) { tag.setAttribute('visibility', 'hidden'); return; }
          v = guess[i];
          lines.push(`${yr} · ${formatValue(v, yMax)}`);
        }
        const x = f.x(yr);
        const y = f.y(v);
        tag.appendChild(s('line', { x1: x, x2: x, y1: f.p.t, y2: f.p.t + f.ph, class: 'tag-rule' }));
        tag.appendChild(s('circle', { cx: x, cy: y, r: 3.5, class: 'tag-dot' }));
        const lh = 16;
        const w = Math.max(...lines.map((l) => l.length)) * 7.4 + 16;
        const hgt = lines.length * lh + 10;
        let tx = x + 10;
        if (tx + w > f.width - f.p.r) tx = x - 10 - w;
        let ty = Math.max(f.p.t, Math.min(y - hgt - 8, f.p.t + f.ph - hgt));
        if (ty < f.p.t) ty = f.p.t;
        tag.appendChild(s('rect', { x: tx, y: ty, width: w, height: hgt, rx: 6, class: 'tag-box' }));
        lines.forEach((l, k) => tag.appendChild(s('text', { x: tx + 8, y: ty + 17 + k * lh, class: 'tag-text' + (k === 0 ? ' strong' : '') }, l)));
        tag.setAttribute('visibility', 'visible');
      }

      function pointToSlot(ev) {
        const pt = svg.createSVGPoint();
        pt.x = ev.clientX;
        pt.y = ev.clientY;
        const m = svg.getScreenCTM();
        const p = m ? pt.matrixTransform(m.inverse()) : { x: ev.offsetX, y: ev.offsetY };
        const yr = Math.round(Math.max(r.cutoff + 1, Math.min(r.end, f.yearAt(p.x))));
        const v = Math.max(0, Math.min(yMax, f.valueAt(p.y)));
        return { i: yr - r.cutoff - 1, yr, v, inPlotX: f.yearAt(p.x) };
      }

      function bind() {
        svg.addEventListener('pointerdown', (ev) => {
          if (revealed || ev.button > 0) return;
          const pt = pointToSlot(ev);
          if (pt.inPlotX < r.cutoff - (r.end - r.start) * 0.04) return;
          ev.preventDefault();
          drawing = true;
          svg.setPointerCapture(ev.pointerId);
          prev = null;
          stroke(pt);
        });
        svg.addEventListener('pointermove', (ev) => {
          const pt = pointToSlot(ev);
          if (drawing) stroke(pt);
          else {
            const yr = Math.round(Math.max(r.start, Math.min(r.end, pt.inPlotX)));
            hover = revealed ? yr : (pt.i >= 0 && guess[pt.i] != null ? pt.yr : null);
            paintTag();
          }
        });
        const end = () => { drawing = false; prev = null; };
        svg.addEventListener('pointerup', end);
        svg.addEventListener('pointercancel', end);
        svg.addEventListener('pointerleave', () => { if (!drawing) { hover = null; paintTag(); } });
        svg.addEventListener('keydown', onKey);
        svg.addEventListener('blur', () => { if (!drawing) { hover = null; paintTag(); } });
      }

      function stroke(pt) {
        drawTo(guess, pt.i, pt.v, prev);
        prev = { i: pt.i, v: pt.v };
        hover = pt.yr;
        updateUser();
      }

      function onKey(ev) {
        if (revealed) return;
        const step = yMax / (ev.shiftKey ? 10 : 50);
        let handled = true;
        if (ev.key === 'ArrowRight') {
          if (kbIndex < n - 1) {
            const carry = kbIndex >= 0 ? guess[kbIndex] : anchor;
            kbIndex++;
            if (guess[kbIndex] == null) guess[kbIndex] = carry;
            kbValue = guess[kbIndex];
          }
        } else if (ev.key === 'ArrowLeft') {
          if (kbIndex > 0) { kbIndex--; kbValue = guess[kbIndex] ?? kbValue; }
        } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
          if (kbIndex < 0) { kbIndex = 0; kbValue = anchor; }
          kbValue = Math.max(0, Math.min(yMax, kbValue + (ev.key === 'ArrowUp' ? step : -step)));
          guess[kbIndex] = kbValue;
        } else if (ev.key === 'End') {
          // Fill the rest at the current value.
          if (kbIndex < 0) { kbIndex = 0; kbValue = anchor; guess[0] = anchor; }
          for (let k = kbIndex + 1; k < n; k++) guess[k] = kbValue;
          kbIndex = n - 1;
        } else if (ev.key === 'Enter') {
          if (isComplete(guess)) submit();
        } else handled = false;
        if (!handled) return;
        ev.preventDefault();
        if (kbIndex >= 0) {
          hover = r.cutoff + 1 + kbIndex;
          live.textContent = `${hover}: ${formatValue(guess[kbIndex], yMax)} per million`;
        }
        updateUser();
      }

      function clear() {
        if (revealed) return;
        guess = emptyGuess(r);
        kbIndex = -1;
        hover = null;
        paint();
        svg.focus({ preventScroll: true });
      }

      function submit() {
        if (revealed || !isComplete(guess)) return;
        revealed = true;
        hover = null;
        controls.remove();
        paint();
        const ms = reducedMotion() ? 0 : 1100;
        drawOn(svg._reveal, ms);
        legend.hidden = false;
        legend.replaceChildren(...[
          h('span', { class: 'key actual' }, h('i'), 'Actual'),
          h('span', { class: 'key you' }, h('i'), 'You'),
          rivalLine ? h('span', { class: 'key rival' }, h('i'), h('span', { text: ctx.rival.name })) : null,
          h('span', { class: 'key-hint', text: 'Hover the chart to compare years' }),
        ].filter(Boolean));
        const { score, mae } = scoreGuess(r, guess);
        const flat = flatScore(r);
        const filled = filledGuess(guess, anchor);
        const stored = filled.map((v) => Number(v.toPrecision(3)));
        resolve({
          score,
          verdict: verdictFor(r, filled),
          detail: `Your line was off by ${formatValue(mae, yMax)} per million words on average. Holding it flat at ${formatValue(anchor, yMax)} would have scored ${flat}.`,
          note: r.note,
          link: { href: ngramUrl(r), label: 'See it in the Ngram Viewer' },
          record: { guess: stored, line: `Off by ${formatValue(mae, yMax)} on average` },
          extra: encodeLine(filled, yMax),
        });
      }

      const ro = new ResizeObserver(() => {
        if (f && Math.abs(box.clientWidth - f.width) > 4) paint();
      });
      ro.observe(box);
      ctx.onCleanup(() => ro.disconnect());
      paint();
    });
  },
};

// A plain-language read on the shape of the guess against the real line.
function verdictFor(r, filled) {
  const actual = hiddenValues(r);
  const anchor = anchorValue(r);
  const lastA = actual[actual.length - 1];
  const lastG = filled[filled.length - 1];
  const peakA = maxOf(actual);
  const peakG = maxOf(filled);
  const big = maxOf(r.values);
  if (Math.abs(lastG - lastA) < big * 0.1 && Math.abs(peakG - peakA) < big * 0.15) return 'You read it well';
  if (peakA > Math.max(anchor, lastA) * 1.5 && peakG < peakA * 0.6) return 'You missed the spike';
  if (lastG < lastA * 0.67 - big * 0.05) return 'It ended higher than you thought';
  if (lastG > lastA * 1.5 + big * 0.05) return 'It ended lower than you thought';
  return 'Close in places';
}
