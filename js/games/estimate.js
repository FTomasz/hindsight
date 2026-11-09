import { h, s, icon, button, formatBig, sciDisplay, nf } from '../ui.js';
import { shuffled, parseAmount, estimateScore } from '../core.js';
import { ESTIMATES } from '../content/estimates.js';

function show(v) {
  if (Math.abs(v) < 1e6 && Number.isInteger(v)) return nf.format(v);
  if (Math.abs(v) < 1e6) return String(Number(v.toPrecision(4)));
  return sciDisplay(formatBig(v));
}

// The answer as written in full where that is readable, else in words.
function showAnswer(v) {
  if (v >= 1e6 && v < 1e15 && Number.isInteger(v)) return nf.format(v);
  return show(v);
}

// A log scale from the answer ÷ 100 to × 100, with both marks on it.
function scale(guess, answer, width) {
  const span = 2;
  const pos = (v) => {
    const t = (Math.log10(v / answer) + span) / (2 * span);
    return 16 + Math.max(0, Math.min(1, t)) * (width - 32);
  };
  const svg = s('svg', { width, height: 64, viewBox: `0 0 ${width} 64`, class: 'log-scale', 'aria-hidden': 'true' });
  svg.appendChild(s('line', { x1: 16, x2: width - 16, y1: 32, y2: 32, class: 'baseline' }));
  const ticks = [[-2, '÷100'], [-1, '÷10'], [0, ''], [1, '×10'], [2, '×100']];
  for (const [e, lbl] of ticks) {
    const x = pos(answer * Math.pow(10, e));
    svg.appendChild(s('line', { x1: x, x2: x, y1: 26, y2: 38, class: 'grid' }));
    if (lbl) svg.appendChild(s('text', { x, y: 56, class: 'tick', 'text-anchor': 'middle' }, lbl));
  }
  const xa = pos(answer);
  const xg = guess > 0 ? pos(guess) : 16;
  svg.appendChild(s('line', { x1: Math.min(xa, xg), x2: Math.max(xa, xg), y1: 32, y2: 32, class: 'gap' }));
  svg.appendChild(s('circle', { cx: xa, cy: 32, r: 6, class: 'dot actual' }));
  svg.appendChild(s('circle', { cx: xg, cy: 32, r: 6, class: 'dot you' }));
  return svg;
}

export default {
  id: 'estimate',
  title: 'Estimate',
  blurb: 'Big questions with exact answers. Get within a factor of ten to score',
  rounds: 5,
  unitPlural: 'questions',
  section: 'numbers',
  build: (rng) => shuffled(ESTIMATES, rng).slice(0, 5),
  label: (it) => it.q,

  play(area, it) {
    return new Promise((resolve) => {
      const input = h('input', {
        id: 'guess', class: 'guess-input', type: 'text', inputmode: 'decimal', autocomplete: 'off',
        spellcheck: 'false', placeholder: 'Your guess', 'aria-describedby': 'guess-read',
      });
      const read = h('p', { id: 'guess-read', class: 'guess-read', 'aria-live': 'polite' });
      const lock = button('Lock it in', { kind: 'primary', disabled: true, onclick: submit });
      const form = h('form', { class: 'guess-form', onsubmit: (e) => { e.preventDefault(); submit(); } },
        h('label', { for: 'guess', class: 'sr', text: 'Your guess in ' + it.unit }),
        h('div', { class: 'guess-field' }, input, h('span', { class: 'guess-unit', text: it.unit })),
        read,
        h('div', { class: 'controls' }, h('p', { class: 'hint', text: 'Numbers, words or math all work: 3.5 million, 4e6, 60*60*24' }), lock));

      // Scratch pad: notes plus a running calculator.
      const notes = h('textarea', { class: 'notes', rows: '4', placeholder: 'Notes', 'aria-label': 'Notes' });
      const calcIn = h('input', { class: 'calc-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', placeholder: 'e.g. 365*24*60', 'aria-label': 'Calculator' });
      const calcOut = h('output', { class: 'calc-out', 'aria-live': 'polite' });
      const useBtn = button('Use as guess', { disabled: true, onclick: () => { input.value = calcIn.value; onInput(); input.focus(); } });
      const pad = h('details', { class: 'pad' },
        h('summary', null, icon('calculator', 16), h('span', { text: 'Scratch pad' })),
        h('div', { class: 'pad-body' },
          notes,
          h('div', { class: 'calc' }, calcIn, calcOut, useBtn)));
      calcIn.addEventListener('input', () => {
        const v = parseAmount(calcIn.value);
        calcOut.textContent = v == null ? (calcIn.value.trim() ? '…' : '') : '= ' + show(v);
        useBtn.disabled = v == null || !(v > 0);
      });

      area.append(h('h2', { class: 'question', text: it.q }), form, pad);
      input.addEventListener('input', onInput);
      requestAnimationFrame(() => input.focus({ preventScroll: true }));

      function onInput() {
        const v = parseAmount(input.value);
        const ok = v != null && v > 0;
        lock.disabled = !ok;
        read.textContent = !input.value.trim() ? '' : ok ? `${show(v)} ${it.unit}` : v != null ? 'Guess a number above zero' : 'Can’t read that as a number yet';
        read.classList.toggle('bad', !ok && !!input.value.trim());
      }

      function submit() {
        const g = parseAmount(input.value);
        if (g == null || !(g > 0)) return;
        const { score, ratio, low } = estimateScore(g, it.answer);
        form.remove();
        const close = ratio < 1.005;
        area.insertBefore(h('div', { class: 'compare' },
          h('div', { class: 'cmp you' }, h('span', { class: 'cmp-label', text: 'You guessed' }), h('span', { class: 'cmp-num', text: show(g) }), h('span', { class: 'cmp-unit', text: it.unit })),
          h('div', { class: 'cmp actual' }, h('span', { class: 'cmp-label', text: 'Answer' }), h('span', { class: 'cmp-num', text: showAnswer(it.answer) }), h('span', { class: 'cmp-unit', text: it.unit }))), pad);
        area.insertBefore(scale(g, it.answer, Math.max(280, area.clientWidth)), pad);
        pad.remove();
        const ratioText = ratio >= 1000 ? `${sciDisplay(formatBig(ratio))}×` : `${ratio < 10 ? ratio.toFixed(2) : Math.round(ratio)}×`;
        resolve({
          score,
          verdict: close ? 'Spot on' : `${ratioText} too ${low ? 'low' : 'high'}`,
          detail: score === 0 ? 'More than ten times off scores zero.' : null,
          note: it.math,
          link: { href: it.source, label: 'Source' },
          record: { line: `You ${show(g)}, answer ${showAnswer(it.answer)}` },
        });
      }
    });
  },
};
