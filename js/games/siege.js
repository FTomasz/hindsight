// Siege: solve sums to send fighters up two lanes. Harder sums make stronger
// fighters. Everything random comes from the day's seed, so the bot and the
// sums are the same for everyone on a given day.
import { h, s, icon, button } from '../ui.js';
import { makeProblem, siegeScore, TIERS } from '../siege-core.js';

const LENGTH_S = 90;
const TOWER_HP = 1000;
const TRAVEL_S = 8;

export default {
  id: 'siege',
  title: 'Siege',
  blurb: 'Solve sums to send fighters up two lanes. Harder sums, stronger fighters',
  rounds: 1,
  unitPlural: 'battle',
  section: 'numbers',
  build: (rng) => [{ seed: Math.floor(rng() * 2 ** 31) }],
  label: () => '90-second battle',

  play(area, item, ctx) {
    return new Promise((resolve) => {
      const rng = mulberry(item.seed);
      const intro = h('div', { class: 'siege-intro' },
        h('h2', { class: 'chart-title', text: 'Hold your towers for 90 seconds' }),
        h('ol', { class: 'rules' },
          h('li', { text: 'Pick a lane and a sum. Easy sums send a fighter of strength 2, medium 3, hard 5' }),
          h('li', { text: 'Solve it and press Enter. Your fighter marches up the lane' }),
          h('li', { text: 'When fighters meet, the stronger one wins and loses strength equal to the weaker one' }),
          h('li', { text: 'A fighter that reaches a tower hits it for 100 per point of strength' })),
        h('div', { class: 'controls' }, h('p', { class: 'hint', text: 'Everyone gets the same bot and the same sums today' }),
          button('Start', { kind: 'primary', icon: 'arrow-right', onclick: start })));
      area.append(intro);

      function start() {
        intro.remove();
        run(area, rng, ctx, resolve);
      }
    });
  },
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function run(area, rng, ctx, resolve) {
  // Two independent streams so the bot doesn't change with how fast you solve.
  const botRng = mulberry(Math.floor(rng() * 2 ** 31));
  const sumRng = mulberry(Math.floor(rng() * 2 ** 31));

  const state = {
    t: 0,
    units: [],
    effects: [],
    towers: { you: [TOWER_HP, TOWER_HP], bot: [TOWER_HP, TOWER_HP] },
    dealt: 0,
    taken: 0,
    solved: 0,
    wrong: 0,
    nextBot: 2.5,
    lane: 0,
    tier: 0,
    problem: null,
    lockUntil: 0,
    over: false,
  };

  const clock = h('span', { class: 'siege-clock', text: '1:30' });
  const canvas = h('canvas', { class: 'siege-board', role: 'img', 'aria-label': 'Battlefield with two lanes' });
  const status = h('p', { class: 'sr', 'aria-live': 'polite' });
  const laneBtns = [0, 1].map((l) => h('button', {
    type: 'button', class: 'seg', 'aria-pressed': String(l === 0),
    onclick: () => setLane(l),
  }, h('span', { text: l === 0 ? 'Left lane' : 'Right lane' }), h('kbd', { text: l === 0 ? 'L' : 'R' })));
  const tierBtns = TIERS.map((t, i) => h('button', {
    type: 'button', class: 'tier', 'aria-pressed': String(i === 0), onclick: () => setTier(i),
  }, h('span', { class: 'tier-name' }, t.name, h('kbd', { text: t.name[0] })), h('span', { class: 'tier-power', text: `Strength ${t.power}` })));
  const problemEl = h('p', { class: 'siege-problem', 'aria-live': 'polite' });
  const input = h('input', {
    class: 'siege-input', type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false',
    'aria-label': 'Answer', placeholder: 'Answer',
  });
  const send = button('Send', { kind: 'primary', icon: 'arrow-up', onclick: submit });
  const feedback = h('p', { class: 'siege-feedback', 'aria-live': 'assertive' });

  area.append(
    h('div', { class: 'siege-top' },
      h('span', { class: 'siege-label', text: 'Bot towers above, yours below' }),
      clock),
    canvas,
    h('div', { class: 'siege-panel' },
      h('div', { class: 'segs', role: 'group', 'aria-label': 'Lane' }, laneBtns),
      h('div', { class: 'tiers', role: 'group', 'aria-label': 'Difficulty' }, tierBtns),
      h('form', { class: 'siege-form', onsubmit: (e) => { e.preventDefault(); submit(); } },
        problemEl, h('div', { class: 'siege-answer' }, input, send)),
      feedback,
      h('p', { class: 'hint', text: 'Answers are numbers, so letters are shortcuts: E, M and H pick a sum, L and R pick a lane' })),
    status);

  const g = canvas.getContext('2d');
  let W = 0, H = 0, colors = {};

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = { bg: v('--card'), zone: v('--raised'), line: v('--line-strong'), text: v('--text'), text2: v('--text-2'), muted: v('--muted'), accent: v('--accent'), mono: v('--mono') || 'monospace', sans: v('--sans') || 'sans-serif' };
  }

  function size() {
    const w = Math.max(280, Math.min(560, area.clientWidth));
    const hgt = Math.round(Math.max(380, Math.min(560, w * 1.05)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = hgt + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w; H = hgt;
  }

  const laneX = (l) => (l === 0 ? W * 0.28 : W * 0.72);
  const topY = () => 64;
  const botY = () => H - 64;

  function setLane(l) {
    state.lane = l;
    laneBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === l)));
    status.textContent = l === 0 ? 'Left lane' : 'Right lane';
  }

  function setTier(i) {
    state.tier = i;
    tierBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    newProblem();
    input.focus({ preventScroll: true });
  }

  function newProblem() {
    state.problem = makeProblem(state.tier, sumRng);
    problemEl.textContent = state.problem.text + ' =';
    input.value = '';
  }

  function submit() {
    if (state.over || !state.problem) return;
    if (state.t < state.lockUntil) return;
    const raw = input.value.trim().replace(/,/g, '');
    if (!raw) return;
    const val = Number(raw);
    const p = state.problem;
    if (Number.isFinite(val) && val === p.answer) {
      state.solved++;
      spawn('you', state.lane, TIERS[state.tier].power);
      feedback.textContent = `Sent a strength ${TIERS[state.tier].power} fighter up the ${state.lane === 0 ? 'left' : 'right'} lane`;
      feedback.className = 'siege-feedback ok';
    } else {
      state.wrong++;
      state.lockUntil = state.t + 1.5;
      feedback.textContent = `Not quite: ${p.text} = ${p.answer}`;
      feedback.className = 'siege-feedback bad';
    }
    newProblem();
  }

  input.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const tier = { e: 0, m: 1, h: 2 }[k];
    if (tier !== undefined) { e.preventDefault(); setTier(tier); return; }
    if (k === 'l' || k === 'r') { e.preventDefault(); setLane(k === 'l' ? 0 : 1); return; }
    if (input.value === '' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      setLane(e.key === 'ArrowLeft' ? 0 : 1);
    }
  });

  let uid = 0;
  function spawn(side, lane, power) {
    state.units.push({ id: uid++, side, lane, power, y: side === 'you' ? botY() - 24 : topY() + 24 });
  }

  function botMove() {
    // Stronger fighters later in the battle; leans toward your weaker tower.
    const progress = state.t / LENGTH_S;
    const r = botRng();
    const power = progress < 0.25 ? (r < 0.5 ? 2 : 3) : progress < 0.65 ? (r < 0.3 ? 2 : r < 0.75 ? 3 : 4) : (r < 0.3 ? 3 : r < 0.75 ? 4 : 5);
    const weaker = state.towers.you[0] <= state.towers.you[1] ? 0 : 1;
    const lane = botRng() < 0.6 ? weaker : (botRng() < 0.5 ? 0 : 1);
    spawn('bot', lane, power);
    // About 0.65 strength a second early on, 1 mid-battle, 1.5 at the end.
    state.nextBot = state.t + (progress < 0.25 ? 3.4 : progress < 0.65 ? 2.7 : 2.4) + botRng() * 0.8;
  }

  function step(dt) {
    state.t += dt;
    if (state.t >= state.nextBot) botMove();
    const speed = (botY() - topY()) / TRAVEL_S;
    for (const u of state.units) u.y += (u.side === 'you' ? -1 : 1) * speed * dt;
    // Fights.
    for (const a of state.units) {
      if (a.dead || a.side !== 'you') continue;
      for (const b of state.units) {
        if (b.dead || b.side !== 'bot' || b.lane !== a.lane) continue;
        if (Math.abs(a.y - b.y) > 20) continue;
        const ap = a.power;
        const bp = b.power;
        a.power -= bp;
        b.power -= ap;
        if (a.power <= 0) a.dead = true;
        if (b.power <= 0) b.dead = true;
        state.effects.push({ x: laneX(a.lane), y: (a.y + b.y) / 2, t: state.t, kind: 'clash' });
        if (a.dead) break;
      }
    }
    // Towers.
    for (const u of state.units) {
      if (u.dead) continue;
      const arrived = u.side === 'you' ? u.y <= topY() + 18 : u.y >= botY() - 18;
      if (!arrived) continue;
      u.dead = true;
      const towers = u.side === 'you' ? state.towers.bot : state.towers.you;
      // A fighter whose tower is already down hits the other one.
      const target = towers[u.lane] > 0 ? u.lane : 1 - u.lane;
      const dmg = Math.min(towers[target], u.power * 100);
      towers[target] -= dmg;
      if (u.side === 'you') state.dealt += dmg; else state.taken += dmg;
      if (dmg) state.effects.push({ x: laneX(target), y: u.side === 'you' ? topY() : botY(), t: state.t, kind: 'hit', text: `−${dmg}` });
    }
    state.units = state.units.filter((u) => !u.dead);
    state.effects = state.effects.filter((e) => state.t - e.t < 0.8);
    const youDown = state.towers.you.every((v) => v <= 0);
    const botDown = state.towers.bot.every((v) => v <= 0);
    if (state.t >= LENGTH_S || youDown || botDown) end();
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    g.fillStyle = colors.bg;
    g.fillRect(0, 0, W, H);
    // Center line.
    g.strokeStyle = colors.line;
    g.lineWidth = 1;
    g.setLineDash([2, 6]);
    g.beginPath(); g.moveTo(16, H / 2 + 0.5); g.lineTo(W - 16, H / 2 + 0.5); g.stroke();
    // Lanes.
    g.setLineDash([4, 6]);
    for (const l of [0, 1]) {
      g.beginPath(); g.moveTo(laneX(l) + 0.5, topY() + 24); g.lineTo(laneX(l) + 0.5, botY() - 24); g.stroke();
    }
    g.setLineDash([]);
    if (!state.over) {
      g.fillStyle = colors.accent;
      g.globalAlpha = 0.12;
      g.fillRect(laneX(state.lane) - 20, H / 2 + 8, 40, botY() - 40 - H / 2);
      g.globalAlpha = 1;
    }
    for (const l of [0, 1]) {
      tower(laneX(l), topY(), state.towers.bot[l], 'bot');
      tower(laneX(l), botY(), state.towers.you[l], 'you');
    }
    for (const u of state.units) unit(u);
    for (const e of state.effects) {
      const k = (state.t - e.t) / 0.8;
      g.globalAlpha = 1 - k;
      if (e.kind === 'clash') {
        g.strokeStyle = colors.text2;
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(e.x, e.y, 10 + k * 14, 0, Math.PI * 2); g.stroke();
      } else {
        g.fillStyle = colors.accent;
        g.font = `500 13px ${colors.mono}`;
        g.textAlign = 'center';
        g.fillText(e.text, e.x + 34, e.y - 6 - k * 12);
      }
      g.globalAlpha = 1;
    }
  }

  function tower(x, y, hp, side) {
    const down = hp <= 0;
    g.lineWidth = 2;
    g.strokeStyle = colors.text;
    g.fillStyle = down ? colors.zone : side === 'you' ? colors.bg : colors.text;
    roundRect(x - 22, y - 16, 44, 32, 6);
    g.fill(); g.stroke();
    if (side === 'you' && !down) {
      g.fillStyle = colors.accent;
      roundRect(x - 22, y - 16, 44, 6, 3);
      g.fill();
    }
    // HP bar.
    const frac = Math.max(0, hp) / TOWER_HP;
    g.fillStyle = colors.zone;
    g.fillRect(x - 22, side === 'bot' ? y + 22 : y - 28, 44, 4);
    g.fillStyle = side === 'you' ? colors.accent : colors.text;
    g.fillRect(x - 22, side === 'bot' ? y + 22 : y - 28, 44 * frac, 4);
    g.fillStyle = down ? colors.muted : side === 'bot' ? colors.bg : colors.text;
    g.font = `500 12px ${colors.mono}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(down ? 'down' : String(hp), x, y + 1);
    g.textBaseline = 'alphabetic';
  }

  function unit(u) {
    const x = laneX(u.lane);
    const r = 10 + u.power * 1.6;
    g.beginPath(); g.arc(x, u.y, r, 0, Math.PI * 2);
    if (u.side === 'you') { g.fillStyle = colors.accent; g.fill(); }
    else { g.fillStyle = colors.bg; g.fill(); g.lineWidth = 2; g.strokeStyle = colors.text; g.stroke(); }
    g.fillStyle = u.side === 'you' ? '#fff' : colors.text;
    g.font = `600 13px ${colors.mono}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(u.power), x, u.y + 1);
    g.textBaseline = 'alphabetic';
  }

  function roundRect(x, y, w, h2, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h2, r);
    g.arcTo(x + w, y + h2, x, y + h2, r);
    g.arcTo(x, y + h2, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  let raf = 0;
  let last = performance.now();
  let paused = false;
  function frame(now) {
    // Real elapsed time in fixed 20 ms steps, so slow or throttled devices
    // play at the same speed. Long gaps (a frozen tab) count for at most 0.5 s.
    let dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    while (!paused && !state.over && dt > 0) {
      const d = Math.min(0.02, dt);
      step(d);
      dt -= d;
    }
    draw();
    const left = Math.max(0, Math.ceil(LENGTH_S - state.t));
    clock.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    send.disabled = state.t < state.lockUntil;
  }
  const onVis = () => { paused = document.hidden; last = performance.now(); };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => { size(); draw(); });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => readColors();
  mq.addEventListener('change', onScheme);

  ctx.onCleanup(() => {
    clearInterval(raf);
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    mq.removeEventListener('change', onScheme);
  });

  function end() {
    if (state.over) return;
    state.over = true;
    clearInterval(raf);
    draw();
    area.querySelector('.siege-panel').remove();
    document.removeEventListener('visibilitychange', onVis);
    const { score, outcome } = siegeScore(state.towers, state.dealt, state.taken);
    const tries = state.solved + state.wrong;
    resolve({
      score,
      verdict: outcome,
      detail: `You did ${state.dealt} damage and took ${state.taken}. You solved ${state.solved} of ${tries} sum${tries === 1 ? '' : 's'}.`,
      record: { line: `${outcome}: ${state.dealt} dealt, ${state.taken} taken` },
    });
  }

  readColors();
  size();
  ro.observe(area);
  setLane(0);
  setTier(0);
  // A timer instead of requestAnimationFrame: it keeps the clock honest in
  // embedded or throttled views where animation frames stall.
  raf = setInterval(() => frame(performance.now()), 16);
}
