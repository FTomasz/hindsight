import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUNDS } from '../js/data.js';
import {
  niceCeil, yMaxFor, visibleValues, hiddenValues, hiddenCount, anchorValue, maxOf,
  emptyGuess, drawTo, isComplete, filledGuess, scoreLine, scoreGuess, flatScore,
  dayNumber, dateForDay, idsForDay, encodeLine, decodeLine, encodePayload,
  decodePayload, cleanName, statsFor, formatValue, ROUNDS_PER_DAY, parseAmount,
  estimateScore, mulberry32, hashString,
} from '../js/core.js';

const byId = Object.fromEntries(ROUNDS.map((r) => [r.id, r]));
const ids = ROUNDS.map((r) => r.id);

test('data is well formed', () => {
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.ok(ROUNDS.length >= ROUNDS_PER_DAY * 3);
  for (const r of ROUNDS) {
    assert.equal(r.values.length, r.end - r.start + 1, r.id);
    assert.ok(r.start < r.cutoff && r.cutoff < r.end && r.end <= 2022, r.id);
    assert.ok(r.values.every((v) => Number.isFinite(v) && v >= 0), r.id);
    assert.ok(hiddenCount(r) >= 10, r.id + ' has enough to draw');
    assert.ok(r.note.length > 20 && !r.note.includes('!'), r.id);
    assert.ok(maxOf(r.values) > 0, r.id);
  }
});

test('niceCeil', () => {
  assert.equal(niceCeil(0.549), 0.6);
  assert.equal(niceCeil(4.3), 5);
  assert.equal(niceCeil(5), 5);
  assert.equal(niceCeil(121), 150);
  assert.equal(niceCeil(8.1), 10);
  assert.equal(niceCeil(0), 1);
});

test('the y axis always fits the whole real line with headroom', () => {
  for (const r of ROUNDS) {
    const y = yMaxFor(r);
    assert.ok(y >= maxOf(r.values) * 1.15, r.id);
    assert.ok(y >= maxOf(visibleValues(r)) * 2.2, r.id);
    assert.ok(y <= maxOf(r.values) * 6, r.id + ' axis not absurdly tall');
  }
});

test('drawing fills the years between pointer samples', () => {
  const g = new Array(6).fill(null);
  drawTo(g, 0, 1);
  drawTo(g, 4, 5, { i: 0, v: 1 });
  assert.deepEqual(g, [1, 2, 3, 4, 5, null]);
  drawTo(g, 2, 0, { i: 4, v: 5 }); // drawing backwards overwrites
  assert.deepEqual(g.slice(0, 5), [1, 2, 0, 2.5, 5]);
  assert.equal(isComplete(g), false);
  drawTo(g, 5, 5);
  assert.equal(isComplete(g), true);
});

test('gaps are filled with straight lines from the anchor', () => {
  assert.deepEqual(filledGuess([null, 4, null, null, 1], 2), [3, 4, 3, 2, 1]);
  assert.deepEqual(filledGuess([null, null], 7), [7, 7]);
});

test('a perfect line scores 100 and scores stay within 0..100', () => {
  for (const r of ROUNDS) {
    assert.equal(scoreLine(r, hiddenValues(r)).score, 100, r.id);
    const zero = scoreLine(r, new Array(hiddenCount(r)).fill(0)).score;
    const top = scoreLine(r, new Array(hiddenCount(r)).fill(yMaxFor(r))).score;
    assert.ok(zero >= 0 && zero < 100 && top >= 0 && top < 100, r.id);
    const f = flatScore(r);
    assert.ok(f >= 0 && f < 100, r.id);
  }
});

test('scoreGuess uses the same interpolation the player sees', () => {
  const r = byId.fax;
  const g = emptyGuess(r);
  g[g.length - 1] = anchorValue(r);
  assert.equal(scoreGuess(r, g).score, flatScore(r));
});

test('scoring formula', () => {
  const r = { start: 0, end: 2, cutoff: 0, values: [10, 10, 10] };
  assert.equal(scoreLine(r, [10, 10]).score, 100);
  assert.equal(scoreLine(r, [9.5, 9.5]).score, 82); // 5% of peak
  assert.equal(scoreLine(r, [9, 11]).score, 67); // 10% of peak
  assert.equal(scoreLine(r, [8, 12]).score, 45); // 20% of peak
  assert.equal(scoreLine(r, [0, 0]).score, 2);
});

test('day numbers follow the local calendar', () => {
  assert.equal(dayNumber(new Date(2026, 10, 9, 0, 0, 1)), 1);
  assert.equal(dayNumber(new Date(2026, 10, 9, 23, 59)), 1);
  assert.equal(dayNumber(new Date(2026, 10, 10, 0, 0)), 2);
  assert.equal(dayNumber(new Date(2027, 0, 1, 12)), 54);
  // across a daylight saving change (US: Mar 14, 2027)
  assert.equal(dayNumber(new Date(2027, 2, 15)) - dayNumber(new Date(2027, 2, 13)), 2);
  for (const n of [1, 2, 54, 200]) assert.equal(dayNumber(dateForDay(n)), n);
});

test('daily deal: five distinct rounds, stable, and every round before repeats', () => {
  for (let n = 1; n <= 120; n++) {
    const day = idsForDay(n, ids);
    assert.equal(day.length, ROUNDS_PER_DAY);
    assert.equal(new Set(day).size, ROUNDS_PER_DAY, 'day ' + n);
    assert.ok(day.every((id) => byId[id]));
  }
  assert.deepEqual(idsForDay(7, ids), idsForDay(7, ids));
  // the first full pass of the deck covers every round once
  const first = [];
  for (let n = 1; first.length < ids.length; n++) first.push(...idsForDay(n, ids));
  assert.deepEqual(new Set(first.slice(0, ids.length)).size, ids.length);
  // no round on two days in a row
  for (let n = 1; n < 120; n++) {
    const a = new Set(idsForDay(n, ids));
    const overlap = idsForDay(n + 1, ids).filter((id) => a.has(id));
    assert.equal(overlap.length, 0, `days ${n}-${n + 1} share ${overlap}`);
  }
});

test('line encoding round-trips within the quantization step', () => {
  const yMax = 7;
  const line = [0, 1.234, 6.9, 7, 3.5];
  const back = decodeLine(encodeLine(line, yMax), yMax);
  line.forEach((v, i) => assert.ok(Math.abs(v - back[i]) <= yMax / 4095, `${v} vs ${back[i]}`));
  assert.equal(decodeLine('abc', 7), null);
  assert.equal(decodeLine('a$', 7), null);
});

test('challenge payloads round-trip and reject tampering', () => {
  const line = encodeLine(hiddenValues(byId.fax), yMaxFor(byId.fax));
  const p = { v: 1, g: 'draw', s: 'd3', n: '  Maya <b>  ', sc: [100, 0, 55, 70, 12], x: [line, null, null, null, null] };
  const code = encodePayload(p);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const back = decodePayload(code);
  assert.equal(back.n, 'Maya <b>');
  assert.deepEqual(back.sc, p.sc);
  assert.equal(back.x[0], line);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  assert.equal(decodePayload(''), null);
  assert.equal(decodePayload('%%%'), null);
  assert.equal(decodePayload(enc({ ...p, v: 2 })), null);
  assert.equal(decodePayload(enc({ ...p, g: '../x' })), null);
  assert.equal(decodePayload(enc({ ...p, s: 'zz' })), null);
  assert.equal(decodePayload(enc({ ...p, sc: [101] })), null);
  assert.equal(decodePayload(enc({ ...p, sc: [1.5] })), null);
  assert.equal(decodePayload(enc({ ...p, sc: [] })), null);
  assert.equal(decodePayload(enc({ ...p, x: [1, 2, 3, 4, 5] })).x, undefined, 'bad extras dropped');
  assert.ok(decodePayload(enc({ ...p, s: 'pabc123' })));
});

test('estimate input parsing', () => {
  const cases = { '1,263': 1263, '1.2k': 1200, '3 million': 3e6, '4e6': 4e6, '8 × 10^67': 8e67,
    '60*60*24': 86400, '2^10': 1024, '(3+4)*2': 14, '25%': 0.25, '1 000 000': 1e6, '2x365': 730,
    '.5': 0.5, '13.8 billion': 13.8e9, '43 quintillion': 43e18, '1,000,000': 1e6 };
  for (const [k, v] of Object.entries(cases)) assert.ok(Math.abs(parseAmount(k) - v) < 1e-6 * Math.abs(v), k + ' -> ' + parseAmount(k));
  for (const bad of ['', 'abc', '1..2', '3 billion 2', '(1', '1,23', '5 apples']) assert.equal(parseAmount(bad), null, bad);
});

test('estimate scoring is symmetric on a log scale', () => {
  assert.equal(estimateScore(100, 100).score, 100);
  assert.equal(estimateScore(200, 100).score, estimateScore(50, 100).score);
  assert.equal(estimateScore(200, 100).score, 70);
  assert.equal(estimateScore(1000, 100).score, 0);
  assert.equal(estimateScore(0, 100).score, 0);
  assert.equal(estimateScore(730, 1263).ratio.toFixed(2), '1.73');
});

test('names are cleaned', () => {
  assert.equal(cleanName('a\u0000b\n c'), 'ab c');
  assert.equal(cleanName('x'.repeat(50)).length, 24);
  assert.equal(cleanName(undefined), '');
});

test('stats and streaks', () => {
  const days = { 1: { done: true, total: 300 }, 2: { done: true, total: 400 }, 4: { done: true, total: 200 }, 5: { done: false } };
  assert.deepEqual(statsFor(days, 4), { played: 3, average: 300, best: 400, streak: 1 });
  assert.equal(statsFor(days, 5).streak, 1, 'today not played yet keeps yesterday’s streak');
  assert.equal(statsFor(days, 6).streak, 0);
  assert.equal(statsFor({ 1: { done: true, total: 1 }, 2: { done: true, total: 1 } }, 2).streak, 2);
  assert.deepEqual(statsFor({}, 1), { played: 0, average: 0, best: 0, streak: 0 });
});

test('value formatting is consistent per chart', () => {
  assert.equal(formatValue(0.4, 0.6), '0.40');
  assert.equal(formatValue(5.123, 8), '5.12');
  assert.equal(formatValue(36.94, 50), '36.9');
  assert.equal(formatValue(105.5, 200), '106');
});

test('history content and pickers', async () => {
  const { EVENTS } = await import('../js/content/events.js');
  const { ESTIMATES } = await import('../js/content/estimates.js');
  assert.equal(new Set(EVENTS.map((e) => e.id)).size, EVENTS.length);
  assert.equal(new Set(ESTIMATES.map((e) => e.id)).size, ESTIMATES.length);
  for (const e of ESTIMATES) {
    assert.ok(e.answer > 0 && e.q.endsWith('?') && e.source.startsWith('https://') && e.math && e.unit, e.id);
  }
  for (const e of EVENTS) assert.ok(Number.isInteger(e.year) && e.text && !e.text.endsWith('.'), e.id);
});

test('siege sums always have whole positive answers', async () => {
  const { makeProblem, siegeScore } = await import('../js/siege-core.js');
  const rng = mulberry32(42);
  for (let i = 0; i < 3000; i++) {
    const p = makeProblem(i % 3, rng);
    assert.ok(Number.isInteger(p.answer) && p.answer > 0, p.text + ' = ' + p.answer);
    const expr = p.text.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
      .replace(/(\d+)% of (\d+)/, '($1/100*$2)').replace(/(\d+)\/(\d+) of (\d+)/, '($1/$2*$3)');
    assert.equal(Function('return ' + expr)(), p.answer, p.text);
  }
  assert.deepEqual(siegeScore({ you: [1000, 1000], bot: [0, 0] }, 2000, 0), { score: 100, outcome: 'You took both towers' });
  assert.equal(siegeScore({ you: [1000, 1000], bot: [1000, 1000] }, 0, 0).score, 50);
  assert.equal(siegeScore({ you: [0, 0], bot: [1000, 1000] }, 0, 2000).score, 0);
});
