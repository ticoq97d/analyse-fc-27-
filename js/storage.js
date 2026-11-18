// Stockage local sur le téléphone (aucun serveur). Export / import JSON.
import { STAT_KEYS, MODES, isNum } from './stats.js';

const KEY = 'coachfc27.v1';

const defaults = () => ({ matches: [], settings: { side: 'home', mode: 'rivals', demo: false } });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const data = JSON.parse(raw);
    return {
      matches: Array.isArray(data.matches) ? data.matches.map(sanitizeMatch).filter(Boolean) : [],
      settings: { ...defaults().settings, ...(data.settings || {}) },
    };
  } catch {
    return defaults();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ matches: state.matches, settings: state.settings }));
    return true;
  } catch {
    return false;
  }
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function cleanNum(v, max = 999) {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  if (!isNum(n) || n < 0 || n > max) return null;
  return Math.round(n * 10) / 10;
}

// Reconstruit un match propre à partir de données inconnues (import).
export function sanitizeMatch(m) {
  if (!m || typeof m !== 'object' || !m.me || !m.opp) return null;
  const d = new Date(m.date);
  if (isNaN(d)) return null;
  const side = (o) => Object.fromEntries(STAT_KEYS.map((k) => [k, cleanNum(o[k])]));
  const out = {
    id: String(m.id || newId()).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || newId(),
    date: d.toISOString(),
    mode: MODES.some((x) => x.key === m.mode) ? m.mode : 'autre',
    side: m.side === 'away' ? 'away' : 'home',
    me: side(m.me),
    opp: side(m.opp),
  };
  if (!isNum(out.me.goals) || !isNum(out.opp.goals)) return null;
  return out;
}

export function exportPayload(matches) {
  return JSON.stringify({ app: 'coach-fc-27', version: 1, exportedAt: new Date().toISOString(), matches }, null, 1);
}

export function parseImport(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data.matches;
  if (!Array.isArray(list)) throw new Error('format');
  return list.map(sanitizeMatch).filter(Boolean);
}
