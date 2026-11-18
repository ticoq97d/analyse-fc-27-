// Définitions des statistiques et calculs (bilans, semaines, sessions).

export const STATS = [
  { key: 'goals', label: 'Buts', step: 1, max: 30 },
  { key: 'possession', label: 'Possession', unit: '%', step: 1, max: 100 },
  { key: 'shots', label: 'Tirs', step: 1, max: 80 },
  { key: 'shotsOnTarget', label: 'Tirs cadrés', step: 1, max: 80 },
  { key: 'xg', label: 'xG', step: 0.1, max: 20, decimals: 1 },
  { key: 'passes', label: 'Passes', step: 1, max: 999 },
  { key: 'passAccuracy', label: 'Précision passes', unit: '%', step: 1, max: 100 },
  { key: 'tackles', label: 'Tacles', step: 1, max: 99 },
  { key: 'fouls', label: 'Fautes', step: 1, max: 50 },
];
export const STAT_KEYS = STATS.map((s) => s.key);

export const MODES = [
  { key: 'rivals', label: 'Rivals' },
  { key: 'champions', label: 'Champions' },
  { key: 'autre', label: 'Autre' },
];
export const modeLabel = (k) => (MODES.find((m) => m.key === k) || MODES[2]).label;

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function result(m) {
  const a = m.me.goals, b = m.opp.goals;
  if (!isNum(a) || !isNum(b)) return null;
  return a > b ? 'W' : a < b ? 'L' : 'D';
}

export const sortByDate = (ms) => [...ms].sort((a, b) => new Date(a.date) - new Date(b.date));

export function avg(ms, side, key) {
  const vals = ms.map((m) => m[side][key]).filter(isNum);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}
export function sum(ms, side, key) {
  return ms.map((m) => m[side][key]).filter(isNum).reduce((s, v) => s + v, 0);
}

export function summarize(ms) {
  const r = { n: ms.length, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  for (const m of ms) {
    const res = result(m);
    if (res === 'W') r.w++; else if (res === 'D') r.d++; else if (res === 'L') r.l++;
    if (isNum(m.me.goals)) r.gf += m.me.goals;
    if (isNum(m.opp.goals)) r.ga += m.opp.goals;
  }
  r.winRate = r.n ? r.w / r.n : 0;
  return r;
}

// Taux de tirs cadrés calculé uniquement sur les matchs où les deux chiffres sont connus.
export function shotAccuracy(ms, side = 'me') {
  let s = 0, on = 0;
  for (const m of ms) {
    if (isNum(m[side].shots) && isNum(m[side].shotsOnTarget) && m[side].shots > 0) {
      s += m[side].shots; on += Math.min(m[side].shotsOnTarget, m[side].shots);
    }
  }
  return s ? on / s : null;
}

// Lundi de la semaine (heure locale), format AAAA-MM-JJ
export function weekKey(dateStr) {
  const d = new Date(dateStr);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return localDay(d);
}
export function localDay(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const dayKey = (dateStr) => localDay(new Date(dateStr));

export function groupBy(ms, fn) {
  const map = new Map();
  for (const m of ms) {
    const k = fn(m);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(m);
  }
  return map;
}

// Une session = matchs enchaînés avec moins de 90 min d'écart.
export function sessions(ms) {
  const sorted = sortByDate(ms);
  const out = [];
  let cur = [];
  for (const m of sorted) {
    const prev = cur[cur.length - 1];
    if (prev && new Date(m.date) - new Date(prev.date) > 90 * 60 * 1000) {
      out.push(cur); cur = [];
    }
    cur.push(m);
  }
  if (cur.length) out.push(cur);
  return out;
}

export function rolling(values, window, minCount = 1) {
  return values.map((_, i) => {
    if (i + 1 < minCount) return null;
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter(isNum);
    return slice.length ? slice.reduce((s, v) => s + v, 0) / slice.length : null;
  });
}

export const pct = (x) => `${Math.round(x * 100)} %`;

export function fmtDate(dateStr, opts = { day: 'numeric', month: 'short' }) {
  return new Date(dateStr).toLocaleDateString('fr-FR', opts);
}
export function fmtTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
