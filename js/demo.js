// Fausses données réalistes pour le mode démo (toujours les mêmes grâce à une graine fixe).

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoMatches() {
  const r = rng(2027);
  const gauss = () => (r() + r() + r() + r() - 2) * 1.2;
  const poisson = (l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r1 = (v) => Math.round(v * 10) / 10;

  const out = [];
  const now = new Date();
  const days = [];
  // ~ 5 semaines de sessions, dont une aujourd'hui
  for (let d = 34; d >= 1; d--) if (r() < 0.38) days.push(d);
  days.push(0);

  days.forEach((daysAgo, di) => {
    const start = new Date(now);
    start.setDate(now.getDate() - daysAgo);
    if (daysAgo === 0) {
      start.setTime(now.getTime() - 3 * 25 * 60 * 1000 - 5 * 60 * 1000);
    } else start.setHours(18 + Math.floor(r() * 4), Math.floor(r() * 60), 0, 0);
    const count = daysAgo === 0 ? 3 : 2 + Math.floor(r() * 5);
    const progress = di / days.length; // le joueur progresse un peu
    let lastLoss = false;

    for (let i = 0; i < count; i++) {
      const date = new Date(start.getTime() + i * (22 + r() * 8) * 60 * 1000);
      if (date > now) break;
      const modeRoll = r();
      const mode = modeRoll < 0.6 ? 'rivals' : modeRoll < 0.85 ? 'champions' : 'autre';
      const poss = clamp(Math.round(50 + gauss() * 9), 28, 72);
      const fatigue = i >= 3 ? 0.55 : 0;
      const tilt = lastLoss ? 0.3 : 0;
      const champ = mode === 'champions' ? -0.25 : 0;
      const form = 0.15 + 0.35 * progress + (poss - 50) * 0.028 - fatigue - tilt + champ + gauss() * 0.25;

      const xg = clamp(2.15 + form * 1.7 + gauss() * 0.3, 0.2, 5);
      const oxg = clamp(1.3 - form * 1.4 + gauss() * 0.3, 0.2, 5);
      const goals = poisson(xg * 0.85);
      const ogoals = poisson(oxg);
      const shots = clamp(Math.round(xg * 6 + 3 + gauss() * 2), 2, 30);
      const oshots = clamp(Math.round(oxg * 6 + 3 + gauss() * 2), 1, 30);
      const passes = Math.round(poss * 2.4 + gauss() * 15);
      const opasses = Math.round((100 - poss) * 2.4 + gauss() * 15);
      const lost = goals < ogoals;

      out.push({
        id: `demo${out.length}`,
        date: date.toISOString(),
        mode,
        side: r() < 0.5 ? 'home' : 'away',
        me: {
          goals, possession: poss, shots,
          shotsOnTarget: clamp(Math.round(shots * (0.36 + gauss() * 0.06)), 0, shots),
          xg: r1(xg), passes,
          passAccuracy: clamp(Math.round(80 + form * 6 + gauss() * 2.5), 55, 97),
          tackles: clamp(Math.round(13 + form * 3 + gauss() * 3), 2, 35),
          fouls: clamp(Math.round(2 + (lost ? 1.8 : 0) + gauss()), 0, 12),
        },
        opp: {
          goals: ogoals, possession: 100 - poss, shots: oshots,
          shotsOnTarget: clamp(Math.round(oshots * (0.45 + gauss() * 0.06)), 0, oshots),
          xg: r1(oxg), passes: opasses,
          passAccuracy: clamp(Math.round(80 - form * 5 + gauss() * 2.5), 55, 97),
          tackles: clamp(Math.round(13 - form * 3 + gauss() * 3), 2, 35),
          fouls: clamp(Math.round(2 + gauss()), 0, 12),
        },
      });
      lastLoss = lost;
    }
  });
  return out;
}
