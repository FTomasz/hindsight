import { WORDS, WORDS_START, WORDS_END } from './content/words.js';
import { maxOf } from './core.js';

export const START = WORDS_START;
export const END = WORDS_END;
const map = new Map(WORDS.map(([p, v]) => [p, v]));
export const PHRASES = WORDS.map(([p]) => p);

export function series(phrase) {
  const v = map.get(phrase);
  if (!v) throw new Error('no data for ' + phrase);
  return v;
}

export function valueAt(phrase, year) {
  return series(phrase)[year - START];
}

export function peakYear(phrase) {
  const v = series(phrase);
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[best]) best = i;
  return START + best;
}

// A phrase has a clear peak when the peak is at least 1.5 times the level
// 25 years either side of it and it isn't at either edge of the data.
export function hasClearPeak(phrase) {
  const v = series(phrase);
  const y = peakYear(phrase);
  if (y < START + 20 || y > END - 7) return false;
  const i = y - START;
  const before = v[Math.max(0, i - 25)];
  const after = v[Math.min(v.length - 1, i + 25)];
  return v[i] >= 1.5 * Math.max(before, 1e-9) && v[i] >= 1.5 * Math.max(after, 1e-9) && v[i] >= 0.2;
}

// Pearson correlation of two series over a year range.
export function correlation(a, b, from = 1900, to = END) {
  const x = series(a).slice(from - START, to - START + 1);
  const y = series(b).slice(from - START, to - START + 1);
  const mx = x.reduce((s, v) => s + v, 0) / x.length;
  const my = y.reduce((s, v) => s + v, 0) / y.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

export function slice(phrase, from, to) {
  return series(phrase).slice(from - START, to - START + 1);
}

export function firstYearAbove(phrase, level) {
  const v = series(phrase);
  for (let i = 0; i < v.length; i++) if (v[i] >= level) return START + i;
  return START;
}

export function maxValue(phrase) {
  return maxOf(series(phrase));
}

export function ngramLink(phrase, from = START, to = END) {
  const q = new URLSearchParams({ content: phrase, year_start: String(from), year_end: String(to), corpus: 'en', smoothing: '1' });
  return 'https://books.google.com/ngrams/graph?' + q.toString();
}
