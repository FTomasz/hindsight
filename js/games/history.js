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
  label: (set) => set.map((e) => e.text).slice(0, 2).join(' · ') + ' …',
  tile: () => {
    const svg = s('svg', { width: 96, height: 48, viewBox: '0 0 96 48', 'aria-hidden': 'true', class: 'glyph' });
    svg.appendChild(s('line', { x1: 8, x2: 88, y1: 24.5, y2: 24.5, class: 'g-rule' }));
    [12, 30, 44, 70, 84].forEach((x, i) => svg.appendChild(s('circle', { cx: x, cy: 24.5, r: 4, class: i === 2 ? 'g-accent' : 'g-ink' })));
    return svg;
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
  while (out.length < count && tries++ < 5000) {
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
  build: (rng) => pickFirstPairs(rng, 10),
  label: ([a, b]) => `${a.text} or ${b.text}`,
  tile: () => {
    const svg = s('svg', { width: 96, height: 48, viewBox: '0 0 96 48', 'aria-hidden': 'true', class: 'glyph' });
    svg.appendChild(s('rect', { x: 10, y: 10, width: 34, height: 28, rx: 4, class: 'g-accent' }));
    svg.appendChild(s('rect', { x: 52, y: 10, width: 34, height: 28, rx: 4, class: 'g-outline' }));
    return svg;
  },
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
