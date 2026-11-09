// The four games built on the Google Books word data.
import { h, s, icon, button } from '../ui.js';
import { frame, axes, pathFor, spark, yMaxFrom } from '../chart.js';
import { shuffled, formatValue } from '../core.js';
import { PHRASES, START, END, series, valueAt, peakYear, hasClearPeak, correlation, ngramLink, maxValue } from '../words.js';

const q = (p) => `“${p}”`;

function lineChart(box, lines, { marks = [], from = START, to = END } = {}) {
  const width = Math.max(280, box.clientWidth);
  const height = Math.round(Math.min(360, Math.max(220, width * 0.5)));
  const all = lines.flatMap((l) => l.values);
  const yMax = yMaxFrom(all);
  const f = frame({ width, height, x0: from, x1: to, yMax });
  const svg = s('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'chart', 'aria-hidden': 'true' });
  svg.appendChild(axes(f));
  for (const m of marks) {
    const x = f.x(m.year);
    svg.appendChild(s('line', { x1: x, x2: x, y1: f.p.t, y2: f.p.t + f.ph, class: 'mark-line ' + (m.cls || '') }));
    if (m.label) {
      const anchor = x > f.width - 80 ? 'end' : 'start';
      svg.appendChild(s('text', { x: x + (anchor === 'end' ? -6 : 6), y: f.p.t + 12 + (m.row || 0) * 16, class: 'mark-label ' + (m.cls || ''), 'text-anchor': anchor }, m.label));
    }
  }
  for (const l of lines) svg.appendChild(s('path', { d: pathFor(f, l.values, from), class: l.cls }));
  for (const m of marks) {
    if (m.dots) for (const d of m.dots) svg.appendChild(s('circle', { cx: f.x(m.year), cy: f.y(d.v), r: 4, class: 'dot ' + (d.cls || '') }));
  }
  box.replaceChildren(svg);
  return { f, yMax };
}

function legend(items) {
  return h('div', { class: 'legend' }, items.map(([cls, text]) => h('span', { class: 'key ' + cls }, h('i'), h('span', { text }))));
}

// ---------------- Peak year ----------------

const PEAK_POOL = PHRASES.filter(hasClearPeak);

export const peak = {
  id: 'peak',
  title: 'Peak year',
  blurb: 'Pick the year books used a word the most',
  rounds: 5,
  unitPlural: 'words',
  build: (rng) => shuffled(PEAK_POOL, rng).slice(0, 5),
  label: (p) => q(p),
  // "telegraph" isn't in the Peak year pool, so the tile spoils nothing.
  tile: () => spark(series('telegraph'), START, { width: 96, height: 48, mark: peakYear('telegraph') }),
  summaryVisual: (p, rec) => spark(series(p), START, { width: 96, height: 40, mark: rec && rec.guess }),

  play(area, phrase) {
    return new Promise((resolve) => {
      const mid = 1936;
      const yearOut = h('output', { class: 'big-year', for: 'peak-range', text: String(mid) });
      const range = h('input', { id: 'peak-range', type: 'range', min: String(START), max: String(END), step: '1', value: String(mid), class: 'range', 'aria-label': 'Your year' });
      const minus = button('', { ariaLabel: 'One year earlier', iconLeft: 'arrow-left', class: 'square', onclick: () => nudge(-1) });
      const plus = button('', { ariaLabel: 'One year later', iconLeft: 'arrow-right', class: 'square', onclick: () => nudge(1) });
      const lock = button('Lock it in', { kind: 'primary', onclick: submit });
      const box = h('div', { class: 'chart-box' });
      const picker = h('div', { class: 'year-picker' },
        h('div', { class: 'year-row' }, minus, yearOut, plus),
        range,
        h('div', { class: 'range-ends' }, h('span', { text: String(START) }), h('span', { text: String(END) })),
        h('div', { class: 'controls' }, h('p', { class: 'hint', text: 'Drag the slider or use the arrow keys' }), lock));
      area.append(
        h('h2', { class: 'chart-title' }, 'When did books use ', h('span', { class: 'phrase', text: q(phrase) }), ' the most?'),
        h('p', { class: 'chart-sub', text: `English books, ${START}–${END}` }),
        picker, box);
      range.addEventListener('input', () => { yearOut.textContent = range.value; });
      function nudge(d) {
        range.value = String(Math.max(START, Math.min(END, Number(range.value) + d)));
        yearOut.textContent = range.value;
      }
      function submit() {
        const guess = Number(range.value);
        const actual = peakYear(phrase);
        const diff = Math.abs(guess - actual);
        const score = Math.max(0, 100 - 3 * diff);
        picker.remove();
        const peakV = valueAt(phrase, actual);
        const yourV = valueAt(phrase, guess);
        const { yMax } = lineChart(box, [{ values: series(phrase), cls: 'line-actual' }], {
          marks: [
            { year: actual, label: `Peak ${actual}`, cls: 'actual', dots: [{ v: peakV, cls: 'actual' }] },
            { year: guess, label: `You ${guess}`, cls: 'you', row: 1, dots: [{ v: yourV, cls: 'you' }] },
          ],
        });
        area.appendChild(legend([['actual', q(phrase)], ['you', 'Your year']]));
        resolve({
          score,
          verdict: diff === 0 ? 'Exactly right' : `${diff} year${diff === 1 ? '' : 's'} ${guess < actual ? 'too early' : 'too late'}`,
          detail: `It peaked in ${actual} at ${formatValue(peakV, yMax)} uses per million words. In ${guess} it was at ${formatValue(yourV, yMax)}.`,
          link: { href: ngramLink(phrase), label: 'See it in the Ngram Viewer' },
          record: { guess, line: `You ${guess}, peak ${actual}` },
        });
      }
    });
  },
};

// ---------------- Book battle ----------------

function pickPairs(rng, count) {
  const out = [];
  const used = new Set();
  let tries = 0;
  while (out.length < count && tries++ < 5000) {
    const year = 1900 + Math.floor(rng() * 121); // 1900..2020
    const a = PHRASES[Math.floor(rng() * PHRASES.length)];
    const b = PHRASES[Math.floor(rng() * PHRASES.length)];
    if (a === b || used.has(a) || used.has(b)) continue;
    const va = valueAt(a, year);
    const vb = valueAt(b, year);
    if (Math.min(va, vb) < 0.1) continue;
    const ratio = Math.max(va, vb) / Math.min(va, vb);
    if (ratio < 1.4 || ratio > 25) continue;
    used.add(a); used.add(b);
    out.push(rng() < 0.5 ? { a, b, year } : { a: b, b: a, year });
  }
  return out;
}

export const battle = {
  id: 'battle',
  title: 'Book battle',
  blurb: 'Two words, one year. Which one did books use more?',
  rounds: 10,
  binary: true,
  unitPlural: 'matchups',
  build: (rng) => pickPairs(rng, 10),
  label: (it) => `${q(it.a)} vs ${q(it.b)}, ${it.year}`,
  tile: () => {
    const svg = s('svg', { width: 96, height: 48, viewBox: '0 0 96 48', 'aria-hidden': 'true', class: 'glyph' });
    svg.appendChild(s('rect', { x: 8, y: 12, width: 56, height: 8, rx: 2, class: 'g-ink' }));
    svg.appendChild(s('rect', { x: 8, y: 28, width: 32, height: 8, rx: 2, class: 'g-accent' }));
    return svg;
  },
  play(area, it) {
    return new Promise((resolve) => {
      const box = h('div', { class: 'chart-box' });
      const choose = (pick) => {
        const va = valueAt(it.a, it.year);
        const vb = valueAt(it.b, it.year);
        const winner = va > vb ? it.a : it.b;
        const right = pick === winner;
        for (const b of btns.children) {
          b.disabled = true;
          const p = b.dataset.phrase;
          b.classList.add(p === winner ? 'is-winner' : 'is-loser');
          if (p === pick) b.classList.add('is-picked');
          b.appendChild(h('span', { class: 'choice-value', text: `${formatValue(p === it.a ? va : vb, Math.max(va, vb) * 1.2)} per million` }));
        }
        lineChart(box, [{ values: series(it.a), cls: 'line-actual' }, { values: series(it.b), cls: 'line-second' }], {
          marks: [{ year: it.year, label: String(it.year), cls: 'neutral' }],
        });
        area.appendChild(legend([['actual', q(it.a)], ['second', q(it.b)]]));
        const ratio = Math.max(va, vb) / Math.min(va, vb);
        resolve({
          score: right ? 100 : 0,
          verdict: `${q(winner)} was used ${ratio.toFixed(1)}× as often`,
          link: { href: ngramLink(it.a + ',' + it.b), label: 'See both in the Ngram Viewer' },
          record: { line: right ? `You picked ${q(pick)}` : `You picked ${q(pick)}, it was ${q(winner)}` },
        });
      };
      const btns = h('div', { class: 'choices two' },
        [it.a, it.b].map((p) => h('button', { type: 'button', class: 'choice', 'data-phrase': p, onclick: () => choose(p) }, h('span', { class: 'choice-text', text: q(p) }))));
      area.append(
        h('h2', { class: 'chart-title', text: `Which did English books use more in ${it.year}?` }),
        btns, box);
    });
  },
};

// ---------------- Then or now ----------------

function pickTrends(rng, count) {
  const out = [];
  const used = new Set();
  let tries = 0;
  while (out.length < count && tries++ < 5000) {
    const p = PHRASES[Math.floor(rng() * PHRASES.length)];
    if (used.has(p)) continue;
    const y1 = 1860 + Math.floor(rng() * 140);
    const gap = 20 + Math.floor(rng() * 60);
    const y2 = y1 + gap;
    if (y2 > 2020) continue;
    const v1 = valueAt(p, y1);
    const v2 = valueAt(p, y2);
    if (Math.max(v1, v2) < 0.15) continue;
    const ratio = Math.max(v1, v2) / Math.max(Math.min(v1, v2), 1e-6);
    if (ratio < 1.5) continue;
    // Alternate which year wins, so "always pick the later year" doesn't work.
    const laterWins = v2 > v1;
    if (laterWins !== (out.length % 2 === 0)) continue;
    used.add(p);
    out.push({ phrase: p, y1, y2 });
  }
  return out;
}

export const trend = {
  id: 'trend',
  title: 'Then or now',
  blurb: 'One word, two years. When did books use it more?',
  rounds: 10,
  binary: true,
  unitPlural: 'words',
  build: (rng) => shuffled(pickTrends(rng, 10), rng),
  label: (it) => `${q(it.phrase)}, ${it.y1} or ${it.y2}`,
  tile: () => {
    const svg = s('svg', { width: 96, height: 48, viewBox: '0 0 96 48', 'aria-hidden': 'true', class: 'glyph' });
    svg.appendChild(s('rect', { x: 20, y: 14, width: 14, height: 26, rx: 2, class: 'g-ink' }));
    svg.appendChild(s('rect', { x: 60, y: 28, width: 14, height: 12, rx: 2, class: 'g-accent' }));
    svg.appendChild(s('line', { x1: 8, x2: 88, y1: 40.5, y2: 40.5, class: 'g-rule' }));
    return svg;
  },
  play(area, it) {
    return new Promise((resolve) => {
      const box = h('div', { class: 'chart-box' });
      const choose = (pick) => {
        const v1 = valueAt(it.phrase, it.y1);
        const v2 = valueAt(it.phrase, it.y2);
        const winner = v1 > v2 ? it.y1 : it.y2;
        const right = pick === winner;
        const yMax = Math.max(v1, v2) * 1.2;
        for (const b of btns.children) {
          b.disabled = true;
          const y = Number(b.dataset.year);
          b.classList.add(y === winner ? 'is-winner' : 'is-loser');
          if (y === pick) b.classList.add('is-picked');
          b.appendChild(h('span', { class: 'choice-value', text: `${formatValue(y === it.y1 ? v1 : v2, yMax)} per million` }));
        }
        lineChart(box, [{ values: series(it.phrase), cls: 'line-actual' }], {
          marks: [
            { year: it.y1, label: String(it.y1), cls: it.y1 === winner ? 'actual' : 'neutral', dots: [{ v: v1, cls: 'actual' }] },
            { year: it.y2, label: String(it.y2), cls: it.y2 === winner ? 'actual' : 'neutral', row: 1, dots: [{ v: v2, cls: 'actual' }] },
          ],
        });
        const ratio = Math.max(v1, v2) / Math.max(Math.min(v1, v2), 1e-6);
        resolve({
          score: right ? 100 : 0,
          verdict: ratio > 50 ? `Far more in ${winner}` : `${ratio.toFixed(1)}× as common in ${winner}`,
          link: { href: ngramLink(it.phrase), label: 'See it in the Ngram Viewer' },
          record: { line: right ? `You picked ${pick}` : `You picked ${pick}, it was ${winner}` },
        });
      };
      const btns = h('div', { class: 'choices two' },
        [it.y1, it.y2].map((y) => h('button', { type: 'button', class: 'choice', 'data-year': String(y), onclick: () => choose(y) }, h('span', { class: 'choice-text year', text: String(y) }))));
      area.append(
        h('h2', { class: 'chart-title' }, 'When did books use ', h('span', { class: 'phrase', text: q(it.phrase) }), ' more?'),
        btns, box);
    });
  },
};

// ---------------- Match the curves ----------------

const MATCH_FROM = 1900;

function pickBoard(rng, avoid) {
  for (let tries = 0; tries < 400; tries++) {
    const picks = [];
    for (const p of shuffled(PHRASES, rng)) {
      if (avoid.has(p) || maxValue(p) < 0.3) continue;
      if (picks.every((o) => correlation(o, p, MATCH_FROM) < 0.4)) picks.push(p);
      if (picks.length === 4) return picks;
    }
  }
  throw new Error('no board');
}

export const match = {
  id: 'match',
  title: 'Match the curves',
  blurb: 'Four words, four unlabeled curves. Put each word on its line',
  rounds: 3,
  unitPlural: 'boards',
  build(rng) {
    const avoid = new Set();
    const boards = [];
    for (let i = 0; i < 3; i++) {
      const b = pickBoard(rng, avoid);
      b.forEach((p) => avoid.add(p));
      boards.push({ curves: b, options: shuffled(b, rng) });
    }
    return boards;
  },
  label: (b) => b.curves.map(q).join(', '),
  tile: () => {
    const wrap = h('div', { class: 'mini-grid' });
    for (const p of ['radio', 'vegan', 'Y2K', 'telegraph']) {
      wrap.appendChild(spark(series(p).slice(1900 - START), 1900, { width: 44, height: 20 }));
    }
    return wrap;
  },
  play(area, board) {
    return new Promise((resolve) => {
      const letters = ['A', 'B', 'C', 'D'];
      const picks = [null, null, null, null];
      const check = button('Check', { kind: 'primary', disabled: true, onclick: submit });
      const selects = [];
      const cards = board.curves.map((p, i) => {
        const sel = h('select', { class: 'select', id: `curve-${i}`, onchange: () => onPick(i, sel.value) },
          h('option', { value: '', text: 'Pick a word' }),
          board.options.map((o) => h('option', { value: o, text: q(o) })));
        selects.push(sel);
        const vis = h('div', { class: 'curve-vis' });
        return h('div', { class: 'curve-card' },
          h('div', { class: 'curve-head' }, h('span', { class: 'curve-letter', text: letters[i] }), h('label', { for: `curve-${i}`, class: 'sr', text: `Word for curve ${letters[i]}` }), sel),
          vis);
      });
      const grid = h('div', { class: 'curve-grid' }, cards);
      area.append(
        h('h2', { class: 'chart-title', text: 'Which word made which curve?' }),
        h('p', { class: 'chart-sub', text: `English books, ${MATCH_FROM}–${END}. Each curve has its own scale` }),
        h('p', { class: 'options-line' }, board.options.map((o, k) => [k ? ' · ' : '', h('span', { class: 'phrase', text: q(o) })])),
        grid,
        h('div', { class: 'controls' }, h('p', { class: 'hint', text: 'Picking a word that is already used swaps the two' }), check));

      const paintCurves = () => cards.forEach((c, i) => {
        const vis = c.querySelector('.curve-vis');
        const w = Math.max(120, vis.clientWidth);
        const vals = series(board.curves[i]).slice(MATCH_FROM - START);
        const svgEl = spark(vals, MATCH_FROM, { width: w, height: Math.round(Math.min(140, w * 0.45)) });
        vis.replaceChildren(svgEl, h('div', { class: 'curve-axis' }, h('span', { text: String(MATCH_FROM) }), h('span', { text: String(END) })));
      });
      requestAnimationFrame(paintCurves);

      function onPick(i, val) {
        if (val) {
          const j = picks.indexOf(val);
          if (j >= 0 && j !== i) { picks[j] = picks[i]; selects[j].value = picks[j] || ''; }
        }
        picks[i] = val || null;
        check.disabled = picks.some((p) => !p);
      }
      function submit() {
        let right = 0;
        cards.forEach((c, i) => {
          const ok = picks[i] === board.curves[i];
          if (ok) right++;
          selects[i].disabled = true;
          c.classList.add(ok ? 'is-right' : 'is-wrong');
          c.appendChild(h('p', { class: 'curve-answer' }, icon(ok ? 'check' : 'x', 16), h('span', { text: ok ? q(board.curves[i]) : `It was ${q(board.curves[i])}` })));
        });
        check.parentElement.remove();
        resolve({
          score: right * 25,
          verdict: `${right} of 4 matched`,
          link: { href: ngramLink(board.curves.join(','), MATCH_FROM), label: 'See all four in the Ngram Viewer' },
          record: { line: `${right} of 4 matched` },
        });
      }
    });
  },
};
