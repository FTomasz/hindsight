// Pure game logic. No DOM access here, so it runs under Node tests too.

export const ROUNDS_PER_DAY = 5;
// Day #1 is November 9, 2026, in the player's own time zone.
export const EPOCH = { y: 2026, m: 10, d: 9 };

const DAY_MS = 86400000;

// ---------- numbers ----------

// Smallest "nice" number (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 times a power of ten) >= x.
export function niceCeil(x) {
  if (!(x > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const v = m * p;
    if (v >= x * (1 - 1e-9)) return round(v, 6);
  }
  return 10 * p;
}

function round(v, digits) {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

export function maxOf(arr) {
  let m = -Infinity;
  for (const v of arr) if (v > m) m = v;
  return m;
}

// Decimals to show for a chart, decided once per chart so every label matches.
export function decimalsFor(yMax) {
  if (yMax <= 10) return 2;
  if (yMax <= 100) return 1;
  return 0;
}

export function formatValue(v, yMax) {
  return v.toFixed(decimalsFor(yMax));
}

// ---------- rounds ----------

export function visibleValues(r) {
  return r.values.slice(0, r.cutoff - r.start + 1);
}

export function hiddenValues(r) {
  return r.values.slice(r.cutoff - r.start + 1);
}

export function hiddenCount(r) {
  return r.end - r.cutoff;
}

export function anchorValue(r) {
  return r.values[r.cutoff - r.start];
}

// The y axis needs headroom above the real peak, and also enough room above
// the visible part that the axis alone doesn't give away a spike or a crash.
export function yMaxFor(r) {
  return niceCeil(Math.max(maxOf(r.values) * 1.15, maxOf(visibleValues(r)) * 2.2));
}

// ---------- drawing ----------

// A guess is an array with one slot per hidden year (cutoff+1 .. end).
// Slots the player never touched are null.
export function emptyGuess(r) {
  return new Array(hiddenCount(r)).fill(null);
}

// Sets slot i to v and, when coming from a previous point in the same stroke,
// fills every slot in between so fast strokes don't leave holes.
export function drawTo(guess, i, v, prev) {
  if (prev && prev.i !== i) {
    const step = i > prev.i ? 1 : -1;
    for (let k = prev.i + step; k !== i; k += step) {
      const t = (k - prev.i) / (i - prev.i);
      guess[k] = prev.v + (v - prev.v) * t;
    }
  }
  guess[i] = v;
  return guess;
}

export function isComplete(guess) {
  return guess.length > 0 && guess[guess.length - 1] != null;
}

export function touchedCount(guess) {
  let n = 0;
  for (const v of guess) if (v != null) n++;
  return n;
}

// Fills untouched slots by straight lines between the drawn points, starting
// from the real value at the cutoff. This is exactly the line the player sees.
export function filledGuess(guess, anchor) {
  const out = guess.slice();
  let lastI = -1;
  let lastV = anchor;
  for (let i = 0; i < out.length; i++) {
    if (out[i] == null) continue;
    for (let k = lastI + 1; k < i; k++) {
      out[k] = lastV + (out[i] - lastV) * ((k - lastI) / (i - lastI));
    }
    lastI = i;
    lastV = out[i];
  }
  for (let k = lastI + 1; k < out.length; k++) out[k] = lastV;
  return out;
}

// ---------- scoring ----------

// Score falls off smoothly with the average miss as a share of the real peak:
// 100 × e^(−4 × share). Missing by 5% of the peak on average scores 82, by 10%
// scores 67, by 20% scores 45, by half scores 14.
export function scoreLine(r, line) {
  const actual = hiddenValues(r);
  if (line.length !== actual.length) throw new Error('guess length mismatch');
  let sum = 0;
  for (let i = 0; i < actual.length; i++) sum += Math.abs(line[i] - actual[i]);
  const mae = sum / actual.length;
  const share = mae / maxOf(r.values);
  const score = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-4 * share))));
  return { score, mae };
}

export function scoreGuess(r, guess) {
  return scoreLine(r, filledGuess(guess, anchorValue(r)));
}

// What a player would have scored by just holding the last real value.
export function flatScore(r) {
  return scoreLine(r, new Array(hiddenCount(r)).fill(anchorValue(r))).score;
}

// ---------- days ----------

export function dayNumber(date) {
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const epoch = Date.UTC(EPOCH.y, EPOCH.m, EPOCH.d);
  return Math.floor((today - epoch) / DAY_MS) + 1;
}

export function dateForDay(n) {
  return new Date(EPOCH.y, EPOCH.m, EPOCH.d + (n - 1));
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(items, rand) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Walks a deck of all rounds, reshuffled every time it runs out, and deals
// five per day. A round never repeats inside one day, and every round is
// played once before any round comes back.
const dealCache = new Map();
export function idsForDay(n, allIds) {
  if (n < 1) n = 1;
  const key = allIds.join(',');
  let cache = dealCache.get(key);
  if (!cache) {
    cache = { days: [], deck: [], cycle: 0 };
    dealCache.set(key, cache);
  }
  while (cache.days.length < n) {
    const day = [];
    const skipped = [];
    while (day.length < ROUNDS_PER_DAY) {
      if (cache.deck.length === 0) {
        const fresh = shuffled(allIds, mulberry32(0x9e3779b9 ^ (cache.cycle * 2654435761)));
        cache.cycle++;
        // Rounds from today and yesterday go to the back of the new deck, so
        // nothing repeats on back-to-back days when the deck wraps around.
        const recent = new Set(day.concat(cache.days.length ? cache.days[cache.days.length - 1] : []));
        cache.deck = fresh.filter((id) => !recent.has(id)).concat(fresh.filter((id) => recent.has(id)));
      }
      const id = cache.deck.shift();
      if (day.includes(id)) skipped.push(id);
      else day.push(id);
    }
    // Rounds skipped as duplicates go back on top of the deck for tomorrow.
    cache.deck = skipped.concat(cache.deck);
    cache.days.push(day);
  }
  return cache.days[n - 1].slice();
}

// ---------- challenge links ----------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const Q = 4095; // two base64 characters per year

export function encodeLine(line, yMax) {
  let s = '';
  for (const v of line) {
    const q = Math.max(0, Math.min(Q, Math.round((v / yMax) * Q)));
    s += B64[q >> 6] + B64[q & 63];
  }
  return s;
}

export function decodeLine(s, yMax) {
  if (typeof s !== 'string' || s.length % 2 !== 0) return null;
  const out = [];
  for (let i = 0; i < s.length; i += 2) {
    const hi = B64.indexOf(s[i]);
    const lo = B64.indexOf(s[i + 1]);
    if (hi < 0 || lo < 0) return null;
    out.push(((hi << 6) | lo) / Q * yMax);
  }
  return out;
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export const NAME_MAX = 24;

export function cleanName(name) {
  return String(name || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

// Generic challenge payload: { v: 1, g: gameId, s: seed, n: name, sc: [0..100], x?: game data }
export function encodePayload(p) {
  return toBase64Url(JSON.stringify(p));
}

export function decodePayload(code) {
  try {
    if (typeof code !== 'string' || code.length === 0 || code.length > 12000) return null;
    const p = JSON.parse(fromBase64Url(code));
    if (!p || typeof p !== 'object' || p.v !== 1) return null;
    if (typeof p.g !== 'string' || !/^[a-z-]{1,20}$/.test(p.g)) return null;
    if (typeof p.s !== 'string' || !/^(d[1-9][0-9]{0,5}|p[0-9a-z]{1,12})$/.test(p.s)) return null;
    if (!Array.isArray(p.sc) || p.sc.length === 0 || p.sc.length > 20) return null;
    if (!p.sc.every((v) => Number.isInteger(v) && v >= 0 && v <= 100)) return null;
    const out = { v: 1, g: p.g, s: p.s, n: cleanName(p.n), sc: p.sc.slice() };
    if (Array.isArray(p.x) && p.x.length === p.sc.length && p.x.every((v) => v === null || typeof v === 'string')) out.x = p.x.slice();
    return out;
  } catch {
    return null;
  }
}

// FNV-1a, for turning seed strings into RNG seeds.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------- stats ----------

// days: { [dayNumber]: { done: true, total } }
export function statsFor(days, today) {
  const done = Object.keys(days)
    .map(Number)
    .filter((n) => days[n] && days[n].done)
    .sort((a, b) => a - b);
  const played = done.length;
  const totals = done.map((n) => days[n].total);
  const average = played ? Math.round(totals.reduce((a, b) => a + b, 0) / played) : 0;
  const best = played ? maxOf(totals) : 0;
  const set = new Set(done);
  let streak = 0;
  let n = set.has(today) ? today : today - 1;
  while (set.has(n)) {
    streak++;
    n--;
  }
  return { played, average, best, streak };
}

export function ngramUrl(r) {
  const q = new URLSearchParams({
    content: r.phrase,
    year_start: String(r.start),
    year_end: String(r.end),
    corpus: 'en',
    smoothing: '1',
  });
  return 'https://books.google.com/ngrams/graph?' + q.toString();
}

// ---------- number input for Estimate ----------

const WORD_UNITS = {
  k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, mil: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9,
  t: 1e12, tn: 1e12, trillion: 1e12, quadrillion: 1e15, quintillion: 1e18, sextillion: 1e21,
  hundred: 100, dozen: 12,
};

// Parses what people type as an estimate: "1,263", "1.2k", "3 million", "4e6",
// "8 × 10^67", "60*60*24", "2^10", "(3+4)*2", "25%". Returns a finite number or null.
export function parseAmount(input) {
  if (typeof input !== 'string') return null;
  let str = input.trim().toLowerCase();
  if (!str || str.length > 200) return null;
  str = str
    .replace(/[×✕✖]/g, '*') // ×
    .replace(/[−–—]/g, '-')
    .replace(/[÷]/g, '/')
    .replace(/\*\*/g, '^')
    .replace(/(\d),(?=\d{3}(\D|$))/g, '$1') // thousands commas
    .replace(/(\d)[\s_'  ](?=\d{3}(\D|$))/g, '$1') // 1 000 000
    .replace(/(\d)\s*x\s*(?=[\d(])/g, '$1*');
  const toks = [];
  const re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([a-z]+)|([-+*/^()%]))/y;
  let m;
  while (re.lastIndex < str.length) {
    m = re.exec(str);
    if (!m) {
      if (/^\s*$/.test(str.slice(re.lastIndex))) break;
      return null;
    }
    if (m[1] !== undefined) toks.push({ t: 'n', v: parseFloat(m[1]) });
    else if (m[2] !== undefined) {
      if (!(m[2] in WORD_UNITS)) return null;
      toks.push({ t: 'u', v: WORD_UNITS[m[2]] });
    } else toks.push({ t: m[3] });
  }
  let i = 0;
  const peek = () => toks[i];
  function expr() {
    let v = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = toks[i++].t;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function term() {
    let v = unary();
    while (peek() && (peek().t === '*' || peek().t === '/')) {
      const op = toks[i++].t;
      const r = unary();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function unary() {
    if (peek() && peek().t === '-') { i++; return -unary(); }
    if (peek() && peek().t === '+') { i++; return unary(); }
    return power();
  }
  function power() {
    const base = postfix();
    if (peek() && peek().t === '^') { i++; return Math.pow(base, unary()); }
    return base;
  }
  function postfix() {
    let v = atom();
    while (peek() && (peek().t === 'u' || peek().t === '%')) {
      const tk = toks[i++];
      v = tk.t === '%' ? v / 100 : v * tk.v;
    }
    return v;
  }
  function atom() {
    const tk = toks[i++];
    if (!tk) throw new Error('end');
    if (tk.t === 'n') return tk.v;
    if (tk.t === '(') {
      const v = expr();
      if (!peek() || peek().t !== ')') throw new Error('paren');
      i++;
      return v;
    }
    throw new Error('unexpected');
  }
  try {
    const v = expr();
    if (i !== toks.length) return null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

// Within 10x scores something, exact scores 100, 2x off scores 70.
export function estimateScore(guess, answer) {
  if (!(guess > 0) || !(answer > 0)) return { score: 0, ratio: Infinity, low: guess < answer };
  const ratio = Math.max(guess / answer, answer / guess);
  const score = Math.max(0, Math.round(100 * (1 - Math.log10(ratio))));
  return { score, ratio, low: guess < answer };
}
