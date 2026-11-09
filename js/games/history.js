import { h, s, icon, button } from '../ui.js';
import { shuffled } from '../core.js';
import { EVENTS } from '../content/events.js';

const SORTED = EVENTS.slice().sort((a, b) => a.year - b.year);
const SET_SIZE = 5;

// Five events with different years from a window of neighbours in time, so
// a set is hard enough to think about instead of Rome vs. the iPhone.
export function pickTimelineSet(rng, avoid) {
  for (let tries = 0; tries < 500; tries++) {
    const start = Math.floor(rng() * (SORTED.length - 12));
    const window = SORTED.slice(start, start + 12).filter((e) => !avoid.has(e.id));
    const picks = [];
    for (const e of shuffled(window, rng)) {
      if (picks.some((p) => p.year === e.year)) continue;
      picks.push(e);
      if (picks.length === SET_SIZE) return picks;
    }
  }
  throw new Error('no timeline set');
}

// Share of the 10 pairs the player put in the right order.
export function orderScore(order) {
  let right = 0;
  let pairs = 0;
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      pairs++;
      if (order[i].year < order[j].year) right++;
    }
  }
  return { score: Math.round((100 * right) / pairs), right, pairs };
}

export const timeline = {
  id: 'timeline',
  title: 'Timeline',
  blurb: 'Put five moments from history in order',
  rounds: 3,
  unitPlural: 'timelines',
  section: 'history',
  build(rng) {
    const avoid = new Set();
    const sets = [];
    for (let i = 0; i < 3; i++) {
      const set = pickTimelineSet(rng, avoid);
      set.forEach((e) => avoid.add(e.id));
      sets.push(shuffled(set, rng));
    }
    return sets;
  },
  label: (set) => {
    const years = set.map((e) => e.year);
    return `${set.length} events from ${Math.min(...years)} to ${Math.max(...years)}`;
  },

  play(area, set) {
    return new Promise((resolve) => {
      let order = set.slice();
      const list = h('ol', { class: 'order-list' });
      const live = h('p', { class: 'sr', 'aria-live': 'polite' });
      const lock = button('Lock in this order', { kind: 'primary', onclick: submit });
      area.append(
        h('h2', { class: 'chart-title', text: 'Put these in order, earliest first' }),
        h('p', { class: 'chart-sub', text: 'Drag the handles, or use the arrows' }),
        list, live,
        h('div', { class: 'controls' }, h('p', { class: 'hint', text: 'Partly right still scores: every pair in the right order counts' }), lock));

      function paint(focusId, focusDir) {
        list.replaceChildren(...order.map((e, i) => {
          const up = h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Move “${e.text}” earlier`, disabled: i === 0, onclick: () => move(i, -1) }, icon('chevron-up', 16));
          const down = h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Move “${e.text}” later`, disabled: i === order.length - 1, onclick: () => move(i, 1) }, icon('chevron-down', 16));
          const grip = h('span', { class: 'grip', 'aria-hidden': 'true' }, icon('grip', 16));
          const li = h('li', { class: 'order-item', 'data-id': e.id },
            grip,
            h('span', { class: 'order-pos', text: String(i + 1) }),
            h('span', { class: 'order-text', text: e.text }),
            h('span', { class: 'order-btns' }, up, down));
          grip.addEventListener('pointerdown', (ev) => startDrag(ev, li));
          return li;
        }));
        if (focusId) {
          const li = list.querySelector(`[data-id="${focusId}"]`);
          const btn = li && li.querySelector(focusDir < 0 ? 'button:first-child' : 'button:last-child');
          const target = btn && !btn.disabled ? btn : li && li.querySelector('button:not([disabled])');
          if (target) target.focus();
        }
      }

      function move(i, d) {
        const j = i + d;
        if (j < 0 || j >= order.length) return;
        const e = order[i];
        order.splice(i, 1);
        order.splice(j, 0, e);
        live.textContent = `“${e.text}” moved to position ${j + 1}`;
        paint(e.id, d);
      }

      function startDrag(ev, li) {
        ev.preventDefault();
        const items = [...list.children];
        const from = items.indexOf(li);
        const rects = items.map((el) => el.getBoundingClientRect());
        const y0 = ev.clientY;
        let to = from;
        li.classList.add('dragging');
        li.setPointerCapture(ev.pointerId);
        const onMove = (e) => {
          const dy = e.clientY - y0;
          li.style.transform = `translateY(${dy}px)`;
          const center = rects[from].top + rects[from].height / 2 + dy;
          to = rects.findIndex((r) => center < r.top + r.height / 2);
          if (to === -1) to = items.length - 1;
          const shift = rects[from].height + 8;
          items.forEach((el, k) => {
            if (k === from) return;
            let t = 0;
            if (from < to && k > from && k <= to) t = -shift;
            if (from > to && k < from && k >= to) t = shift;
            el.style.transform = t ? `translateY(${t}px)` : '';
          });
        };
        const onUp = () => {
          li.removeEventListener('pointermove', onMove);
          li.removeEventListener('pointerup', onUp);
          li.removeEventListener('pointercancel', onUp);
          const e = order[from];
          order.splice(from, 1);
          order.splice(to, 0, e);
          paint();
        };
        li.addEventListener('pointermove', onMove);
        li.addEventListener('pointerup', onUp);
        li.addEventListener('pointercancel', onUp);
      }

      function submit() {
        const { score, right, pairs } = orderScore(order);
        const correct = order.slice().sort((a, b) => a.year - b.year);
        lock.parentElement.remove();
        area.querySelector('.chart-sub').textContent = 'The real order';
        list.classList.add('revealed');
        list.replaceChildren(...correct.map((e, i) => {
          const yourPos = order.indexOf(e);
          const ok = yourPos === i;
          return h('li', { class: 'order-item ' + (ok ? 'is-right' : 'is-wrong') },
            h('span', { class: 'order-year', text: String(e.year) }),
            h('span', { class: 'order-text', text: e.text }),
            h('span', { class: 'order-was', text: ok ? 'Right spot' : `You had it ${yourPos + 1}` }));
        }));
        resolve({
          score,
          verdict: right === pairs ? 'Perfect order' : `${right} of ${pairs} pairs in order`,
          record: { line: `${right} of ${pairs} pairs in order` },
        });
      }
      paint();
    });
  },
};

// ---------------- Which came first ----------------

export function pickFirstPairs(rng, count) {
  const out = [];
  const used = new Set();
  let tries = 0;
  while (out.length < count && tries++ < 50000) {
    // Endless mode runs past the event list, so start reusing events when stuck.
    if (tries % 2000 === 0) used.clear();
    const i = Math.floor(rng() * SORTED.length);
    const j = i + 1 + Math.floor(rng() * 6);
    if (j >= SORTED.length) continue;
    const a = SORTED[i];
    const b = SORTED[j];
    if (a.year === b.year || used.has(a.id) || used.has(b.id)) continue;
    used.add(a.id); used.add(b.id);
    out.push(rng() < 0.5 ? [a, b] : [b, a]);
  }
  return out;
}

export const first = {
  id: 'first',
  title: 'Which came first',
  blurb: 'Two moments from history. Pick the earlier one',
  rounds: 10,
  binary: true,
  unitPlural: 'pairs',
  section: 'history',
  build: (rng, { count = 10 } = {}) => pickFirstPairs(rng, count),
  label: ([a, b]) => `${a.text} or ${b.text}`,
  play(area, pair) {
    return new Promise((resolve) => {
      const choose = (pick) => {
        const earlier = pair[0].year < pair[1].year ? pair[0] : pair[1];
        const right = pick === earlier;
        for (const b of btns.children) {
          b.disabled = true;
          const e = pair[Number(b.dataset.i)];
          b.classList.add(e === earlier ? 'is-winner' : 'is-loser');
          if (e === pick) b.classList.add('is-picked');
          b.appendChild(h('span', { class: 'choice-value year', text: String(e.year) }));
        }
        const gap = Math.abs(pair[0].year - pair[1].year);
        resolve({
          score: right ? 100 : 0,
          verdict: `${gap} year${gap === 1 ? '' : 's'} apart`,
          record: { line: right ? 'Right' : `It was: ${earlier.text}` },
        });
      };
      const btns = h('div', { class: 'choices two events' },
        pair.map((e, i) => h('button', { type: 'button', class: 'choice', 'data-i': String(i), onclick: () => choose(e) }, h('span', { class: 'choice-text', text: e.text }))));
      area.append(h('h2', { class: 'chart-title', text: 'Which happened first?' }), btns);
    });
  },
};

// ---------------- When? ----------------

export function yearScore(guess, actual) {
  const diff = Math.abs(guess - actual);
  return { score: Math.max(0, Math.round(100 - 2 * diff)), diff };
}

const YEAR_MIN = 400;
const YEAR_MAX = 2025;

export const when = {
  id: 'when',
  title: 'When?',
  blurb: 'One moment from history. Name the year',
  rounds: 5,
  unitPlural: 'moments',
  section: 'history',
  build: (rng) => shuffled(EVENTS, rng).slice(0, 5),
  label: (e) => e.text,
  summaryVisual: null,

  play(area, ev) {
    return new Promise((resolve) => {
      const start = 1900;
      const yearIn = h('input', {
        id: 'when-year', class: 'year-input', type: 'text', inputmode: 'numeric', autocomplete: 'off',
        value: String(start), 'aria-label': 'Your year', maxlength: '4',
      });
      const range = h('input', { type: 'range', min: String(YEAR_MIN), max: String(YEAR_MAX), step: '1', value: String(start), class: 'range', 'aria-label': 'Your year, slider' });
      const minus = button('', { ariaLabel: 'One year earlier', iconLeft: 'arrow-left', class: 'square', onclick: () => set(value() - 1) });
      const plus = button('', { ariaLabel: 'One year later', iconLeft: 'arrow-right', class: 'square', onclick: () => set(value() + 1) });
      const lock = button('Lock it in', { kind: 'primary', onclick: submit });
      const picker = h('div', { class: 'year-picker' },
        h('div', { class: 'year-row' }, minus, yearIn, plus),
        range,
        h('div', { class: 'range-ends' }, h('span', { text: String(YEAR_MIN) }), h('span', { text: String(YEAR_MAX) })),
        h('div', { class: 'controls' }, h('p', { class: 'hint', text: 'Type a year, drag, or use the arrows' }), lock));
      area.append(
        h('p', { class: 'chart-sub first', text: 'In what year?' }),
        h('h2', { class: 'question', text: ev.text }),
        picker);

      const value = () => {
        const v = parseInt(yearIn.value, 10);
        return Number.isFinite(v) ? v : Number(range.value);
      };
      function set(v) {
        v = Math.max(YEAR_MIN, Math.min(YEAR_MAX, v));
        yearIn.value = String(v);
        range.value = String(v);
        lock.disabled = false;
      }
      range.addEventListener('input', () => { yearIn.value = range.value; lock.disabled = false; });
      yearIn.addEventListener('input', () => {
        yearIn.value = yearIn.value.replace(/\D/g, '').slice(0, 4);
        const v = parseInt(yearIn.value, 10);
        const ok = Number.isFinite(v) && v >= YEAR_MIN && v <= YEAR_MAX;
        lock.disabled = !ok;
        if (ok) range.value = String(v);
      });
      yearIn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') { e.preventDefault(); set(value() + (e.shiftKey ? 10 : 1)); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); set(value() - (e.shiftKey ? 10 : 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (!lock.disabled) submit(); }
      });

      function submit() {
        const guess = value();
        if (!(guess >= YEAR_MIN && guess <= YEAR_MAX)) return;
        const { score, diff } = yearScore(guess, ev.year);
        picker.remove();
        area.appendChild(yearStrip(guess, ev.year));
        resolve({
          score,
          verdict: diff === 0 ? 'Exactly right' : `${diff} year${diff === 1 ? '' : 's'} ${guess < ev.year ? 'too early' : 'too late'}`,
          detail: `It happened in ${ev.year}. You said ${guess}.`,
          record: { line: `You ${guess}, it was ${ev.year}` },
        });
      }
    });
  },
};

// Your year and the real one on a short stretch of time, with other events
// from the same stretch for context.
function yearStrip(guess, actual) {
  const lo0 = Math.min(guess, actual);
  const hi0 = Math.max(guess, actual);
  const pad = Math.max(5, Math.round((hi0 - lo0) * 0.25));
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const W = 640;
  const x = (y) => 16 + ((y - lo) / (hi - lo)) * (W - 32);
  const svg = s('svg', { viewBox: `0 0 ${W} 96`, width: '100%', class: 'year-strip', role: 'img', 'aria-label': `Your year ${guess}, the real year ${actual}` });
  svg.appendChild(s('line', { x1: 16, x2: W - 16, y1: 48.5, y2: 48.5, class: 'baseline' }));
  const context = SORTED.filter((e) => e.year > lo && e.year < hi && e.year !== actual && e.year !== guess).slice(0, 4);
  for (const e of context) {
    svg.appendChild(s('line', { x1: x(e.year), x2: x(e.year), y1: 42, y2: 55, class: 'grid' }));
  }
  svg.appendChild(s('line', { x1: x(Math.min(guess, actual)), x2: x(Math.max(guess, actual)), y1: 48.5, y2: 48.5, class: 'gap' }));
  const label = (yr, cls, above) => {
    const xx = x(yr);
    const anchor = xx < 60 ? 'start' : xx > W - 60 ? 'end' : 'middle';
    svg.appendChild(s('circle', { cx: xx, cy: 48.5, r: 6, class: 'dot ' + cls }));
    svg.appendChild(s('text', { x: xx, y: above ? 28 : 80, class: 'mark-label ' + cls, 'text-anchor': anchor }, (cls === 'you' ? 'You ' : '') + yr));
  };
  label(actual, 'actual', true);
  if (guess !== actual) label(guess, 'you', false);
  return h('div', { class: 'strip-box' }, svg,
    context.length ? h('p', { class: 'strip-note', text: 'Also in this stretch: ' + context.map((e) => `${e.text} (${e.year})`).join(' · ') }) : null);
}
