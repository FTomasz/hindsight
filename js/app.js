import { h, icon, button, toast, shareText, copyText, countUp, reducedMotion } from './ui.js';
import { dayNumber, dateForDay, mulberry32, hashString, cleanName, statsFor,
  encodePayload, decodePayload, NAME_MAX } from './core.js';
import { GAMES, SECTIONS } from './games/index.js';

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
const store = load();
store.games = store.games && typeof store.games === 'object' ? store.games : {};
store.best = store.best && typeof store.best === 'object' ? store.best : {};

function dayRecord(gameId, day) {
  const g = store.games[gameId];
  return (g && g.days && g.days[day]) || null;
}
function writeDayRecord(gameId, day, rec) {
  const g = (store.games[gameId] ||= { days: {} });
  g.days ||= {};
  g.days[day] = rec;
  save(store);
}

function today() { return dayNumber(new Date()); }

function longDate(n) {
  return dateForDay(n).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function shortDate(n) {
  return dateForDay(n).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function rightCount(scores) { return scores.filter((v) => v >= 50).length; }

function formatTotal(game, scores) {
  if (game.binary) return `${rightCount(scores)} / ${scores.length}`;
  return `${scores.reduce((a, b) => a + b, 0)} / ${scores.length * 100}`;
}

// Late plays of past editions count for averages but never for streaks.
function doneDays(game, { onTime }) {
  const days = (store.games[game.id] && store.games[game.id].days) || {};
  const flat = {};
  for (const [n, rec] of Object.entries(days)) {
    if (rec && rec.done && !(onTime && rec.late)) flat[n] = { done: true, total: rec.scores.reduce((a, b) => a + b, 0) };
  }
  return flat;
}

function gameStats(game) {
  const all = statsFor(doneDays(game, { onTime: false }), today());
  const streak = statsFor(doneDays(game, { onTime: true }), today()).streak;
  return { ...all, streak };
}

function overallStreak() {
  const flat = {};
  for (const g of GAMES) Object.assign(flat, doneDays(g, { onTime: true }));
  return statsFor(flat, today()).streak;
}

function msToMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next - now;
}
function countdownText() {
  const m = Math.max(1, Math.ceil(msToMidnight() / 60000));
  const hrs = Math.floor(m / 60);
  return hrs ? `Next edition in ${hrs} h ${m % 60} min` : `Next edition in ${m} min`;
}

// ---------- routing ----------

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { path, params: new URLSearchParams(query) };
}

function go(path) {
  if (location.hash === '#/' + path) render();
  else location.hash = '/' + path;
}

window.addEventListener('hashchange', render);

let cleanup = null;
function onLeave(fn) {
  const prev = cleanup;
  cleanup = () => { if (prev) prev(); fn(); };
}

function render() {
  if (cleanup) { cleanup(); cleanup = null; }
  const { path, params } = parseRoute();
  window.scrollTo(0, 0);
  const n = today();
  const dayParam = Number(params.get('day'));
  const day = Number.isInteger(dayParam) && dayParam >= 1 && dayParam < n ? dayParam : n;
  const game = GAMES.find((g) => g.id === path);
  if (!game) return renderHub(day);
  const c = params.get('c');
  if (c) {
    const payload = decodePayload(c);
    if (payload && payload.g === game.id) return startGame(game, { challenge: payload });
    toast('That challenge link doesn’t work. Here is today’s game instead');
    history.replaceState(null, '', '#/' + game.id);
  }
  if (params.get('endless') === '1' && game.binary) return startGame(game, { endless: true });
  if (params.get('practice') === '1') return startGame(game, { practice: true });
  return startGame(game, { day });
}

// ---------- header ----------

function header(sub) {
  return h('header', { class: 'site-head' },
    h('a', { class: 'wordmark', href: '#/' }, mark(), h('span', { text: 'Hindsight' })),
    sub ? h('span', { class: 'head-meta' }, sub) : null,
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'About Hindsight', onclick: openAbout }, icon('help')));
}

function mark() {
  const span = h('span', { class: 'mark', 'aria-hidden': 'true' });
  span.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 15 L6 11 L9 12.5 L11 9"/><path d="M11 9 L14 5 L18 3" stroke-dasharray="1.5 2.5"/></svg>';
  return span;
}

// ---------- hub ----------

function gameHref(g, day) {
  return '#/' + g.id + (day !== today() ? '?day=' + day : '');
}

function renderHub(day) {
  const n = today();
  const past = day !== n;
  document.title = past ? `No. ${day} · Hindsight` : 'Hindsight: daily games about numbers, history and words';
  const played = GAMES.filter((g) => (dayRecord(g.id, day) || {}).done);
  const streak = overallStreak();
  const featured = GAMES.find((g) => g.featured);
  const clock = h('span', { text: countdownText() });

  const page = h('main', { class: 'page hub' },
    header(`No. ${day}`),
    h('section', { class: 'hub-intro' },
      past
        ? h('h1', { text: `No. ${day}, ${longDate(day)}` })
        : h('h1', { text: 'Daily games about numbers, history and the words in 200 years of books' }),
      h('p', { class: 'hub-meta' },
        past ? h('a', { href: '#/', text: 'Back to today' }) : h('span', { text: longDate(n) }),
        h('span', { text: `${played.length} of ${GAMES.length} played` }),
        !past && streak > 0 ? h('span', { text: `${streak}-day streak` }) : null,
        past ? h('span', { text: 'Late plays don’t count toward streaks' }) : clock)),
    featuredTile(featured, day),
    played.length ? todayCard(day, played) : null,
    SECTIONS.map((sec) => h('section', { class: 'toc' },
      h('div', { class: 'toc-head' },
        h('h2', { text: sec.title }),
        h('p', { text: sec.note })),
      h('ol', { class: 'toc-list' },
        GAMES.filter((g) => g.section === sec.id && !g.featured).map((g) => h('li', null, tocRow(g, day)))))),
    pastEditions(day),
    footer());
  app.replaceChildren(page);
  if (!past) {
    const t = setInterval(() => {
      if (dayNumber(new Date()) !== n) { clearInterval(t); render(); return; }
      clock.textContent = countdownText();
    }, 30000);
    onLeave(() => clearInterval(t));
  }
}

function statusFor(game, day) {
  const rec = dayRecord(game.id, day);
  if (rec && rec.done) return { text: formatTotal(game, rec.scores), state: 'done' };
  if (rec && rec.scores && rec.scores.length) return { text: `${rec.scores.length} of ${game.rounds} done`, state: 'partial' };
  return { text: `${game.rounds} ${game.unitPlural || 'rounds'}`, state: 'new' };
}

function statusEl(st) {
  return h('span', { class: 'status ' + st.state }, st.state === 'done' ? icon('check', 16) : null, h('span', { text: st.text }));
}

function featuredTile(g, day) {
  return h('a', { class: 'featured', href: gameHref(g, day) },
    h('div', { class: 'featured-copy' },
      h('p', { class: 'eyebrow', text: g.sectionLabel || 'Words in books' }),
      h('h2', { text: g.title }),
      h('p', { text: g.blurb }),
      h('div', { class: 'featured-foot' },
        statusEl(statusFor(g, day)),
        h('span', { class: 'go' }, h('span', { text: (dayRecord(g.id, day) || {}).done ? 'See results' : 'Play' }), icon('arrow-right', 16)))),
    h('div', { class: 'featured-visual' }, g.tile ? g.tile({ large: true }) : null));
}

function tocRow(g, day) {
  return h('a', { class: 'toc-row', href: gameHref(g, day) },
    h('span', { class: 'toc-title', text: g.title }),
    h('span', { class: 'toc-leader', 'aria-hidden': 'true' }),
    statusEl(statusFor(g, day)),
    h('span', { class: 'toc-blurb', text: g.blurb }));
}

function todayCard(day, played) {
  const lines = played.map((g) => [g.title, formatTotal(g, dayRecord(g.id, day).scores)]);
  const text = `Hindsight No. ${day} · ${played.length} of ${GAMES.length} games\n` + lines.map(([t, s]) => `${t} ${s}`).join('\n');
  return h('section', { class: 'today-card' },
    h('div', { class: 'today-head' },
      h('h2', { text: day === today() ? 'Today so far' : `No. ${day} so far` }),
      button('Share', { kind: 'primary', iconLeft: 'share', onclick: async () => {
        const r = await shareText(text, SITE);
        if (r === 'copied') toast('Copied');
        else if (r === 'failed') toast('Couldn’t copy. Your browser blocked the clipboard');
      } })),
    h('ul', { class: 'today-lines' },
      lines.map(([t, s]) => h('li', null, h('span', { text: t }), h('span', { class: 'toc-leader', 'aria-hidden': 'true' }), h('span', { class: 'mono', text: s })))));
}

function pastEditions(day) {
  const n = today();
  if (n <= 1) return null;
  const days = [];
  for (let d = n - 1; d >= Math.max(1, n - 14); d--) days.push(d);
  return h('section', { class: 'toc past' },
    h('div', { class: 'toc-head' },
      h('h2', { text: 'Past editions' }),
      h('p', { text: 'Every day’s set stays playable. Late plays don’t count toward streaks' })),
    h('ol', { class: 'toc-list' }, days.map((d) => {
      const count = GAMES.filter((g) => (dayRecord(g.id, d) || {}).done).length;
      return h('li', null, h('a', { class: 'toc-row' + (d === day ? ' current' : ''), href: '#/?day=' + d },
        h('span', { class: 'toc-title', text: `No. ${d}` }),
        h('span', { class: 'toc-leader', 'aria-hidden': 'true' }),
        h('span', { class: 'status ' + (count === GAMES.length ? 'done' : count ? 'partial' : 'new') }, h('span', { text: `${count} of ${GAMES.length}` })),
        h('span', { class: 'toc-blurb', text: longDate(d) })));
    })));
}

function footer() {
  return h('footer', { class: 'site-foot' },
    h('p', null,
      'Word data from the ',
      h('a', { href: 'https://books.google.com/ngrams', rel: 'noopener', target: '_blank', text: 'Google Books Ngram Viewer' }),
      ' (English, 2022 corpus). Every estimate and date links its source. A new edition every day at midnight your time.'),
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
    h('p', { text: `${GAMES.length} short games. Every day at midnight your time there is a new edition, the same for everyone. Past editions stay playable, practice is unlimited, and the right-or-wrong games have an endless mode.` }),
    h('p', { text: 'The word games use the Google Books Ngram Viewer: how often a word or phrase appears in English books each year, as uses per million words (for two-word phrases, per million two-word sequences), averaged over 3 years. Phrases are case-sensitive, and a word counts every meaning it has, so “Pluto” includes the planet, the god and the dog.' }),
    h('p', { text: 'Estimates and dates come from encyclopedias and official sources, linked after each answer. Spot a mistake? Open an issue on GitHub and it gets fixed. Siege is an original math battle: no data, just quick sums.' }),
    h('p', { text: 'Your scores stay in this browser. Nothing is sent anywhere. Challenge links carry your name, scores and, for Draw the rest, your lines, inside the link itself.' }));
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.appendChild(dlg);
  dlg.showModal();
}

// ---------- game runner ----------

function startGame(game, { practice = false, challenge = null, endless = false, day: wanted = null }) {
  const n = today();
  let mode = 'daily';
  let seed = 'd' + n;
  let day = n;
  if (wanted && wanted < n) {
    mode = 'archive';
    day = wanted;
    seed = 'd' + day;
  }
  if (practice || endless) {
    mode = endless ? 'endless' : 'practice';
    seed = 'p' + Math.floor(Math.random() * 2 ** 31).toString(36);
  }
  if (challenge) {
    seed = challenge.s;
    const m = /^d(\d+)$/.exec(seed);
    const cday = m ? Number(m[1]) : 0;
    const rec = cday ? dayRecord(game.id, cday) : null;
    if (cday === n && !(rec && rec.done)) { mode = 'daily'; day = n; }
    else if (cday > 0 && cday < n && !(rec && rec.done)) { mode = 'archive'; day = cday; }
    else mode = 'challenge';
  }

  let items;
  try {
    items = game.build(mulberry32(hashString(game.id + ':' + seed)), { seed, day, count: endless ? 400 : game.rounds });
  } catch (e) {
    console.error(e);
    toast('Couldn’t load that set');
    return go('');
  }
  if (challenge && challenge.sc.length !== items.length) {
    toast('That challenge link doesn’t work');
    return go(game.id);
  }

  const rival = challenge ? { name: challenge.n || 'Your friend', scores: challenge.sc, extra: challenge.x || null } : null;
  const saving = mode === 'daily' || mode === 'archive';
  const late = mode === 'archive';

  const rec = saving ? dayRecord(game.id, day) : null;
  if (saving && rec && rec.done) {
    return showSummary(game, { mode, seed, day, items, scores: rec.scores, records: rec.records || [], rival, extras: rec.extras || [] });
  }
  const scores = rec && Array.isArray(rec.scores) ? rec.scores.slice(0, items.length) : [];
  const records = rec && Array.isArray(rec.records) ? rec.records.slice(0, scores.length) : [];
  const extras = rec && Array.isArray(rec.extras) ? rec.extras.slice(0, scores.length) : [];

  document.title = game.title + ' · Hindsight';
  const sub = mode === 'daily' || mode === 'archive' ? `No. ${day}` : mode === 'practice' ? 'Practice' : mode === 'endless' ? 'Endless' : 'Challenge';
  const pills = endless ? h('p', { class: 'streak-now', 'aria-live': 'polite' }) : h('ol', { class: 'pills', 'aria-label': 'Progress' });
  const stage = h('div', { class: 'stage' });
  const page = h('main', { class: 'page game game-' + game.id },
    header(sub),
    h('div', { class: 'game-head' },
      h('a', { class: 'back', href: day !== n ? '#/?day=' + day : '#/' }, icon('arrow-left', 16), h('span', { text: 'All games' })),
      h('h1', { text: game.title }),
      pills),
    late ? h('p', { class: 'rival-banner', text: `Past edition, No. ${day}. Your scores are saved but don’t count toward streaks.` }) : null,
    endless ? h('p', { class: 'rival-banner', text: `Keep going until your first wrong answer. Your best is ${store.best[game.id] || 0}.` }) : null,
    rival ? h('p', { class: 'rival-banner' },
      h('span', { class: 'rival-name', text: rival.name }),
      ` scored ${formatTotal(game, rival.scores)} on this set. Your scores appear next to theirs as you go.`) : null,
    stage);
  app.replaceChildren(page);

  function paintProgress(active) {
    if (endless) {
      pills.textContent = `Streak ${scores.length - (scores.length && scores[scores.length - 1] < 50 ? 1 : 0)}`;
      return;
    }
    pills.replaceChildren(...items.map((_, i) => h('li', {
      class: i < scores.length ? 'done' : i === active ? 'active' : '',
      'aria-current': i === active ? 'step' : null,
    }, h('span', { class: 'sr', text: `Round ${i + 1}${i < scores.length ? ', done' : ''}` }))));
  }

  let alive = true;
  onLeave(() => { alive = false; if (stage._cleanup) stage._cleanup(); });

  function finish() {
    if (saving) writeDayRecord(game.id, day, { scores, records, extras, done: true, late: late || undefined });
    if (endless) {
      const streak = rightCount(scores);
      const best = Math.max(store.best[game.id] || 0, streak);
      store.best[game.id] = best;
      save(store);
      return showEndless(game, { streak, best, items, scores, records });
    }
    return showSummary(game, { mode, seed, day, items, scores, records, rival, extras });
  }

  async function playRound(i) {
    if (!alive) return;
    const over = endless ? (scores.length && scores[scores.length - 1] < 50) || i >= items.length : i >= items.length;
    if (over) return finish();
    paintProgress(i);
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
    if (saving) writeDayRecord(game.id, day, { scores, records, extras, done: false, late: late || undefined });
    paintProgress(i + 1 < items.length ? i + 1 : -1);
    const last = endless ? res.score < 50 : i + 1 >= items.length;
    renderResult(result, game, res, ctx, last, endless, () => playRound(i + 1));
  }
  playRound(scores.length);
}

function renderResult(el, game, res, ctx, last, endless, next) {
  const scoreEl = h('span', { class: 'score-num', text: '0' });
  const label = last ? (endless ? 'See your streak' : 'See your results') : 'Next';
  const nextBtn = button(label, { kind: 'primary', icon: 'arrow-right', onclick: next });
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

// ---------- summaries ----------

function afterNav(game, mode, day) {
  const n = today();
  const nextGame = GAMES.find((g) => g.id !== game.id && !(dayRecord(g.id, day) || {}).done);
  const dayQ = day !== n ? '?day=' + day : '';
  return h('nav', { class: 'after' },
    nextGame && (mode === 'daily' || mode === 'archive')
      ? h('a', { class: 'next-game', href: '#/' + nextGame.id + dayQ },
        h('span', { class: 'muted', text: 'Next game' }),
        h('span', { class: 'next-title', text: nextGame.title }),
        icon('arrow-right'))
      : h('p', { class: 'muted', text: mode === 'daily' && !nextGame ? `That’s every game for today. ${countdownText()}` : '' }),
    h('div', { class: 'after-links' },
      game.binary ? h('a', { class: 'practice-link', href: '#/' + game.id + '?endless=1', onclick: sameRoute }, icon('arrow-right', 16), h('span', { text: 'Endless mode' })) : null,
      h('a', { class: 'practice-link', href: '#/' + game.id + '?practice=1', onclick: sameRoute }, icon('shuffle', 16), h('span', { text: 'Practice with a new set' }))));
}

function sameRoute(e) {
  if (location.hash === e.currentTarget.getAttribute('href')) { e.preventDefault(); render(); }
}

function showEndless(game, { streak, best, items, scores, records }) {
  document.title = game.title + ' endless · Hindsight';
  const num = h('span', { class: 'total-num', text: '0' });
  const isBest = streak > 0 && streak >= best;
  const lastWrong = scores.length && scores[scores.length - 1] < 50 ? scores.length - 1 : -1;
  const shareBody = `Hindsight · ${game.title}, endless\nStreak of ${streak}`;
  const page = h('main', { class: 'page game summary' },
    header('Endless'),
    h('div', { class: 'game-head' },
      h('a', { class: 'back', href: '#/' }, icon('arrow-left', 16), h('span', { text: 'All games' })),
      h('h1', { text: game.title })),
    h('section', { class: 'total-block' },
      h('p', { class: 'total' }, num, h('span', { class: 'total-of', text: streak === 1 ? ' in a row' : ' in a row' })),
      h('p', { class: 'stats' }, h('span', { text: isBest ? 'Your best yet' : `Your best is ${best}` }))),
    lastWrong >= 0 ? h('ol', { class: 'sum-list' }, h('li', { class: 'sum-row' },
      h('div', { class: 'sum-visual' }),
      h('div', { class: 'sum-copy' },
        h('span', { class: 'sum-label', text: game.label(items[lastWrong]) }),
        records[lastWrong] && records[lastWrong].line ? h('span', { class: 'sum-detail', text: records[lastWrong].line }) : null),
      h('span', { class: 'sum-score', text: 'Wrong' }))) : null,
    h('section', { class: 'share-block' },
      h('div', { class: 'share-actions' },
        button('Share', { kind: 'primary', iconLeft: 'share', onclick: async () => {
          const r = await shareText(shareBody, SITE + '#/' + game.id + '?endless=1');
          if (r === 'copied') toast('Copied');
        } }),
        button('Go again', { iconLeft: 'undo', onclick: () => render() }))),
    afterNav(game, 'endless', today()));
  app.replaceChildren(page);
  countUp(num, streak, (v) => String(Math.round(v)), 500);
}

function showSummary(game, { mode, seed, day, items, scores, records, rival, extras }) {
  document.title = game.title + ' results · Hindsight';
  const total = scores.reduce((a, b) => a + b, 0);
  const max = scores.length * 100;
  const stats = gameStats(game);
  const label = mode === 'daily' || mode === 'archive' ? `No. ${day}` : mode === 'practice' ? 'Practice' : 'Challenge';

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

  const shareLine = game.binary ? scores.map((v) => (v >= 50 ? '■' : '□')).join('') : scores.join(' · ');
  const head = `Hindsight · ${game.title}${mode === 'daily' || mode === 'archive' ? ' No. ' + day : ''}`;
  const shareBody = `${head}\n${formatTotal(game, scores)}\n${shareLine}`;

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

  const yourTotal = game.binary ? rightCount(scores) : total;
  const rivalTotal = rival ? (game.binary ? rightCount(rival.scores) : rival.scores.reduce((a, b) => a + b, 0)) : 0;

  const page = h('main', { class: 'page game summary' },
    header(label),
    h('div', { class: 'game-head' },
      h('a', { class: 'back', href: day !== today() ? '#/?day=' + day : '#/' }, icon('arrow-left', 16), h('span', { text: 'All games' })),
      h('h1', { text: game.title })),
    h('section', { class: 'total-block' },
      h('p', { class: 'total' },
        totalEl,
        h('span', { class: 'total-of', text: game.binary ? ` / ${scores.length} right` : ` / ${max}` })),
      rival ? h('p', { class: 'versus' },
        yourTotal > rivalTotal ? 'You beat ' : yourTotal < rivalTotal ? 'You lost to ' : 'You tied with ',
        h('span', { class: 'rival-name', text: rival.name }),
        `, who got ${game.binary ? rivalTotal + ' right' : rivalTotal}`) : null,
      (mode === 'daily' || mode === 'archive') && stats.played > 0
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
    afterNav(game, mode, day));
  app.replaceChildren(page);
  countUp(totalEl, yourTotal, (v) => String(Math.round(v)), game.binary ? 500 : 800);
}

render();
