// Pure logic for Siege, kept apart so it can be tested in Node.

export const TIERS = [
  { name: 'Easy', power: 2 },
  { name: 'Medium', power: 3 },
  { name: 'Hard', power: 5 },
];

const int = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

// Every problem has a whole-number answer above zero.
export function makeProblem(tier, rng) {
  if (tier === 0) {
    if (rng() < 0.5) {
      const a = int(rng, 12, 89);
      const b = int(rng, 3, 9);
      return { text: `${a} + ${b}`, answer: a + b };
    }
    const a = int(rng, 21, 99);
    const b = int(rng, 3, 19);
    return { text: `${a} − ${b}`, answer: a - b };
  }
  if (tier === 1) {
    const a = int(rng, 3, 12);
    const b = int(rng, 3, 12);
    if (rng() < 0.6) return { text: `${a} × ${b}`, answer: a * b };
    return { text: `${a * b} ÷ ${b}`, answer: a };
  }
  const kind = Math.floor(rng() * 4);
  if (kind === 0) {
    const a = int(rng, 2, 20);
    const b = int(rng, 2, 9);
    const c = int(rng, 2, 9);
    return { text: `${a} + ${b} × ${c}`, answer: a + b * c };
  }
  if (kind === 1) {
    const a = int(rng, 2, 12);
    const b = int(rng, 2, 12);
    const c = int(rng, 2, 6);
    return { text: `(${a} + ${b}) × ${c}`, answer: (a + b) * c };
  }
  if (kind === 2) {
    const [p, step] = [[10, 10], [20, 5], [25, 4], [50, 2], [75, 4]][Math.floor(rng() * 5)];
    const n = step * int(rng, 2, 20);
    return { text: `${p}% of ${n}`, answer: (p * n) / 100 };
  }
  const d = int(rng, 3, 8);
  const k = int(rng, 1, d - 1);
  const n = d * int(rng, 2, 12);
  return { text: `${k}/${d} of ${n}`, answer: (k * n) / d };
}

// 50 for an even trade, up to 100 for flattening both towers untouched.
export function siegeScore(towers, dealt, taken) {
  const youLeft = towers.you[0] + towers.you[1];
  const botLeft = towers.bot[0] + towers.bot[1];
  const score = Math.max(0, Math.min(100, Math.round(50 + (dealt - taken) / 40)));
  const outcome = botLeft <= 0 && youLeft > 0 ? 'You took both towers'
    : youLeft <= 0 && botLeft > 0 ? 'You lost both towers'
    : youLeft > botLeft ? 'You won on tower health'
    : youLeft < botLeft ? 'The bot won on tower health'
    : 'A draw';
  return { score, outcome };
}
