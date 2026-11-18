// Conseils du coach : règles simples tirées des chiffres, avec un minimum de matchs.
import { result, avg, sum, isNum, pct, sessions, sortByDate, shotAccuracy, summarize, modeLabel } from './stats.js';

const MIN_TOTAL = 5;   // matchs minimum avant le premier conseil
const MIN_GROUP = 3;   // matchs minimum dans chaque groupe comparé

const rate = (ms, r) => (ms.length ? ms.filter((m) => result(m) === r).length / ms.length : 0);
const fr = (v) => v.toFixed(1).replace('.', ',');
const basis = (n) => `Basé sur ${n} match${n > 1 ? 's' : ''}`;

export function coachTips(all) {
  const ms = sortByDate(all);
  const n = ms.length;
  if (n < MIN_TOTAL) {
    return [{
      kind: 'info', icon: '👀', title: 'Le coach t’observe',
      text: `Encore ${MIN_TOTAL - n} match${MIN_TOTAL - n > 1 ? 's' : ''} et je pourrai te donner mes premiers conseils.`,
      advice: 'Enregistre chaque match juste après la fin, c’est là que les chiffres sont à l’écran.',
    }];
  }
  const tips = [];
  const wins = ms.filter((m) => result(m) === 'W');
  const losses = ms.filter((m) => result(m) === 'L');

  // 1. Possession
  const withPoss = ms.filter((m) => isNum(m.me.possession));
  const low = withPoss.filter((m) => m.me.possession < 45);
  const high = withPoss.filter((m) => m.me.possession >= 45);
  if (low.length >= MIN_GROUP && high.length >= MIN_GROUP) {
    const lr = rate(low, 'L'), hr = rate(high, 'L');
    if (lr - hr >= 0.15) {
      tips.push({ kind: 'warn', icon: '⚽', score: lr - hr, title: 'Garde le ballon',
        text: `Tu perds ${pct(lr)} des matchs où tu as moins de 45 % de possession, contre ${pct(hr)} au-dessus.`,
        advice: 'Joue plus court, fais tourner derrière avant d’accélérer, et évite les longs ballons dans le vide.',
        n: withPoss.length });
    } else if (hr - lr >= 0.15) {
      tips.push({ kind: 'good', icon: '⚡', score: hr - lr, title: 'Tu es redoutable en contre',
        text: `Tu perds seulement ${pct(lr)} des matchs avec moins de 45 % de possession (${pct(hr)} au-dessus).`,
        advice: 'Laisse venir, puis frappe vite en profondeur : c’est ton style qui marche.', n: withPoss.length });
    }
  }

  // 2. Tirs cadrés
  const acc = shotAccuracy(ms);
  const avgShots = avg(ms, 'me', 'shots');
  if (acc !== null && avgShots !== null) {
    if (acc < 0.42 && avgShots >= 7) {
      tips.push({ kind: 'warn', icon: '🎯', score: 0.42 - acc + 0.1, title: 'Tu tires beaucoup mais tu cadres peu',
        text: `${fr(avgShots)} tirs par match, mais seulement ${pct(acc)} sont cadrés.`,
        advice: 'Évite les frappes de loin et sous pression : une passe de plus pour te retrouver face au but.', n });
    } else if (acc >= 0.55) {
      tips.push({ kind: 'good', icon: '🎯', score: acc - 0.55, title: 'Viseur bien réglé',
        text: `${pct(acc)} de tes tirs sont cadrés. Continue de choisir tes frappes.`, n });
    }
  }

  // 3. Finition : buts marqués vs xG
  const xgMs = ms.filter((m) => isNum(m.me.xg));
  const xgSum = sum(xgMs, 'me', 'xg');
  if (xgMs.length >= MIN_TOTAL && xgSum >= 4) {
    const ratio = sum(xgMs, 'me', 'goals') / xgSum;
    if (ratio < 0.85) {
      tips.push({ kind: 'warn', icon: '🥅', score: 0.85 - ratio, title: 'Tu gâches des occasions',
        text: `Tu marques ${Math.round(ratio * 100)} buts pour 100 buts « attendus » (xG). Tes occasions valent plus que ton score.`,
        advice: 'Dans la surface, privilégie la frappe placée (finesse) plutôt que la puissance.', n: xgMs.length });
    } else if (ratio > 1.2) {
      tips.push({ kind: 'good', icon: '🔥', score: ratio - 1.2, title: 'Tueur devant le but',
        text: `Tu marques ${Math.round(ratio * 100)} buts pour 100 buts attendus : tu convertis mieux que la moyenne.`, n: xgMs.length });
    }
  }

  // 4. Défense : occasions concédées
  const oppXg = avg(ms, 'opp', 'xg');
  const ga = avg(ms, 'opp', 'goals');
  if (oppXg !== null && ga !== null) {
    if (oppXg >= 1.8) {
      tips.push({ kind: 'warn', icon: '🛡️', score: (oppXg - 1.8) / 2 + 0.1, title: 'Tu laisses trop d’occasions',
        text: `L’adversaire se crée en moyenne ${fr(oppXg)} xG par match contre toi.`,
        advice: 'Ne sors pas tes défenseurs centraux de leur zone : utilise le pressing d’équipe (R1) plutôt que de courir avec un défenseur.', n });
    } else if (ga - oppXg >= 0.4) {
      tips.push({ kind: 'warn', icon: '🧤', score: ga - oppXg, title: 'Tu encaisses plus que prévu',
        text: `Tu prends ${fr(ga)} buts par match pour seulement ${fr(oppXg)} xG adverses.`,
        advice: 'Les occasions concédées sont rares mais nettes : vérifie ton gardien et ne laisse pas de tir à bout portant.', n });
    }
  }

  // 5. Précision des passes : victoires vs défaites
  const pw = avg(wins, 'me', 'passAccuracy'), pl = avg(losses, 'me', 'passAccuracy');
  if (wins.length >= MIN_GROUP && losses.length >= MIN_GROUP && pw !== null && pl !== null && pw - pl >= 4) {
    tips.push({ kind: 'warn', icon: '🎮', score: (pw - pl) / 20, title: 'Tes passes font la différence',
      text: `${Math.round(pw)} % de passes réussies quand tu gagnes, ${Math.round(pl)} % quand tu perds.`,
      advice: 'Quand ça ne passe pas, ralentis : passes simples au sol, moins de passes en profondeur forcées.', n: wins.length + losses.length });
  }

  // 6. Fautes
  const fw = avg(wins, 'me', 'fouls'), fl = avg(losses, 'me', 'fouls');
  if (wins.length >= MIN_GROUP && losses.length >= MIN_GROUP && fw !== null && fl !== null && fl - fw >= 1.2) {
    tips.push({ kind: 'warn', icon: '🟨', score: (fl - fw) / 5, title: 'Plus de fautes quand ça tourne mal',
      text: `${fr(fl)} fautes par match dans tes défaites, contre ${fr(fw)} dans tes victoires.`,
      advice: 'Signe de frustration : défends en jockey (L2) et laisse l’IA couper les lignes.', n: wins.length + losses.length });
  }

  // 7. Fatigue : 4e match et plus d'une session
  const early = [], late = [];
  for (const s of sessions(ms)) s.forEach((m, i) => (i < 3 ? early : late).push(m));
  if (early.length >= MIN_GROUP && late.length >= MIN_GROUP) {
    const we = rate(early, 'W'), wl = rate(late, 'W');
    if (we - wl >= 0.15) {
      tips.push({ kind: 'warn', icon: '⏸️', score: we - wl + 0.05, title: 'Fais une pause après 3 matchs',
        text: `Tu gagnes ${pct(we)} de tes 3 premiers matchs d’une session, mais seulement ${pct(wl)} ensuite.`,
        advice: 'Après 3 matchs d’affilée, lève-toi 10 minutes : boire, marcher, puis reprendre.', n: early.length + late.length });
    }
  }

  // 8. Tilt : match après une défaite
  const afterLoss = [], afterWin = [];
  for (const s of sessions(ms)) {
    for (let i = 1; i < s.length; i++) {
      const prev = result(s[i - 1]);
      if (prev === 'L') afterLoss.push(s[i]); else if (prev === 'W') afterWin.push(s[i]);
    }
  }
  if (afterLoss.length >= MIN_GROUP && afterWin.length >= MIN_GROUP) {
    const a = rate(afterLoss, 'W'), b = rate(afterWin, 'W');
    if (b - a >= 0.15) {
      tips.push({ kind: 'warn', icon: '😤', score: b - a, title: 'Attention au tilt',
        text: `Juste après une défaite, tu ne gagnes que ${pct(a)} du match suivant (${pct(b)} après une victoire).`,
        advice: 'Après une défaite frustrante, attends quelques minutes avant de relancer.', n: afterLoss.length + afterWin.length });
    }
  }

  // 9. Forme : 10 derniers vs 10 précédents
  if (n >= 14) {
    const last = ms.slice(-10), prev = ms.slice(-20, -10);
    const a = rate(last, 'W'), b = rate(prev, 'W');
    if (a - b >= 0.15) {
      tips.push({ kind: 'good', icon: '📈', score: a - b, title: 'Tu progresses',
        text: `${pct(a)} de victoires sur tes 10 derniers matchs, contre ${pct(b)} sur les ${prev.length} d’avant.`, n: last.length + prev.length });
    } else if (b - a >= 0.15) {
      tips.push({ kind: 'warn', icon: '📉', score: b - a, title: 'Petit coup de moins bien',
        text: `${pct(a)} de victoires sur tes 10 derniers matchs, contre ${pct(b)} sur les ${prev.length} d’avant.`,
        advice: 'Reviens à ce qui marchait : même équipe, même tactique, et des sessions plus courtes.', n: last.length + prev.length });
    }
  }

  // 10. Comparaison des modes
  const byMode = ['rivals', 'champions'].map((k) => ({ k, ms: ms.filter((m) => m.mode === k) }))
    .filter((x) => x.ms.length >= MIN_GROUP);
  if (byMode.length === 2) {
    const [x, y] = byMode.map((b) => ({ ...b, w: rate(b.ms, 'W') }));
    const best = x.w >= y.w ? x : y, worst = x.w >= y.w ? y : x;
    if (best.w - worst.w >= 0.15) {
      tips.push({ kind: 'info', icon: '🏆', score: (best.w - worst.w) / 2, title: `Plus à l’aise en ${modeLabel(best.k)}`,
        text: `${pct(best.w)} de victoires en ${modeLabel(best.k)}, ${pct(worst.w)} en ${modeLabel(worst.k)}.`,
        n: x.ms.length + y.ms.length });
    }
  }

  // 11. Tacles
  const tw = avg(wins, 'me', 'tackles'), tl = avg(losses, 'me', 'tackles');
  if (wins.length >= MIN_GROUP && losses.length >= MIN_GROUP && tw !== null && tl !== null && tw - tl >= 2) {
    tips.push({ kind: 'info', icon: '🦵', score: (tw - tl) / 10, title: 'L’agressivité paie',
      text: `${fr(tw)} tacles par match quand tu gagnes, ${fr(tl)} quand tu perds.`,
      advice: 'Va chercher le ballon plus tôt : un tacle bien placé vaut mieux qu’attendre l’erreur adverse.', n: wins.length + losses.length });
  }

  if (!tips.length) {
    const s = summarize(ms);
    tips.push({ kind: 'info', icon: '✅', title: 'Rien d’alarmant',
      text: `Sur ${n} matchs (${pct(s.winRate)} de victoires), aucun point faible net ne ressort pour l’instant.`, n });
  }

  const order = { warn: 0, good: 1, info: 2 };
  return tips
    .sort((a, b) => order[a.kind] - order[b.kind] || (b.score || 0) - (a.score || 0))
    .map((t) => ({ ...t, basis: t.n ? basis(t.n) : '' }));
}

// Bilan de la session du jour.
export function sessionReport(todayMs, allMs) {
  const ms = sortByDate(todayMs);
  const s = summarize(ms);
  const lines = [];
  if (!ms.length) return { s, lines, verdict: 'Pas encore de match aujourd’hui. Lance-toi !' };

  // Série en cours
  let streak = 0; const lastRes = result(ms[ms.length - 1]);
  for (let i = ms.length - 1; i >= 0 && result(ms[i]) === lastRes; i--) streak++;

  let verdict;
  if (s.n >= 2 && lastRes === 'L' && streak >= 2) verdict = `${streak} défaites d’affilée : c’est le moment de faire une pause.`;
  else if (lastRes === 'W' && streak >= 3) verdict = `${streak} victoires de suite, tu es en feu ! 🔥`;
  else if (s.n >= 4 && s.winRate >= 0.6) verdict = 'Grosse session, continue comme ça.';
  else if (s.n >= 4 && s.winRate < 0.35) verdict = 'Session difficile. Une pause et on repart.';
  else if (s.n >= 3) verdict = 'Session équilibrée.';
  else verdict = 'La session commence, reste concentré.';

  // Comparaison aux moyennes globales
  const others = allMs.filter((m) => !todayMs.includes(m));
  if (others.length >= 3) {
    const cmp = [
      { label: 'Possession', today: avg(ms, 'me', 'possession'), ref: avg(others, 'me', 'possession'), unit: ' %', d: 0 },
      { label: 'Tirs cadrés', today: shotAccuracy(ms), ref: shotAccuracy(others), unit: ' %', d: 0, mult: 100 },
      { label: 'Précision passes', today: avg(ms, 'me', 'passAccuracy'), ref: avg(others, 'me', 'passAccuracy'), unit: ' %', d: 0 },
      { label: 'xG créés', today: avg(ms, 'me', 'xg'), ref: avg(others, 'me', 'xg'), unit: '', d: 1 },
      { label: 'xG concédés', today: avg(ms, 'opp', 'xg'), ref: avg(others, 'opp', 'xg'), unit: '', d: 1, lowerBetter: true },
    ];
    for (const c of cmp) {
      if (c.today === null || c.ref === null) continue;
      const k = c.mult || 1;
      const t = c.today * k, r = c.ref * k;
      const diff = t - r;
      const better = c.lowerBetter ? diff < 0 : diff > 0;
      const small = Math.abs(diff) < (c.d ? 0.15 : 2);
      lines.push({ label: c.label, value: t.toFixed(c.d) + c.unit, ref: r.toFixed(c.d) + c.unit,
        trend: small ? 'eq' : better ? 'up' : 'down' });
    }
  }
  return { s, lines, verdict };
}
