import { h, icon, button, toast, shareText, copyText, countUp, reducedMotion } from './ui.js';
import { dayNumber, dateForDay, mulberry32, hashString, cleanName, statsFor,
  encodePayload, decodePayload, NAME_MAX } from './core.js';
import { GAMES } from './games/index.js';

const SITE = 'https://prathammukewar.github.io/hindsight/';
const STORE_KEY = 'hindsight:v1';
const app = document.getElementById('app');

// ---------- storage ----------

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function save(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}
let store = load();
store.games = store.games && typeof store.games === 'object' ? store.games : {};

function dayRecord(gameId, day) {
  const g = (store.games[gameId] ||= { days: {} });
  g.days ||= {};
  return g.days[day] || null;
}
function writeDayRecord(gameId, day, rec) {
  const g = (store.games[gameId] ||= { days: {} });
  g.days[day] = rec;
  save(store);
}

function today() { return dayNumber(new Date()); }

function longDate(n) {
  return dateForDay(n).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function totalOf(game, scores) {
  return scores.reduce((a, b) => a + b, 0);
}

function formatTotal(game, scores) {
  if (game.binary) return `${scores.filter((v) => v >= 50).length} / ${scores.length}`;
  return `${totalOf(game, scores)} / ${scores.length * 100}`;
}

function gameStats(game) {
  const days = (store.games[game.id] && store.games[game.id].days) || {};
  const flat = {};
  for (const [n, rec] of Object.entries(days)) {
    if (rec && rec.done) flat[n] = { done: true, total: totalOf(game, rec.scores) };
  }
  return statsFor(flat, today());
}

function overallStreak() {
  const flat = {};
  for (const g of GAMES) {
    const days = (store.games[g.id] && store.games[g.id].days) || {};
    for (const [n, rec] of Object.entries(days)) if (rec && rec.done) flat[n] = { done: true, total: 0 };
  }
  return statsFor(flat, today()).streak;
}

// ---------- routing ----------

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  return { path, params };
}

function go(path) {
  if (location.hash === '#/' + path) render();
  else location.hash = '/' + path;
}

window.addEventListener('hashchange', render);

let cleanup = null;
function render() {
  if (cleanup) { cleanup(); cleanup = null; }
  const { path, params } = parseRoute();
  document.documentElement.scrollTop = 0;
  const game = GAMES.find((g) => g.id === path);
  if (!game) return renderHub();
  const c = params.get('c');
  if (c) {
    const payload = decodePayload(c);
    if (payload && payload.g === game.id) return startGame(game, { challenge: payload });
    toast('That challenge link doesn’t work. Here is today’s game instead');
    history.replaceState(null, '', '#/' + game.id);
  }
  if (params.get('practice') === '1') return startGame(game, { practice: true });
  return startGame(game, {});
}

// ---------- header ----------

function header(sub) {
  return h('header', { class: 'site-head' },
    h('a', { class: 'wordmark', href: '#/' },
      mark(),
      h('span', { text: 'Hindsight' })),
    sub ? h('span', { class: 'head-meta' }, sub) : null,
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'About Hindsight', onclick: openAbout }, icon('help')));
}

function mark() {
  const span = h('span', { class: 'mark', 'aria-hidden': 'true' });
  span.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 15 L6 11 L9 12.5 L11 9"/><path d="M11 9 L14 5 L18 3" stroke-dasharray="1.5 2.5"/></svg>';
  return span;
}

// ---------- hub ----------

function renderHub() {
  document.title = 'Hindsight: daily games about numbers, history and words';
  const n = today();
  const played = GAMES.filter((g) => (dayRecord(g.id, n) || {}).done).length;
  const streak = overallStreak();

  const featured = GAMES[0];
  const rest = GAMES.slice(1);

  const page = h('main', { class: 'page hub' },
    header(`No. ${n}`),
    h('section', { class: 'hub-intro' },
      h('h1', { text: 'Daily games about numbers, history and the words in 200 years of books' }),
      h('p', { class: 'hub-meta' },
        h('span', { text: longDate(n) }),
        h('span', { text: `${played} of ${GAMES.length} played today` }),
        streak > 0 ? h('span', { text: `${streak}-day streak` }) : null)),
    featuredTile(featured, n),
    h('ul', { class: 'game-list' }, rest.map((g) => h('li', null, gameRow(g, n)))),
    footer());
  app.replaceChildren(page);
}

function statusFor(game, n) {
  const rec = dayRecord(game.id, n);
  if (rec && rec.done) return { text: formatTotal(game, rec.scores), state: 'done' };
  if (rec && rec.scores && rec.scores.length) return { text: `${rec.scores.length} of ${game.rounds} done`, state: 'partial' };
  return { text: `${game.rounds} ${game.unitPlural || 'rounds'}`, state: 'new' };
}

function featuredTile(g, n) {
  const st = statusFor(g, n);
  return h('a', { class: 'featured', href: '#/' + g.id },
    h('div', { class: 'featured-copy' },
      h('h2', { text: g.title }),
      h('p', { text: g.blurb }),
      h('span', { class: 'status ' + st.state }, st.state === 'done' ? icon('check', 16) : null, h('span', { text: st.text }))),
    h('div', { class: 'featured-visual' }, g.tile ? g.tile({ large: true }) : null));
}

function gameRow(g, n) {
  const st = statusFor(g, n);
  return h('a', { class: 'game-row', href: '#/' + g.id },
    h('div', { class: 'row-visual' }, g.tile ? g.tile({}) : null),
    h('div', { class: 'row-copy' },
      h('h3', { text: g.title }),
      h('p', { text: g.blurb })),
    h('span', { class: 'status ' + st.state }, st.state === 'done' ? icon('check', 16) : null, h('span', { text: st.text })));
}

function footer() {
  return h('footer', { class: 'site-foot' },
    h('p', null,
      'Word data from the ',
      h('a', { href: 'https://books.google.com/ngrams', rel: 'noopener', target: '_blank', text: 'Google Books Ngram Viewer' }),
      ' (English, 2022 corpus). Every estimate and date links its source. A new set every day at midnight your time.'),
    h('p', null,
      h('a', { href: 'https://github.com/prathammukewar/hindsight', rel: 'noopener', target: '_blank', text: 'Source on GitHub' }),
      ' · Made by Pratham Mukewar'));
}

// ---------- about dialog ----------

function openAbout() {
  const close = () => dlg.close();
  const dlg = h('dialog', { class: 'about', 'aria-labelledby': 'about-title' },
    h('div', { class: 'about-head' },
      h('h2', { id: 'about-title', text: 'About Hindsight' }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, icon('x'))),
    h('p', { text: `${GAMES.length} short games. Each one has a new set every day at midnight your time, the same for everyone, plus unlimited practice.` }),
    h('p', { text: 'The word games use the Google Books Ngram Viewer: how often a word or phrase appears in English books each year, as uses per million words (for two-word phrases, per million two-word sequences), averaged over 3 years. Phrases are case-sensitive, and a word counts every meaning it has, so “Pluto” includes the planet, the god and the dog.' }),
    h('p', { text: 'Estimates and dates come from encyclopedias and official sources, linked after each answer. Spot a mistake? Open an issue on GitHub and it gets fixed. Siege is an original math battle: no data, just quick sums.' }),
    h('p', { text: 'Your scores stay in this browser. Nothing is sent anywhere. Challenge links carry your name, scores and, for Draw the rest, your lines, inside the link itself.' }));
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.appendChild(dlg);
  dlg.showModal();
}

// ---------- game runner ----------

function startGame(game, { practice = false, challenge = null }) {
  const n = today();
  let mode = 'daily';
  let seed = 'd' + n;
  let day = n;
  if (practice) {
    mode = 'practice';
    seed = 'p' + Math.floor(Math.random() * 2 ** 31).toString(36);
  }
  if (challenge) {
    seed = challenge.s;
    const m = /^d(\d+)$/.exec(seed);
    day = m ? Number(m[1]) : 0;
    const playedToday = (dayRecord(game.id, n) || {}).done;
    mode = day === n && !playedToday ? 'daily' : 'challenge';
  }

  let items;
  try {
    items = game.build(mulberry32(hashString(game.id + ':' + seed)), { seed, day: day || n });
  } catch (e) {
    console.error(e);
    toast('Couldn’t load that set');
    return go('');
  }
  if (challenge && (!Array.isArray(challenge.sc) || challenge.sc.length !== items.length)) {
    toast('That challenge link doesn’t work');
    return go(game.id);
  }

  const rival = challenge ? { name: challenge.n || 'Your friend', scores: challenge.sc, extra: challenge.x || null } : null;

  // Resume a daily set that was started earlier today.
  let rec = mode === 'daily' ? dayRecord(game.id, n) : null;
  if (mode === 'daily' && rec && rec.done) return showSummary(game, { mode, seed, day: n, items, scores: rec.scores, records: rec.records || [], rival, extras: rec.extras || [] });
  const scores = rec && Array.isArray(rec.scores) ? rec.scores.slice(0, items.length) : [];
  const records = rec && Array.isArray(rec.records) ? rec.records.slice(0, scores.length) : [];
  const extras = rec && Array.isArray(rec.extras) ? rec.extras.slice(0, scores.length) : [];

  document.title = game.title + ' · Hindsight';
  const sub = mode === 'daily' ? `No. ${n}` : mode === 'practice' ? 'Practice' : 'Challenge';
  const pills = h('ol', { class: 'pills', 'aria-label': 'Progress' });
  const stage = h('div', { class: 'stage' });
  const page = h('main', { class: 'page game game-' + game.id },
    header(sub),
    h('div', { class: 'game-head' },
      h('a', { class: 'back', href: '#/' }, icon('arrow-left', 16), h('span', { text: 'All games' })),
      h('h1', { text: game.title }),
      pills),
    rival ? h('p', { class: 'rival-banner' },
      h('span', { class: 'rival-name', text: rival.name }),
      ` scored ${formatTotal(game, rival.scores)} on this set. Your scores appear next to theirs as you go.`) : null,
    stage);
  app.replaceChildren(page);

  function paintPills(active) {
    pills.replaceChildren(...items.map((_, i) => h('li', {
      class: i < scores.length ? 'done' : i === active ? 'active' : '',
      'aria-current': i === active ? 'step' : null,
    }, h('span', { class: 'sr', text: `Round ${i + 1}${i < scores.length ? ', done' : ''}` }))));
  }

  let alive = true;
  cleanup = () => { alive = false; if (stage._cleanup) stage._cleanup(); };

  async function playRound(i) {
    if (!alive) return;
    if (i >= items.length) {
      if (mode === 'daily') writeDayRecord(game.id, n, { scores, records, extras, done: true });
      return showSummary(game, { mode, seed, day: n, items, scores, records, rival, extras });
    }
    paintPills(i);
    const area = h('div', { class: 'round' });
    const result = h('div', { class: 'result', 'aria-live': 'polite' });
    stage.replaceChildren(area, result);
    const ctx = {
      index: i,
      total: items.length,
      rival: rival ? { name: rival.name, score: rival.scores[i], extra: rival.extra ? rival.extra[i] : null } : null,
      onCleanup: (fn) => { stage._cleanup = fn; },
    };
    let res;
    try {
      res = await game.play(area, items[i], ctx);
    } catch (e) {
      console.error(e);
      res = null;
    }
    if (!alive || !res) return;
    if (stage._cleanup) { stage._cleanup(); stage._cleanup = null; }
    scores.push(res.score);
    records.push(res.record ?? null);
    extras.push(res.extra ?? null);
    if (mode === 'daily') writeDayRecord(game.id, n, { scores, records, extras, done: false });
    paintPills(i + 1 < items.length ? i + 1 : -1);
    renderResult(result, game, res, ctx, i + 1 >= items.length, () => playRound(i + 1));
  }
  playRound(scores.length);
}

function renderResult(el, game, res, ctx, last, next) {
  const scoreEl = h('span', { class: 'score-num', text: '0' });
  const nextBtn = button(last ? 'See your results' : 'Next', { kind: 'primary', icon: 'arrow-right', onclick: next });
  el.replaceChildren(
    h('div', { class: 'result-card' + (game.binary ? (res.score >= 50 ? ' right' : ' wrong') : '') },
      h('div', { class: 'result-score' },
        game.binary
          ? h('span', { class: 'score-word', text: res.score >= 50 ? 'Right' : 'Wrong' })
          : h('span', null, scoreEl, h('span', { class: 'score-of', text: '/100' })),
        res.verdict ? h('span', { class: 'verdict', text: res.verdict }) : null),
      h('div', { class: 'result-body' },
        res.detail ? h('p', { class: 'detail', text: res.detail }) : null,
        ctx.rival && Number.isFinite(ctx.rival.score)
          ? h('p', { class: 'rival-line' }, h('span', { class: 'rival-name', text: ctx.rival.name }),
            game.binary ? (ctx.rival.score >= 50 ? ' got this one right' : ' got this one wrong') : ` scored ${ctx.rival.score}`)
          : null,
        res.note ? h('p', { class: 'note', text: res.note }) : null,
        res.link ? h('a', { class: 'source', href: res.link.href, target: '_blank', rel: 'noopener' }, h('span', { text: res.link.label }), icon('external', 14)) : null),
      h('div', { class: 'result-actions' }, nextBtn)));
  if (!game.binary) countUp(scoreEl, res.score);
  requestAnimationFrame(() => {
    if (!reducedMotion()) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    nextBtn.focus({ preventScroll: true });
  });
}

// ---------- summary ----------

function showSummary(game, { mode, seed, day, items, scores, records, rival, extras }) {
  document.title = game.title + ' results · Hindsight';
  const n = today();
  const total = totalOf(game, scores);
  const max = scores.length * 100;
  const stats = gameStats(game);
  const label = mode === 'daily' ? `No. ${day}` : mode === 'practice' ? 'Practice' : 'Challenge';

  const rows = items.map((item, i) => h('li', { class: 'sum-row' },
    h('div', { class: 'sum-visual' }, game.summaryVisual ? game.summaryVisual(item, records[i]) : null),
    h('div', { class: 'sum-copy' },
      h('span', { class: 'sum-label', text: game.label(item) }),
      records[i] && records[i].line ? h('span', { class: 'sum-detail', text: records[i].line }) : null),
    rival ? h('span', { class: 'sum-rival', text: game.binary ? (rival.scores[i] >= 50 ? 'Right' : 'Wrong') : String(rival.scores[i]) }) : null,
    h('span', { class: 'sum-score', text: game.binary ? (scores[i] >= 50 ? 'Right' : 'Wrong') : String(scores[i]) })));

  const totalEl = h('span', { class: 'total-num', text: '0' });
  const nameInput = h('input', {
    id: 'challenge-name', class: 'text-input', type: 'text', maxlength: String(NAME_MAX),
    autocomplete: 'nickname', placeholder: 'Your name', value: store.name || '',
  });

  const shareLine = game.binary
    ? scores.map((v) => (v >= 50 ? '■' : '□')).join('')
    : scores.join(' · ');
  const shareBody = `Hindsight · ${game.title} ${mode === 'daily' ? 'No. ' + day : ''}\n${formatTotal(game, scores)}\n${shareLine}`.replace(/ \n/, '\n');

  async function doShare() {
    const r = await shareText(shareBody, SITE + '#/' + game.id);
    if (r === 'copied') toast('Result copied');
    else if (r === 'failed') toast('Couldn’t copy. Your browser blocked the clipboard');
  }

  async function doChallenge() {
    const name = cleanName(nameInput.value);
    store.name = name;
    save(store);
    const payload = { v: 1, g: game.id, s: seed, n: name, sc: scores };
    if (game.challengeExtra) {
      const x = game.challengeExtra(items, extras);
      if (x) payload.x = x;
    }
    const url = SITE + '#/' + game.id + '?c=' + encodePayload(payload);
    const text = `${name || 'I'} scored ${formatTotal(game, scores)} on ${game.title}. Can you beat it?`;
    const touch = matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.share) {
      try { await navigator.share({ text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    toast((await copyText(text + '\n' + url)) ? 'Challenge link copied' : 'Couldn’t copy the link');
  }

  const nextGame = GAMES.find((g) => g.id !== game.id && !(dayRecord(g.id, n) || {}).done);
  const yourTotal = game.binary ? scores.filter((v) => v >= 50).length : total;
  const rivalTotal = rival ? (game.binary ? rival.scores.filter((v) => v >= 50).length : rival.scores.reduce((a, b) => a + b, 0)) : 0;

  const page = h('main', { class: 'page game summary' },
    header(label),
    h('div', { class: 'game-head' },
      h('a', { class: 'back', href: '#/' }, icon('arrow-left', 16), h('span', { text: 'All games' })),
      h('h1', { text: game.title })),
    h('section', { class: 'total-block' },
      h('p', { class: 'total' },
        totalEl,
        h('span', { class: 'total-of', text: game.binary ? ` / ${scores.length} right` : ` / ${max}` })),
      rival ? h('p', { class: 'versus' },
        yourTotal > rivalTotal ? 'You beat ' : yourTotal < rivalTotal ? 'You lost to ' : 'You tied with ',
        h('span', { class: 'rival-name', text: rival.name }),
        `, who got ${game.binary ? rivalTotal + ' right' : rivalTotal}`) : null,
      mode === 'daily' && stats.played > 0
        ? h('p', { class: 'stats' },
          h('span', { text: `Played ${stats.played}` }),
          h('span', { text: `Average ${game.binary ? (stats.average / 100).toFixed(1) + ' right' : stats.average}` }),
          h('span', { text: `Streak ${stats.streak}` }))
        : null),
    h('ol', { class: 'sum-list' },
      rival ? h('li', { class: 'sum-row sum-headrow', 'aria-hidden': 'true' },
        h('span'), h('span'), h('span', { class: 'sum-rival', text: rival.name }), h('span', { class: 'sum-score', text: 'You' })) : null,
      rows),
    h('section', { class: 'share-block' },
      h('div', { class: 'share-actions' },
        button('Share result', { kind: 'primary', iconLeft: 'share', onclick: doShare }),
        h('div', { class: 'challenge' },
          h('label', { for: 'challenge-name', class: 'sr', text: 'Your name on the challenge link' }),
          nameInput,
          button('Challenge a friend', { iconLeft: 'link', onclick: doChallenge })))),
    h('nav', { class: 'after' },
      nextGame ? h('a', { class: 'next-game', href: '#/' + nextGame.id },
        h('span', { class: 'muted', text: 'Next game' }),
        h('span', { class: 'next-title', text: nextGame.title }),
        icon('arrow-right')) : h('p', { class: 'muted', text: 'That’s every game for today. New sets at midnight.' }),
      h('a', { class: 'practice-link', href: '#/' + game.id + '?practice=1', onclick: (e) => { if (parseRoute().params.get('practice') === '1') { e.preventDefault(); render(); } } },
        icon('shuffle', 16), h('span', { text: 'Practice with a new set' }))));
  app.replaceChildren(page);
  if (game.binary) countUp(totalEl, yourTotal, (v) => String(Math.round(v)), 500);
  else countUp(totalEl, total, (v) => String(Math.round(v)), 800);
}

render();
